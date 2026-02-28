"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nfcRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const push_js_1 = require("../push.js");
const roomUnlock_js_1 = require("../roomUnlock.js");
exports.nfcRouter = (0, express_1.Router)();
// In-memory store for pending card writes
// Key: roomId, Value: status ("pending" | "success" | "failed")
const pendingWrites = new Map();
// In-memory reader room assignment. Key: readerId, Value: roomId
const readerRooms = new Map();
const cardInspectState = {
    status: "idle",
    roomId: null,
    cardUid: null,
    updatedAt: null,
};
const DEFAULT_READER_ID = "reader-1";
function normalizeReaderId(readerId) {
    const value = readerId?.trim();
    return value && value.length > 0 ? value : DEFAULT_READER_ID;
}
function normalizeRoomId(roomId) {
    const value = roomId?.trim();
    return value && value.length > 0 ? value : null;
}
exports.nfcRouter.get("/reader-config", (_req, res) => {
    const readers = Array.from(readerRooms.entries()).map(([readerId, roomId]) => ({
        readerId,
        roomId,
    }));
    res.json({ readers });
});
exports.nfcRouter.get("/reader-config/:readerId", (req, res) => {
    const readerId = normalizeReaderId(req.params.readerId);
    const roomId = readerRooms.get(readerId) ?? null;
    res.json({ readerId, roomId });
});
exports.nfcRouter.post("/reader-config", (req, res) => {
    const { readerId: rawReaderId, roomId: rawRoomId } = req.body;
    const readerId = normalizeReaderId(rawReaderId);
    const roomId = normalizeRoomId(rawRoomId);
    if (!roomId) {
        return res.status(400).json({ error: "roomId required" });
    }
    readerRooms.set(readerId, roomId);
    console.log(`[NFC] Reader ${readerId} assigned to room ${roomId}`);
    res.json({ ok: true, readerId, roomId });
});
exports.nfcRouter.delete("/reader-config/:readerId", (req, res) => {
    const readerId = normalizeReaderId(req.params.readerId);
    readerRooms.delete(readerId);
    console.log(`[NFC] Reader ${readerId} assignment cleared`);
    res.json({ ok: true, readerId });
});
exports.nfcRouter.post("/inspect-card/queue", (_req, res) => {
    cardInspectState.status = "pending";
    cardInspectState.roomId = null;
    cardInspectState.cardUid = null;
    cardInspectState.updatedAt = new Date().toISOString();
    console.log("[NFC] Queued card room inspection");
    res.json({ ok: true, status: cardInspectState.status });
});
exports.nfcRouter.get("/inspect-card/pending", (_req, res) => {
    res.json({ pending: cardInspectState.status === "pending" });
});
exports.nfcRouter.get("/inspect-card/status", (_req, res) => {
    res.json(cardInspectState);
});
exports.nfcRouter.post("/inspect-card/confirm", (req, res) => {
    const { roomId: rawRoomId, cardUid: rawCardUid, success } = req.body;
    if (success === false) {
        cardInspectState.status = "failed";
        cardInspectState.roomId = null;
        cardInspectState.cardUid = null;
        cardInspectState.updatedAt = new Date().toISOString();
        console.log("[NFC] Card inspection failed");
        return res.json({ ok: true });
    }
    const roomId = normalizeRoomId(rawRoomId);
    const cardUid = rawCardUid?.trim() || null;
    if (!roomId) {
        return res.status(400).json({ error: "roomId required when success=true" });
    }
    cardInspectState.status = "success";
    cardInspectState.roomId = roomId;
    cardInspectState.cardUid = cardUid;
    cardInspectState.updatedAt = new Date().toISOString();
    console.log(`[NFC] Card inspection success: room ${roomId}, uid ${cardUid ?? "n/a"}`);
    res.json({ ok: true });
});
// 1. Dashboard calls this to start the check-in card programming
exports.nfcRouter.post("/queue-write", (req, res) => {
    const { roomId } = req.body;
    if (!roomId)
        return res.status(400).json({ error: "roomId required" });
    pendingWrites.set(roomId, "pending");
    console.log(`[NFC] Queued write for room ${roomId}`);
    res.json({ ok: true });
});
// 2. Dashboard polls this to check if the card was written
exports.nfcRouter.get("/write-status/:roomId", (req, res) => {
    const { roomId } = req.params;
    const status = pendingWrites.get(roomId);
    if (!status)
        return res.status(404).json({ error: "No pending write found" });
    res.json({ status });
    // Clear from memory if finished
    if (status === "success" || status === "failed") {
        // We give the dashboard a few seconds to poll the result before clearing
        setTimeout(() => pendingWrites.delete(roomId), 10000);
    }
});
// 3. ESP32 polls this to see if it should start writing for its SPECIFIC room
exports.nfcRouter.get("/pending-write/:roomId", (req, res) => {
    const { roomId } = req.params;
    const status = pendingWrites.get(roomId);
    if (status === "pending") {
        return res.json({ pending: true });
    }
    res.json({ pending: false });
});
// 3.5 Generic Writer: ESP32 polls this to see if ANY room needs writing
exports.nfcRouter.get("/any-pending-write", (req, res) => {
    for (const [roomId, status] of pendingWrites.entries()) {
        if (status === "pending") {
            return res.json({ pending: true, roomId });
        }
    }
    res.json({ pending: false });
});
// 4. ESP32 calls this to report success or failure
exports.nfcRouter.post("/confirm-write", (req, res) => {
    const { roomId, success } = req.body;
    if (!roomId)
        return res.status(400).json({ error: "roomId required" });
    if (pendingWrites.has(roomId)) {
        pendingWrites.set(roomId, success ? "success" : "failed");
        console.log(`[NFC] Card write for room ${roomId} result: ${success ? "SUCCESS" : "FAILED"}`);
        res.json({ ok: true });
    }
    else {
        res.status(404).json({ error: "Room not in queue" });
    }
});
// 5. Dashboard calls this to cancel a pending write
exports.nfcRouter.post("/cancel-write", (req, res) => {
    const { roomId } = req.body;
    if (!roomId)
        return res.status(400).json({ error: "roomId required" });
    pendingWrites.delete(roomId);
    console.log(`[NFC] Cancelled write for room ${roomId}`);
    res.json({ ok: true });
});
// POST /api/nfc/read — body: room_id, card_uid, timestamp
exports.nfcRouter.post("/read", async (req, res) => {
    try {
        const { room_id: roomId, card_uid: cardUid, timestamp } = req.body;
        if (!roomId) {
            return res.status(400).json({ error: "room_id required" });
        }
        const room = await db_js_1.prisma.room.findUnique({ where: { roomId } });
        if (!room) {
            return res.status(200).json({ ok: true, doorAllowed: false, message: "Room not registered; no guest to activate" });
        }
        // Only unlock if there are checked-in, not checked-out guests
        const roomGuests = await db_js_1.prisma.guest.findMany({
            where: { roomId: room.id, checkedIn: true, checkedOut: false },
            orderBy: { updatedAt: "desc" },
        });
        if (roomGuests.length === 0) {
            // Do NOT unlock the room if no eligible guests
            return res.status(200).json({ ok: true, doorAllowed: false, message: "No checked-in guests assigned; room remains locked" });
        }
        await (0, roomUnlock_js_1.unlockRoom)(room.roomId, cardUid);
        for (const guest of roomGuests) {
            await db_js_1.prisma.conciergeSession.upsert({
                where: { guestId: guest.id },
                create: { guestId: guest.id, active: true },
                update: { active: true, updatedAt: new Date() },
            });
            await (0, push_js_1.pushNotifyGuest)(guest.id, "Nova is ready.");
        }
        res.status(200).json({
            ok: true,
            doorAllowed: true,
            activatedGuestCount: roomGuests.length,
            message: "Room unlocked and concierge activated for checked-in guests",
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
