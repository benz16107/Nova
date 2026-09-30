// Replaces test_bb.ts, test_mem.ts and test_mem2.ts: Backboard memory calls with fetch mocked.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useFreshDb } from "./db.mjs";

useFreshDb();
process.env.BACKBOARD_API_KEY = "test-key";
process.env.BACKBOARD_ASSISTANT_ID = "asst_1";
process.env.BACKBOARD_API_BASE = "https://backboard.test/api";

const { addMemory, getMemoriesForGuest, getMemoriesForRoom, memorySummary } = await import("../src/backboard.js");

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
let calls: Call[] = [];
let reply: unknown = {};

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body as string });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
});

test("addMemory posts content with guest and room metadata", async () => {
  await addMemory("guest-301", "301", "Guest prefers extra pillows");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://backboard.test/api/assistants/asst_1/memories");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers["X-API-Key"], "test-key");
  assert.deepEqual(JSON.parse(calls[0].body!), {
    content: "Guest prefers extra pillows",
    metadata: { guest_id: "guest-301", room_id: "301" },
  });
});

test("getMemoriesForGuest keeps only that guest's memories", async () => {
  reply = {
    memories: [
      { content: "Request: towels", metadata: { guest_id: "g1", room_id: "301" } },
      { content: "Request: iron", metadata: { guest_id: "g2", room_id: "301" } },
      { content: "no metadata" },
    ],
  };
  assert.deepEqual(await getMemoriesForGuest("g1"), ["Request: towels"]);
  assert.deepEqual(await getMemoriesForRoom("301"), [
    { guestId: "g1", content: "Request: towels" },
    { guestId: "g2", content: "Request: iron" },
  ]);
});

test("getMemoriesForGuest returns [] when Backboard fails", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  assert.deepEqual(await getMemoriesForGuest("g1"), []);
});

test("memorySummary lists the newest memories oldest-first", () => {
  assert.equal(memorySummary([]), "No prior requests or complaints this stay.");
  assert.equal(
    memorySummary(["newest", "middle", "oldest"]),
    "Past during this stay (chronological order): oldest; middle; newest",
  );
  const many = Array.from({ length: 15 }, (_, i) => `m${i}`);
  assert.ok(memorySummary(many).endsWith("m9; m8; m7; m6; m5; m4; m3; m2; m1; m0"));
});
