import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend/.env"),
];
let loaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: true });
    if (result.error) console.warn("dotenv error:", result.error.message);
    else loaded = true;
    break;
  }
}
if (!loaded) console.warn("No .env found at:", envPaths.join(" or "));

import http from "http";
import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { guestsRouter } from "./routes/guests.js";
import { roomsRouter } from "./routes/rooms.js";
import { nfcRouter } from "./routes/nfc.js";
import { meRouter } from "./routes/me.js";
import { requestsRouter, complaintsRouter } from "./routes/requests.js";
import { authRouter } from "./routes/auth.js";
import { memoriesRouter } from "./routes/memories.js";
import { aiRouter } from "./routes/ai.js";
import { settingsRouter } from "./routes/settings.js";
import { feedbackRouter } from "./routes/feedback.js";
import { attachRealtimeWebSocket } from "./realtime/proxy.js";
import { checkBackboardConnection } from "./backboard.js";
import { BACKBOARD_MEMORY_ENABLED } from "../../nova-config.js";

const app = express();
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 2000,
  message: { error: "Too many requests" },
  standardHeaders: true,
});
app.use("/api", apiLimiter);

const nfcLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many NFC reads" },
});
app.use("/api/nfc", nfcLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts" },
});
app.use("/api/auth", authLimiter);

app.use("/api/auth", authRouter);
app.use("/api/guests", guestsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/nfc", nfcRouter);
app.use("/api/me", meRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/complaints", complaintsRouter);
app.use("/api/memories", memoriesRouter);
app.use("/api/ai", aiRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/feedback", feedbackRouter);

// Ensure API always returns JSON on errors (e.g. unhandled rejections in async routes)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API error]", err);
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message });
});

const server = http.createServer(app);
attachRealtimeWebSocket(server);

const PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 5;

function tryListen(port: number): void {
  if (port > PORT + MAX_PORT_ATTEMPTS - 1) {
    console.error(`Port ${PORT} to ${PORT + MAX_PORT_ATTEMPTS - 1} are in use. Free one with: kill $(lsof -t -i:${PORT})`);
    process.exit(1);
  }
  const onError = (err: NodeJS.ErrnoException) => {
    server.off("error", onError);
    if (err.code === "EADDRINUSE") {
      tryListen(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  };
  server.once("error", onError);
  server.listen(port, () => {
    server.off("error", onError);
    console.log(`Server listening on http://localhost:${port}`);
    if (port !== PORT) console.log(`(Port ${PORT} was in use; using ${port}. Set PORT=${port} in .env or free 3000 with: kill $(lsof -t -i:3000))`);
    console.log(`OPENAI_API_KEY loaded: ${process.env.OPENAI_API_KEY ? "yes" : "no"}`);
    if (!BACKBOARD_MEMORY_ENABLED) {
      console.log("Backboard: disabled in config (memory off)");
    } else {
      checkBackboardConnection().then(({ ok }) => {
        if (ok) {
          console.log("Backboard: connected, memory on");
        } else if (process.env.BACKBOARD_API_KEY) {
          console.log("Backboard: connection failed or no assistant (memory off)");
        } else {
          console.log("Backboard: not configured (memory off)");
        }
      });
    }
  });
}

tryListen(PORT);
