import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3000/api/realtime/connect?guestId=seed-guest-301&output_mode=voice");

ws.on("open", () => {
    console.log("Connected");
    setTimeout(() => {
        console.log("Sending message...");
        ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "Please use the get_wifi_info tool immediately." }]
            }
        }));
        ws.send(JSON.stringify({ type: "response.create" }));
    }, 2000);
});

let doneCount = 0;
ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString());
    if (parsed.type === "response.done") {
        doneCount++;
        if (doneCount === 2) {
            console.log("RESPONSE DONE:", JSON.stringify(parsed, null, 2));
            process.exit(0);
        }
    }
});

ws.on("error", console.error);
ws.on("close", () => console.log("Closed"));
