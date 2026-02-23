"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const envPaths = [
    path_1.default.resolve(process.cwd(), ".env"),
    path_1.default.resolve(process.cwd(), "backend/.env"),
];
let loaded = false;
for (const envPath of envPaths) {
    if (fs_1.default.existsSync(envPath)) {
        const result = dotenv_1.default.config({ path: envPath, override: true });
        if (result.error)
            console.warn("dotenv error:", result.error.message);
        else
            loaded = true;
        break;
    }
}
if (!loaded)
    console.warn("No .env found at:", envPaths.join(" or "));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = require("express-rate-limit");
const guests_js_1 = require("./routes/guests.js");
const rooms_js_1 = require("./routes/rooms.js");
const nfc_js_1 = require("./routes/nfc.js");
const me_js_1 = require("./routes/me.js");
const requests_js_1 = require("./routes/requests.js");
const auth_js_1 = require("./routes/auth.js");
const memories_js_1 = require("./routes/memories.js");
const ai_js_1 = require("./routes/ai.js");
const settings_js_1 = require("./routes/settings.js");
const proxy_js_1 = require("./realtime/proxy.js");
const backboard_js_1 = require("./backboard.js");
const nova_config_js_1 = require("../../nova-config.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const apiLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 2000,
    message: { error: "Too many requests" },
    standardHeaders: true,
});
app.use("/api", apiLimiter);
const nfcLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "Too many NFC reads" },
});
app.use("/api/nfc", nfcLimiter);
const authLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "Too many login attempts" },
});
app.use("/api/auth", authLimiter);
app.use("/api/auth", auth_js_1.authRouter);
app.use("/api/guests", guests_js_1.guestsRouter);
app.use("/api/rooms", rooms_js_1.roomsRouter);
app.use("/api/nfc", nfc_js_1.nfcRouter);
app.use("/api/me", me_js_1.meRouter);
app.use("/api/requests", requests_js_1.requestsRouter);
app.use("/api/complaints", requests_js_1.complaintsRouter);
app.use("/api/memories", memories_js_1.memoriesRouter);
app.use("/api/ai", ai_js_1.aiRouter);
app.use("/api/settings", settings_js_1.settingsRouter);
// Ensure API always returns JSON on errors (e.g. unhandled rejections in async routes)
app.use((err, _req, res, _next) => {
    console.error("[API error]", err);
    if (res.headersSent)
        return;
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
});
const server = http_1.default.createServer(app);
(0, proxy_js_1.attachRealtimeWebSocket)(server);
const PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 5;
function tryListen(port) {
    if (port > PORT + MAX_PORT_ATTEMPTS - 1) {
        console.error(`Port ${PORT} to ${PORT + MAX_PORT_ATTEMPTS - 1} are in use. Free one with: kill $(lsof -t -i:${PORT})`);
        process.exit(1);
    }
    const onError = (err) => {
        server.off("error", onError);
        if (err.code === "EADDRINUSE") {
            tryListen(port + 1);
        }
        else {
            console.error(err);
            process.exit(1);
        }
    };
    server.once("error", onError);
    server.listen(port, () => {
        server.off("error", onError);
        console.log(`Server listening on http://localhost:${port}`);
        if (port !== PORT)
            console.log(`(Port ${PORT} was in use; using ${port}. Set PORT=${port} in .env or free 3000 with: kill $(lsof -t -i:3000))`);
        console.log(`OPENAI_API_KEY loaded: ${process.env.OPENAI_API_KEY ? "yes" : "no"}`);
        if (!nova_config_js_1.BACKBOARD_MEMORY_ENABLED) {
            console.log("Backboard: disabled in config (memory off)");
        }
        else {
            (0, backboard_js_1.checkBackboardConnection)().then(({ ok }) => {
                if (ok) {
                    console.log("Backboard: connected, memory on");
                }
                else if (process.env.BACKBOARD_API_KEY) {
                    console.log("Backboard: connection failed or no assistant (memory off)");
                }
                else {
                    console.log("Backboard: not configured (memory off)");
                }
            });
        }
    });
}
tryListen(PORT);
