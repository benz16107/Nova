// Replaces test_err.ts, test_ws.ts and test_ws3.ts: drives the Realtime proxy against a local
// fake OpenAI upstream instead of the live API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import { useFreshDb } from "./db.mjs";

useFreshDb();
delete process.env.BACKBOARD_API_KEY;

const upstream = new WebSocketServer({ port: 0 });
const upstreamUrls: string[] = [];
upstream.on("connection", (_ws, req) => upstreamUrls.push(req.url ?? ""));
process.env.OPENAI_REALTIME_BASE_URL = `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1/realtime`;
process.env.OPENAI_API_KEY = "sk-test";

const { prisma } = await import("../src/db.js");
const { unlockRoom } = await import("../src/roomUnlock.js");
const { attachRealtimeWebSocket } = await import("../src/realtime/proxy.js");
const { MODEL } = await import("../../nova-config.js");

const server = http.createServer();
attachRealtimeWebSocket(server);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/realtime/connect`;

let guestId = "";
before(async () => {
  const room = await prisma.room.create({ data: { roomId: "301" } });
  const guest = await prisma.guest.create({
    data: { firstName: "Ada", lastName: "Test", roomId: room.id, checkedIn: true },
  });
  guestId = guest.id;
  await unlockRoom("301");
});

after(() => {
  server.close();
  upstream.close();
});

type Msg = { type: string; [k: string]: any };

/** Collects JSON messages from a socket and lets a test await the next one matching a predicate. */
function inbox(ws: WebSocket) {
  const seen: Msg[] = [];
  const waiters: { pred: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  ws.on("message", (data) => {
    const m = JSON.parse(data.toString()) as Msg;
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else seen.push(m);
  });
  return (pred: (m: Msg) => boolean) =>
    new Promise<Msg>((resolve) => {
      const i = seen.findIndex(pred);
      if (i >= 0) resolve(seen.splice(i, 1)[0]);
      else waiters.push({ pred, resolve });
    });
}

function nextUpstream() {
  return new Promise<{ ws: WebSocket; next: ReturnType<typeof inbox> }>((resolve) =>
    upstream.once("connection", (ws) => resolve({ ws, next: inbox(ws) })),
  );
}

function closeCode(ws: WebSocket) {
  return new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
}

test("rejects unknown guests with 4004", async () => {
  assert.equal(await closeCode(new WebSocket(`${base}?guest_token=nobody`)), 4004);
});

test("sends a GA session.update and relays a tool call round-trip", async () => {
  const up = nextUpstream();
  const client = new WebSocket(`${base}?guest_token=${guestId}&output_mode=text`);
  const fromProxy = inbox(client);
  const { ws: openai, next: fromClient } = await up;

  assert.equal(upstreamUrls.at(-1), `/v1/realtime?model=${encodeURIComponent(MODEL)}`);

  const update = await fromClient((m) => m.type === "session.update");
  assert.equal(update.session.type, "realtime");
  assert.deepEqual(update.session.output_modalities, ["text"]);
  assert.deepEqual(update.session.audio.input.format, { type: "audio/pcm", rate: 24000 });
  assert.equal(update.session.audio.input.turn_detection.type, "server_vad");
  assert.deepEqual(
    update.session.tools.map((t: Msg) => t.name),
    ["log_request", "get_wifi_info", "request_amenity", "store_preference", "submit_feedback"],
  );
  assert.match(update.session.instructions, /Current guest .*Ada, Room 301/);

  // session.updated is forwarded to the client and triggers the welcome response.
  openai.send(JSON.stringify({ type: "session.updated", session: {} }));
  await fromProxy((m) => m.type === "session.updated");
  await fromClient((m) => m.type === "response.create");

  // A function call in response.done runs the tool and returns its output upstream.
  openai.send(JSON.stringify({
    type: "response.done",
    response: { output: [{ type: "function_call", name: "get_wifi_info", arguments: "{}", call_id: "call_1" }] },
  }));
  const output = await fromClient((m) => m.type === "conversation.item.create" && m.item.type === "function_call_output");
  assert.equal(output.item.call_id, "call_1");
  assert.match(output.item.output, /WiFi network is/);
  await fromClient((m) => m.type === "response.create");

  // guest_text from the app becomes a user message plus response.create.
  client.send(JSON.stringify({ type: "guest_text", text: " I need towels " }));
  const item = await fromClient((m) => m.type === "conversation.item.create" && m.item.type === "message");
  assert.deepEqual(item.item.content, [{ type: "input_text", text: "I need towels" }]);
  await fromClient((m) => m.type === "response.create");

  client.close();
});

test("reports a missing OPENAI_API_KEY to the client", async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const client = new WebSocket(`${base}?guest_token=${guestId}`);
    const msg = await inbox(client)((m) => m.type === "error");
    assert.match(msg.error, /OPENAI_API_KEY/);
  } finally {
    process.env.OPENAI_API_KEY = key;
  }
});
