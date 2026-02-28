"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRealtimeWebSocket = attachRealtimeWebSocket;
const ws_1 = __importDefault(require("ws"));
const db_js_1 = require("../db.js");
const roomUnlock_js_1 = require("../roomUnlock.js");
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
    {
        type: "function",
        name: "store_preference",
        description: "Store a guest's preference or detail to remember for their stay (e.g. 'I'm allergic to peanuts', 'I prefer a firm pillow', 'It's my anniversary'). Use this when the guest shares information that isn't an actionable request but should be remembered. After calling, acknowledge they said it.",
        parameters: {
            type: "object",
            properties: { preference: { type: "string", description: "The preference to remember" } },
            required: ["preference"],
        },
    },
    {
        type: "function",
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
        console.log(`[Realtime] New connection: guestToken=${guestToken}, outputMode=${outputMode}`);
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
        const roomUnlocked = await (0, roomUnlock_js_1.isRoomUnlocked)(guest.room.roomId);
        if (!roomUnlocked) {
            clientWs.close(4003, "Room key not scanned at door yet");
            return;
        }
        const ctx = { guestId: guest.id, roomId: guest.room.roomId };
        await (0, backboard_js_1.ensureThreadForGuest)(guest.id);
        const memories = await (0, backboard_js_1.getMemoriesForGuest)(guest.id);
        const memoryText = (0, backboard_js_1.memorySummary)(memories);
        const contextLine = `Current guest (the person you are speaking with): ${guest.firstName}, Room ${guest.room.roomId}. Only use memories and preferences for this guest—do not attribute requests or preferences from other people in the room to ${guest.firstName}. ${memoryText}`;
        const requestPolicyLine = "CRITICAL REQUEST POLICY: If the guest asks for service, reports an issue, or complains, you MUST call either log_request or request_amenity before you respond in natural language.";
        // Pending manager replies: deliver first thing when guest opens Nova, then mark as shown
        const pendingReplies = await db_js_1.prisma.request.findMany({
            where: { guestId: guest.id, managerReply: { not: null }, managerReplyShownAt: null },
            select: { id: true, managerReply: true, type: true },
        });
        const requestIdsToMarkShown = pendingReplies.map((r) => r.id);
        // Build phrase per reply: "The managers have left a message for your last request: \"...\"" or "...complaint: \"...\""
        const managerPhrases = pendingReplies
            .filter((r) => r.managerReply != null && String(r.managerReply).trim() !== "")
            .map((r) => {
            const label = r.type === "complaint" ? "complaint" : "request";
            const msg = String(r.managerReply).trim();
            return `The managers have left a message for your last ${label}: "${msg}"`;
        });
        const managerMessageText = managerPhrases.join(" ");
        const instructionsWithWelcome = nova_config_js_1.WELCOME_MESSAGE.trim() === ""
            ? nova_config_js_1.INSTRUCTIONS + "\n\n" + requestPolicyLine + "\n\n" + contextLine
            : nova_config_js_1.INSTRUCTIONS + "\n\nWhen the conversation starts, say this welcome out loud first, then wait for the guest: \"" + nova_config_js_1.WELCOME_MESSAGE.trim() + "\"\n\n" + requestPolicyLine + "\n\n" + contextLine;
        const apiKey = getOpenAiKey();
        if (!apiKey) {
            clientWs.send(JSON.stringify({ type: "error", error: "Realtime not configured. Add OPENAI_API_KEY to backend/.env and restart the backend." }));
            clientWs.close();
            return;
        }
        const openaiWs = new ws_1.default(OPENAI_REALTIME_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const handledToolCalls = new Set();
        const rememberGuestUtterance = (text) => {
            const content = text.trim();
            if (!content)
                return;
            const clipped = content.length > 320 ? `${content.slice(0, 320)}…` : content;
            (0, backboard_js_1.addMemory)(ctx.guestId, ctx.roomId, `Guest said: ${clipped}`).catch(() => { });
        };
        const executeToolCall = (name, args, callId) => {
            if (callId && handledToolCalls.has(callId))
                return;
            if (callId)
                handledToolCalls.add(callId);
            let toolArgs = {};
            try {
                if (args)
                    toolArgs = JSON.parse(args);
            }
            catch { }
            console.log(`[Realtime] 🔧 Tool call: ${name}`, JSON.stringify(toolArgs));
            (0, tools_js_1.runTool)(name, toolArgs, ctx)
                .then((output) => {
                if (callId) {
                    openaiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            call_id: callId,
                            output,
                        },
                    }));
                    openaiWs.send(JSON.stringify({ type: "response.create" }));
                }
            })
                .catch((err) => {
                if (callId) {
                    openaiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            call_id: callId,
                            output: String(err),
                        },
                    }));
                    openaiWs.send(JSON.stringify({ type: "response.create" }));
                }
            });
        };
        openaiWs.on("open", () => {
            openaiWs.send(JSON.stringify({
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
            const shouldTriggerFirstResponse = nova_config_js_1.WELCOME_MESSAGE.trim() !== "" || managerMessageText.length > 0;
            if (ev.type === "session.updated") {
                console.log(`[Realtime] Session updated OK for guest ${ctx.guestId} (tools: ${TOOLS.length}, tool_choice: auto)`);
            }
            if (ev.type === "session.updated" && shouldTriggerFirstResponse && !welcomeSent) {
                welcomeSent = true;
                // If there's a manager message, inject it as a user turn so the model is explicitly asked to deliver it
                if (managerMessageText.length > 0) {
                    const deliverInstruction = "Say the following to the guest exactly as written (it tells them the managers replied to their request or complaint), then give your usual welcome: " +
                        JSON.stringify(managerPhrases.join(" "));
                    openaiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "message",
                            role: "user",
                            content: [{ type: "input_text", text: deliverInstruction }],
                        },
                    }));
                }
                openaiWs.send(JSON.stringify({ type: "response.create" }));
            }
            if (ev.type === "response.done") {
                const responseData = parsed.response;
                // Mark pending manager replies as shown
                if (requestIdsToMarkShown.length > 0) {
                    const ids = [...requestIdsToMarkShown];
                    requestIdsToMarkShown.length = 0;
                    const now = new Date();
                    db_js_1.prisma.request.updateMany({ where: { id: { in: ids } }, data: { managerReplyShownAt: now } }).catch(() => { });
                }
                // Execute function calls
                if (responseData && responseData.output) {
                    for (const item of responseData.output) {
                        if (item.type === "function_call") {
                            const { name, arguments: args, call_id: callId } = item;
                            if (name)
                                executeToolCall(name, args, callId);
                        }
                    }
                }
            }
            if (ev.type === "response.function_call_arguments.done") {
                const fnName = parsed.name;
                const fnArgs = parsed.arguments;
                const callId = parsed.call_id;
                if (fnName)
                    executeToolCall(fnName, fnArgs, callId);
            }
            if (ev.type === "conversation.item.input_audio_transcription.completed") {
                const transcript = String(parsed.transcript ?? "").trim();
                if (transcript)
                    rememberGuestUtterance(transcript);
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
                    rememberGuestUtterance(parsed.text);
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
