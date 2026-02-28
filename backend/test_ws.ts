import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3000/api/realtime/connect?guestId=seed-guest-301&output_mode=text");

ws.on("open", () => {
    console.log("Connected");
    setTimeout(() => {
        console.log("Sending message...");
        ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "I would like some extra towels. Also my AC is broken. Also I am allergic to peanuts." }]
            }
        }));
        ws.send(JSON.stringify({ type: "response.create" }));
    }, 2000);
});

let transcript = "";
ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString());
    if (parsed.type === "response.output_text.delta" || parsed.type === "response.audio_transcript.delta" || parsed.type === "response.output_audio_transcript.delta") {
        transcript += parsed.delta;
    }
    if (parsed.type === "response.done") {
        console.log("AI SAID:", transcript);
        transcript = "";
    }
    if (parsed.type === "response.function_call_arguments.done") {
        console.log("AI CALLED A TOOL:", parsed);
        process.exit(0);
    }
});

ws.on("error", console.error);
ws.on("close", () => console.log("Closed"));
