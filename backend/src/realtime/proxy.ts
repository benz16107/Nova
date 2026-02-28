import type { IncomingMessage } from "http";
import type { Socket } from "net";
import WebSocket from "ws";
import { prisma } from "../db.js";
import { isRoomUnlocked } from "../roomUnlock.js";
import { addMemory, ensureThreadForGuest, getMemoriesForGuest, memorySummary } from "../backboard.js";
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
    description: "Log a guest request or complaint. CRITICAL: If the guest expresses dissatisfaction, annoyance, or reports something broken/dirty/missing (e.g. 'AC is broken', 'room is dirty', 'noise next door'), you MUST set type to 'complaint'. If they just want something standard (e.g. 'can I have more towels', 'room service'), set type to 'request'. After calling, always confirm to the guest that it was logged.",
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
    description: "Get the hotel WiFi network name and password. After calling, always tell the guest the network and password out loud.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "request_amenity",
    description: "Log a request for an amenity (e.g. extra towels, pillows). After calling, always confirm to the guest that the request was logged.",
    parameters: {
      type: "object",
      properties: { item: { type: "string" } },
      required: ["item"],
    },
  },
  {
    type: "function" as const,
    name: "store_preference",
    description: "Store a guest's preference or detail to remember for their stay (e.g. 'I'm allergic to peanuts', 'I prefer a firm pillow', 'It's my anniversary'). Use this when the guest shares information that isn't an actionable request but should be remembered. After calling, acknowledge they said it.",
    parameters: {
      type: "object",
      properties: { preference: { type: "string", description: "The preference to remember" } },
      required: ["preference"],
    },
  },
  {
    type: "function" as const,
    name: "submit_feedback",
    description: "Record checkout feedback from the guest (e.g. how was their stay, any last comments). Use when the guest wants to leave feedback, especially at checkout. After calling, thank them and confirm it was recorded.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The guest's feedback text" },
        source: { type: "string", enum: ["text", "voice"], description: "How the guest gave the feedback" },
      },
      required: ["content"],
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
    console.log(`[Realtime] New connection: guestToken=${guestToken}, outputMode=${outputMode}`);
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
    const roomUnlocked = await isRoomUnlocked(guest.room.roomId);
    if (!roomUnlocked) {
      clientWs.close(4003, "Room key not scanned at door yet");
      return;
    }
    const ctx = { guestId: guest.id, roomId: guest.room.roomId };
    await ensureThreadForGuest(guest.id);
    const memories = await getMemoriesForGuest(guest.id);
    const memoryText = memorySummary(memories);
    const contextLine = `Current guest (the person you are speaking with): ${guest.firstName}, Room ${guest.room.roomId}. Only use memories and preferences for this guest—do not attribute requests or preferences from other people in the room to ${guest.firstName}. ${memoryText}`;
    const requestPolicyLine = "CRITICAL REQUEST POLICY: If the guest asks for service, reports an issue, or complains, you MUST call either log_request or request_amenity before you respond in natural language.";

    // Pending manager replies: deliver first thing when guest opens Nova, then mark as shown
    const pendingReplies = await prisma.request.findMany({
      where: { guestId: guest.id, managerReply: { not: null }, managerReplyShownAt: null },
      select: { id: true, managerReply: true, type: true },
    });
    const requestIdsToMarkShown: string[] = pendingReplies.map((r) => r.id);
    // Build phrase per reply: "The managers have left a message for your last request: \"...\"" or "...complaint: \"...\""
    const managerPhrases =
      pendingReplies
        .filter((r) => r.managerReply != null && String(r.managerReply).trim() !== "")
        .map((r) => {
          const label = r.type === "complaint" ? "complaint" : "request";
          const msg = String(r.managerReply).trim();
          return `The managers have left a message for your last ${label}: "${msg}"`;
        });
    const managerMessageText = managerPhrases.join(" ");

    const instructionsWithWelcome: string =
      WELCOME_MESSAGE.trim() === ""
        ? INSTRUCTIONS + "\n\n" + requestPolicyLine + "\n\n" + contextLine
        : INSTRUCTIONS + "\n\nWhen the conversation starts, say this welcome out loud first, then wait for the guest: \"" + WELCOME_MESSAGE.trim() + "\"\n\n" + requestPolicyLine + "\n\n" + contextLine;

    const apiKey = getOpenAiKey();
    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: "error", error: "Realtime not configured. Add OPENAI_API_KEY to backend/.env and restart the backend." }));
      clientWs.close();
      return;
    }

    const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const handledToolCalls = new Set<string>();
    const rememberGuestUtterance = (text: string) => {
      const content = text.trim();
      if (!content) return;
      const clipped = content.length > 320 ? `${content.slice(0, 320)}…` : content;
      addMemory(ctx.guestId, ctx.roomId, `Guest said: ${clipped}`).catch(() => { });
    };

    const executeToolCall = (name: string, args: string | undefined, callId: string | undefined) => {
      if (callId && handledToolCalls.has(callId)) return;
      if (callId) handledToolCalls.add(callId);

      let toolArgs: Record<string, unknown> = {};
      try {
        if (args) toolArgs = JSON.parse(args);
      } catch { }

      console.log(`[Realtime] 🔧 Tool call: ${name}`, JSON.stringify(toolArgs));
      runTool(name, toolArgs, ctx)
        .then((output) => {
          if (callId) {
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
            openaiWs.send(JSON.stringify({ type: "response.create" }));
          }
        })
        .catch((err) => {
          if (callId) {
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
            openaiWs.send(JSON.stringify({ type: "response.create" }));
          }
        });
    };

    openaiWs.on("open", () => {
      openaiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: outputMode === "text" ? ["text"] : ["audio"],
            instructions: instructionsWithWelcome,
            tools: TOOLS,
            tool_choice: "auto",
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
      let parsed: { type?: string;[k: string]: unknown };
      try {
        parsed = JSON.parse(msg);
      } catch {
        clientWs.send(data);
        return;
      }
      const ev = parsed as { type: string; call_id?: string; name?: string; arguments?: string };
      const shouldTriggerFirstResponse = WELCOME_MESSAGE.trim() !== "" || managerMessageText.length > 0;
      if (ev.type === "session.updated") {
        console.log(`[Realtime] Session updated OK for guest ${ctx.guestId} (tools: ${TOOLS.length}, tool_choice: auto)`);
      }
      if (ev.type === "session.updated" && shouldTriggerFirstResponse && !welcomeSent) {
        welcomeSent = true;
        // If there's a manager message, inject it as a user turn so the model is explicitly asked to deliver it
        if (managerMessageText.length > 0) {
          const deliverInstruction =
            "Say the following to the guest exactly as written (it tells them the managers replied to their request or complaint), then give your usual welcome: " +
            JSON.stringify(managerPhrases.join(" "));
          openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: deliverInstruction }],
              },
            })
          );
        }
        openaiWs.send(JSON.stringify({ type: "response.create" }));
      }
      if (ev.type === "response.done") {
        const responseData = (parsed as any).response;
        // Mark pending manager replies as shown
        if (requestIdsToMarkShown.length > 0) {
          const ids = [...requestIdsToMarkShown];
          requestIdsToMarkShown.length = 0;
          const now = new Date();
          prisma.request.updateMany({ where: { id: { in: ids } }, data: { managerReplyShownAt: now } }).catch(() => { });
        }

        // Execute function calls
        if (responseData && responseData.output) {
          for (const item of responseData.output) {
            if (item.type === "function_call") {
              const { name, arguments: args, call_id: callId } = item;
              if (name) executeToolCall(name, args, callId);
            }
          }
        }
      }

      if (ev.type === "response.function_call_arguments.done") {
        const fnName = (parsed as any).name as string | undefined;
        const fnArgs = (parsed as any).arguments as string | undefined;
        const callId = (parsed as any).call_id as string | undefined;
        if (fnName) executeToolCall(fnName, fnArgs, callId);
      }

      if (ev.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = String((parsed as any).transcript ?? "").trim();
        if (transcript) rememberGuestUtterance(transcript);
      }
      clientWs.send(msg);
    });

    clientWs.on("message", (data: Buffer) => {
      if (openaiWs.readyState !== WebSocket.OPEN) return;
      const str = data.toString();
      try {
        const parsed = JSON.parse(str) as { type?: string; text?: string; audio?: string };
        if (parsed.type === "guest_text" && typeof parsed.text === "string" && parsed.text.trim()) {
          rememberGuestUtterance(parsed.text);
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
