"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guestsRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const backboard_js_1 = require("../backboard.js");
exports.guestsRouter = (0, express_1.Router)();
exports.guestsRouter.get("/", async (req, res) => {
    try {
        const archivedOnly = req.query.archived === "true";
        const guests = await db_js_1.prisma.guest.findMany({
            where: archivedOnly ? { archived: true } : { archived: { not: true } },
            include: { room: true },
            orderBy: { updatedAt: "desc" },
        });
        res.json(guests);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.get("/:id", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const includeMemories = req.query.include === "memories";
        if (includeMemories) {
            const memories = await (0, backboard_js_1.getMemoriesForGuest)(guest.id);
            return res.json({ ...guest, memories });
        }
        res.json(guest);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
/** GET /api/guests/:id/memories — Backboard memories for this guest (stay context). */
exports.guestsRouter.get("/:id/memories", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const memories = await (0, backboard_js_1.getMemoriesForGuest)(guest.id);
        res.json({ memories, guest: { firstName: guest.firstName, lastName: guest.lastName, roomId: guest.room.roomId } });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
/** GET /api/guests/:id/check-out-summary — all guests in the room + requests + memories for pre-check-out. (Feedback is collected after checkout only.) */
exports.guestsRouter.get("/:id/check-out-summary", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const room = guest.room;
        if (!room)
            return res.status(500).json({ error: "Guest has no room" });
        const roomId = room.roomId;
        const roomGuests = await db_js_1.prisma.guest.findMany({
            where: { roomId: room.id },
            include: { room: true },
            orderBy: { createdAt: "asc" },
        });
        const guestsData = await Promise.all(roomGuests.map(async (g) => {
            const [memories, requests] = await Promise.all([
                (0, backboard_js_1.getMemoriesForGuest)(g.id).catch(() => []),
                db_js_1.prisma.request.findMany({ where: { guestId: g.id }, orderBy: { createdAt: "desc" } }),
            ]);
            return {
                guest: {
                    id: g.id,
                    firstName: g.firstName,
                    lastName: g.lastName,
                    roomId: g.room.roomId,
                    checkedInAt: g.checkedInAt,
                },
                memories: Array.isArray(memories) ? memories : [],
                requests: requests.map((r) => ({
                    id: r.id,
                    type: r.type,
                    description: r.description,
                    status: r.status ?? "open",
                    closedAt: r.closedAt,
                    createdAt: r.createdAt,
                })),
            };
        }));
        res.json({ roomId, guests: guestsData });
    }
    catch (e) {
        console.error("[GET /api/guests/:id/check-out-summary]", e);
        res.status(500).json({ error: String(e) });
    }
});
/** GET /api/guests/:id/export — guest summary + memories + requests for print/handover. */
exports.guestsRouter.get("/:id/export", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const [memories, requests] = await Promise.all([
            (0, backboard_js_1.getMemoriesForGuest)(guest.id),
            db_js_1.prisma.request.findMany({ where: { guestId: guest.id }, orderBy: { createdAt: "desc" } }),
        ]);
        res.json({
            guest: {
                firstName: guest.firstName,
                lastName: guest.lastName,
                roomId: guest.room.roomId,
                checkedInAt: guest.checkedInAt,
                checkedOutAt: guest.checkedOutAt,
            },
            memories,
            requests: requests.map((r) => ({ type: r.type, description: r.description, createdAt: r.createdAt })),
            exportedAt: new Date().toISOString(),
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.post("/", async (req, res) => {
    try {
        const body = req.body;
        const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
        const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
        const roomId = body.roomId != null ? String(body.roomId).trim() : "";
        if (!firstName || !lastName || !roomId) {
            return res.status(400).json({ error: "firstName, lastName, and room number are required" });
        }
        let room = await db_js_1.prisma.room.findUnique({ where: { roomId } });
        if (!room) {
            room = await db_js_1.prisma.room.create({ data: { roomId } });
        }
        const guest = await db_js_1.prisma.guest.create({
            data: {
                firstName,
                lastName,
                roomId: room.id,
            },
            include: { room: true },
        });
        res.status(201).json(guest);
    }
    catch (e) {
        console.error("[POST /api/guests]", e);
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
    }
});
exports.guestsRouter.put("/:id", async (req, res) => {
    try {
        const { firstName, lastName, roomId } = req.body;
        const existing = await db_js_1.prisma.guest.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: "Guest not found" });
        const data = {};
        if (firstName != null)
            data.firstName = firstName;
        if (lastName != null)
            data.lastName = lastName;
        const oldRoomId = roomId != null ? existing.roomId : null;
        if (roomId != null) {
            let room = await db_js_1.prisma.room.findUnique({ where: { roomId } });
            if (!room)
                room = await db_js_1.prisma.room.create({ data: { roomId } });
            data.roomId = room.id;
        }
        const guest = await db_js_1.prisma.guest.update({
            where: { id: req.params.id },
            data,
            include: { room: true },
        });
        if (oldRoomId != null && data.roomId && oldRoomId !== data.roomId) {
            const remaining = await db_js_1.prisma.guest.count({ where: { roomId: oldRoomId } });
            if (remaining === 0) {
                await db_js_1.prisma.room.delete({ where: { id: oldRoomId } }).catch(() => { });
            }
        }
        res.json(guest);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.post("/:id/check-in", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const now = new Date();
        await db_js_1.prisma.guest.updateMany({
            where: { roomId: guest.roomId },
            data: { checkedIn: true, checkedInAt: now },
        });
        res.json({ ok: true, checkedIn: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.post("/:id/undo-check-in", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        await db_js_1.prisma.guest.updateMany({
            where: { roomId: guest.roomId },
            data: { checkedIn: false, checkedInAt: null },
        });
        res.json({ ok: true, checkedIn: false });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.post("/:id/check-out", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const now = new Date();
        await db_js_1.prisma.guest.updateMany({
            where: { roomId: guest.roomId },
            data: { checkedOut: true, checkedOutAt: now, archived: true, archivedVia: "check_out" },
        });
        res.json({ ok: true, checkedOut: true, archived: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.post("/:id/archive", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const data = { archived: true, archivedVia: "manual" };
        if (!guest.checkedOut) {
            data.checkedOut = true;
            data.checkedOutAt = new Date();
        }
        await db_js_1.prisma.guest.update({
            where: { id: req.params.id },
            data,
        });
        res.json({ ok: true, archived: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.delete("/:id", async (req, res) => {
    try {
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: req.params.id },
            include: { room: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const roomId = guest.roomId;
        await db_js_1.prisma.request.deleteMany({ where: { guestId: guest.id } });
        await db_js_1.prisma.conciergeSession.deleteMany({ where: { guestId: guest.id } });
        await db_js_1.prisma.guest.delete({ where: { id: req.params.id } });
        const remaining = await db_js_1.prisma.guest.count({ where: { roomId } });
        if (remaining === 0) {
            await db_js_1.prisma.room.delete({ where: { id: roomId } }).catch(() => { });
        }
        res.status(204).send();
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
