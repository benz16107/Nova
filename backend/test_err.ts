import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3000/api/realtime/connect?guestId=seed-guest-101a&output_mode=voice");

ws.on("open", () => {
    console.log("Connected to local backend proxy");
});

ws.on("message", (data) => {
    const str = data.toString();
    const parsed = JSON.parse(str);
    if (parsed.type === "error") {
        console.error("PROXY ERROR", JSON.stringify(parsed, null, 2));
        process.exit(1);
    }
    if (parsed.type === "session.updated") {
        console.log("Session update SUCCESSFUL");
        process.exit(0);
    }
});

ws.on("error", console.error);
ws.on("close", () => console.log("Closed"));
