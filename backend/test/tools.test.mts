// Replaces test_tool.ts: runs the Realtime tools against a throwaway database.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { useFreshDb } from "./db.mjs";

useFreshDb();
delete process.env.BACKBOARD_API_KEY; // addMemory becomes a no-op, no network

const { prisma } = await import("../src/db.js");
const { runTool } = await import("../src/realtime/tools.js");

let ctx: { guestId: string; roomId: string };

before(async () => {
  const room = await prisma.room.create({ data: { roomId: "101" } });
  const guest = await prisma.guest.create({ data: { firstName: "Ada", lastName: "Test", roomId: room.id } });
  ctx = { guestId: guest.id, roomId: "101" };
});

test("log_request stores a request and confirms it", async () => {
  const out = await runTool("log_request", { type: "request", description: "Extra towels" }, ctx);
  assert.match(out, /logged your request/);
  const rows = await prisma.request.findMany({ where: { guestId: ctx.guestId, description: "Extra towels" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "request");
  assert.equal(rows[0].roomId, "101");
});

test("log_request keeps the complaint type", async () => {
  const out = await runTool("log_request", { type: "complaint", description: "AC is broken" }, ctx);
  assert.match(out, /logged your complaint/);
  const row = await prisma.request.findFirstOrThrow({ where: { description: "AC is broken" } });
  assert.equal(row.type, "complaint");
});

test("request_amenity logs a request with the item", async () => {
  await runTool("request_amenity", { item: "pillows" }, ctx);
  const row = await prisma.request.findFirstOrThrow({ where: { description: "Request amenity: pillows" } });
  assert.equal(row.type, "request");
});

test("submit_feedback stores trimmed feedback and defaults source to text", async () => {
  await runTool("submit_feedback", { content: "  Lovely stay  " }, ctx);
  const row = await prisma.feedback.findFirstOrThrow({ where: { guestId: ctx.guestId } });
  assert.equal(row.content, "Lovely stay");
  assert.equal(row.source, "text");
});

test("get_wifi_info returns the network and password", async () => {
  assert.match(await runTool("get_wifi_info", {}, ctx), /WiFi network is .+ and the password is .+/);
});

test("unknown tools are reported, not thrown", async () => {
  assert.equal(await runTool("open_minibar", {}, ctx), "Unknown tool: open_minibar");
});
