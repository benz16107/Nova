"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRealtimeWebSocket = attachRealtimeWebSocket;
const ws_1 = __importDefault(require("ws"));
const db_js_1 = require("../db.js");
const backboard_js_1 = require("../backboard.js");
const tools_js_1 = require("./tools.js");
const nova_config_js_1 = require("../../../nova-config.js");
function getOpenAiKey() {
    const k = process.env.OPENAI_API_KEY;
    return typeof k === "string" && k.trim().length > 0 ? k.trim() : undefined;
}
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(nova_config_js_1.MODEL)}`;
const TOOLS = [
    {
        type: "function",
        name: "log_request",
        description: "Log a guest request or complaint. Use for any request (e.g. towels, room service) or complaint. After calling, always confirm to the guest that it was logged.",
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
        type: "function",
        name: "get_wifi_info",
        description: "Get the hotel WiFi network name and password. After calling, always tell the guest the network and password out loud.",
        parameters: { type: "object", properties: {} },
    },
    {
        type: "function",
        name: "request_amenity",
        description: "Log a request for an amenity (e.g. extra towels, pillows). After calling, always confirm to the guest that the request was logged.",
        parameters: {
            type: "object",
            properties: { item: { type: "string" } },
            required: ["item"],
        },
    },
];
function attachRealtimeWebSocket(server) {
    const wss = new ws_1.default.Server({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
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
        wss.handleUpgrade(request, socket, head, (clientWs) => {
            wss.emit("connection", clientWs, request, guestToken, outputMode);
        });
    });
    wss.on("connection", async (clientWs, _req, guestToken, outputMode = "voice") => {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: guestToken },
            include: { room: true },
        });
        if (!guest) {
            clientWs.close(4004, "Guest not found");
            return;
        }
        const g = guest;
        if (g.checkedOut) {
            clientWs.close(4003, "Account disabled");
            return;
        }
        if (!g.checkedIn) {
            clientWs.close(4003, "Not checked in");
            return;
        }
        const ctx = { guestId: guest.id, roomId: guest.room.roomId };
        await (0, backboard_js_1.ensureThreadForGuest)(guest.id);
        const memories = await (0, backboard_js_1.getMemoriesForGuest)(guest.id);
        const memoryText = (0, backboard_js_1.memorySummary)(memories);
        const contextLine = `Current guest: ${guest.firstName}, Room ${guest.room.roomId}. ${memoryText}`;
        const instructionsWithWelcome = nova_config_js_1.WELCOME_MESSAGE.trim() === ""
            ? nova_config_js_1.INSTRUCTIONS + "\n\n" + contextLine
            : nova_config_js_1.INSTRUCTIONS + "\n\nWhen the conversation starts, say this welcome out loud first, then wait for the guest: \"" + nova_config_js_1.WELCOME_MESSAGE.trim() + "\"\n\n" + contextLine;
        const apiKey = getOpenAiKey();
        if (!apiKey) {
            clientWs.send(JSON.stringify({ type: "error", error: "Realtime not configured. Add OPENAI_API_KEY to backend/.env and restart the backend." }));
            clientWs.close();
            return;
        }
        const openaiWs = new ws_1.default(OPENAI_REALTIME_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        openaiWs.on("open", () => {
            openaiWs.send(JSON.stringify({
                type: "session.update",
                session: {
                    type: "realtime",
                    output_modalities: outputMode === "text" ? ["text"] : ["audio"],
                    instructions: instructionsWithWelcome,
                    tools: TOOLS,
                    audio: {
                        input: {
                            format: { type: "audio/pcm", rate: 24000 },
                            transcription: nova_config_js_1.INPUT_LANGUAGE
                                ? { model: "whisper-1", language: nova_config_js_1.INPUT_LANGUAGE }
                                : { model: "whisper-1" },
                            turn_detection: {
                                type: "server_vad",
                                threshold: nova_config_js_1.TURN_THRESHOLD,
                                prefix_padding_ms: nova_config_js_1.TURN_PREFIX_MS,
                                silence_duration_ms: nova_config_js_1.TURN_SILENCE_MS,
                            },
                        },
                        output: {
                            format: { type: "audio/pcm", rate: 24000 },
                            voice: nova_config_js_1.VOICE,
                        },
                    },
                },
            }));
        });
        let welcomeSent = false;
        openaiWs.on("message", (data) => {
            const msg = data.toString();
            let parsed;
            try {
                parsed = JSON.parse(msg);
            }
            catch {
                clientWs.send(data);
                return;
            }
            const ev = parsed;
            if (ev.type === "session.updated" && nova_config_js_1.WELCOME_MESSAGE.trim() !== "" && !welcomeSent) {
                welcomeSent = true;
                openaiWs.send(JSON.stringify({ type: "response.create" }));
            }
            if (ev.type === "response.function_call_arguments.done") {
                const args = ev.arguments;
                const name = parsed.name;
                const callId = parsed.call_id;
                if (name && callId != null) {
                    let toolArgs = {};
                    try {
                        if (args)
                            toolArgs = JSON.parse(args);
                    }
                    catch { }
                    (0, tools_js_1.runTool)(name, toolArgs, ctx)
                        .then((output) => {
                        openaiWs.send(JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                type: "function_call_output",
                                call_id: callId,
                                output,
                            },
                        }));
                        // Request the model to generate a response (voice or text) so the guest hears/sees confirmation
                        openaiWs.send(JSON.stringify({ type: "response.create" }));
                    })
                        .catch((err) => {
                        openaiWs.send(JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                type: "function_call_output",
                                call_id: callId,
                                output: String(err),
                            },
                        }));
                        openaiWs.send(JSON.stringify({ type: "response.create" }));
                    });
                    return;
                }
            }
            clientWs.send(msg);
        });
        clientWs.on("message", (data) => {
            if (openaiWs.readyState !== ws_1.default.OPEN)
                return;
            const str = data.toString();
            try {
                const parsed = JSON.parse(str);
                if (parsed.type === "guest_text" && typeof parsed.text === "string" && parsed.text.trim()) {
                    openaiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "message",
                            role: "user",
                            content: [{ type: "input_text", text: parsed.text.trim() }],
                        },
                    }));
                    openaiWs.send(JSON.stringify({ type: "response.create" }));
                    return;
                }
                if (parsed.type === "input_audio_buffer.append" && parsed.audio) {
                    openaiWs.send(str);
                    return;
                }
                openaiWs.send(str);
            }
            catch {
                openaiWs.send(str);
            }
        });
        openaiWs.on("close", () => clientWs.close());
        openaiWs.on("error", () => clientWs.close());
        clientWs.on("close", () => openaiWs.close());
        clientWs.on("error", () => openaiWs.close());
    });
}
