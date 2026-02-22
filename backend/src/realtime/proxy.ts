import type { IncomingMessage } from "http";
import type { Socket } from "net";
import WebSocket from "ws";
import { prisma } from "../db.js";
import { ensureThreadForGuest, getMemoriesForGuest, memorySummary } from "../backboard.js";
import { runTool } from "./tools.js";
import { INSTRUCTIONS, MODEL, VOICE, INPUT_LANGUAGE, TURN_THRESHOLD, TURN_SILENCE_MS, TURN_PREFIX_MS, WELCOME_MESSAGE } from "../../../nova-config.js";

function getOpenAiKey(): string | undefined {
  const k = process.env.OPENAI_API_KEY;
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : undefined;
}

const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`;

const TOOLS = [
  {
    type: "function" as const,
    name: "log_request",
    description: "Log a guest request or complaint. Use for any request (e.g. towels, room service) or complaint.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["request", "complaint"] },
        description: { type: "string" },
      },
      required: ["type", "description"],
    },
  },
  {
    type: "function" as const,
    name: "get_wifi_info",
    description: "Get the hotel WiFi network name and password.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "request_amenity",
    description: "Log a request for an amenity (e.g. extra towels, pillows).",
    parameters: {
      type: "object",
      properties: { item: { type: "string" } },
      required: ["item"],
    },
  },
];

export function attachRealtimeWebSocket(server: import("http").Server): void {
  const wss = new WebSocket.Server({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);
    if (url.pathname !== "/api/realtime/connect") {
      socket.destroy();
      return;
    }
    const guestToken = url.searchParams.get("guest_token") ?? url.searchParams.get("guestId");
    if (!guestToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const outputMode = url.searchParams.get("output_mode") === "text" ? "text" : "voice";
    wss.handleUpgrade(request, socket, head, (clientWs: WebSocket) => {
      wss.emit("connection", clientWs, request, guestToken, outputMode);
    });
  });

  wss.on("connection", async (clientWs: WebSocket, _req: unknown, guestToken: string, outputMode: "text" | "voice" = "voice") => {
    const guest = await prisma.guest.findUnique({
      where: { id: guestToken },
      include: { room: true },
    });
    if (!guest) {
      clientWs.close(4004, "Guest not found");
      return;
    }
    const g = guest as { checkedIn?: boolean; checkedOut?: boolean };
    if (g.checkedOut) {
      clientWs.close(4003, "Account disabled");
      return;
    }
    if (!g.checkedIn) {
      clientWs.close(4003, "Not checked in");
      return;
    }
    const ctx = { guestId: guest.id, roomId: guest.room.roomId };
    await ensureThreadForGuest(guest.id);
    const memories = await getMemoriesForGuest(guest.id);
    const memoryText = memorySummary(memories);
    const contextLine = `Current guest: ${guest.firstName}, Room ${guest.room.roomId}. ${memoryText}`;
    const instructionsWithWelcome =
      WELCOME_MESSAGE.trim() === ""
        ? INSTRUCTIONS + "\n\n" + contextLine
        : INSTRUCTIONS + "\n\nWhen the conversation starts, say this welcome out loud first, then wait for the guest: \"" + WELCOME_MESSAGE.trim() + "\"\n\n" + contextLine;

    const apiKey = getOpenAiKey();
    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: "error", error: "Realtime not configured. Add OPENAI_API_KEY to backend/.env and restart the backend." }));
      clientWs.close();
      return;
    }

    const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    openaiWs.on("open", () => {
      openaiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: outputMode === "text" ? ["text"] : ["audio"],
            instructions: instructionsWithWelcome,
            tools: TOOLS,
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: INPUT_LANGUAGE
                  ? { model: "whisper-1", language: INPUT_LANGUAGE }
                  : { model: "whisper-1" },
                turn_detection: {
                  type: "server_vad",
                  threshold: TURN_THRESHOLD,
                  prefix_padding_ms: TURN_PREFIX_MS,
                  silence_duration_ms: TURN_SILENCE_MS,
                },
              },
              output: {
                format: { type: "audio/pcm", rate: 24000 },
                voice: VOICE,
              },
            },
          },
        }),
      );
    });

    let welcomeSent = false;
    openaiWs.on("message", (data: Buffer) => {
      const msg = data.toString();
      let parsed: { type?: string; [k: string]: unknown };
      try {
        parsed = JSON.parse(msg);
      } catch {
        clientWs.send(data);
        return;
      }
      const ev = parsed as { type: string; call_id?: string; name?: string; arguments?: string };
      if (ev.type === "session.updated" && WELCOME_MESSAGE.trim() !== "" && !welcomeSent) {
        welcomeSent = true;
        openaiWs.send(JSON.stringify({ type: "response.create" }));
      }
      if (ev.type === "response.function_call_arguments.done") {
        const args = (ev as { arguments?: string }).arguments;
        const name = (parsed as { name?: string }).name;
        const callId = (parsed as { call_id?: string | null }).call_id;
        if (name && callId != null) {
          let toolArgs: Record<string, unknown> = {};
          try {
            if (args) toolArgs = JSON.parse(args);
          } catch {}
          runTool(name, toolArgs, ctx)
            .then((output) => {
              openaiWs.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output,
                  },
                }),
              );
            })
            .catch((err) => {
              openaiWs.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: String(err),
                  },
                }),
              );
            });
          return;
        }
      }
      clientWs.send(msg);
    });

    clientWs.on("message", (data: Buffer) => {
      if (openaiWs.readyState !== WebSocket.OPEN) return;
      const str = data.toString();
      try {
        const parsed = JSON.parse(str) as { type?: string; text?: string; audio?: string };
        if (parsed.type === "guest_text" && typeof parsed.text === "string" && parsed.text.trim()) {
          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: parsed.text.trim() }],
              },
            }),
          );
          openaiWs.send(JSON.stringify({ type: "response.create" }));
          return;
        }
        if (parsed.type === "input_audio_buffer.append" && parsed.audio) {
          openaiWs.send(str);
          return;
        }
        openaiWs.send(str);
      } catch {
        openaiWs.send(str);
      }
    });

    openaiWs.on("close", () => clientWs.close());
    openaiWs.on("error", () => clientWs.close());
    clientWs.on("close", () => openaiWs.close());
    clientWs.on("error", () => openaiWs.close());
  });
}
