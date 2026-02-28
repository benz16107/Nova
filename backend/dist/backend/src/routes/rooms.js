"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomsRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const roomUnlock_js_1 = require("../roomUnlock.js");
exports.roomsRouter = (0, express_1.Router)();
// Bookings = guest per room for MVP. Active list: rooms that have at least one non-archived guest.
exports.roomsRouter.get("/", async (_req, res) => {
    try {
        const rooms = await db_js_1.prisma.room.findMany({
            where: { guests: { some: { archived: { not: true } } } },
            include: {
                guests: {
                    where: { archived: { not: true } },
                    orderBy: { updatedAt: "desc" },
                },
            },
            orderBy: { roomId: "asc" },
        });
        res.json(rooms);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
// POST /api/rooms/:id/restore — un-archive room and all guests, set to not checked in (re-add to active list)
exports.roomsRouter.post("/:id/restore", async (req, res) => {
    try {
        const room = await db_js_1.prisma.room.findUnique({ where: { id: req.params.id } });
        if (!room)
            return res.status(404).json({ error: "Room not found" });
        await db_js_1.prisma.guest.updateMany({
            where: { roomId: room.id },
            data: {
                archived: false,
                archivedVia: null,
                checkedOut: false,
                checkedOutAt: null,
                checkedIn: false,
                checkedInAt: null,
            },
        });
        await (0, roomUnlock_js_1.lockRoom)(room.roomId);
        res.json({ ok: true, roomId: room.roomId });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.roomsRouter.delete("/:id", async (req, res) => {
    try {
        const room = await db_js_1.prisma.room.findUnique({ where: { id: req.params.id } });
        if (!room)
            return res.status(404).json({ error: "Room not found" });
        const guests = await db_js_1.prisma.guest.findMany({ where: { roomId: room.id }, select: { id: true } });
        const guestIds = guests.map((g) => g.id);
        if (guestIds.length > 0) {
            await db_js_1.prisma.feedback.deleteMany({ where: { guestId: { in: guestIds } } });
            await db_js_1.prisma.request.deleteMany({ where: { guestId: { in: guestIds } } });
            await db_js_1.prisma.conciergeSession.deleteMany({ where: { guestId: { in: guestIds } } });
        }
        await db_js_1.prisma.guest.deleteMany({ where: { roomId: room.id } });
        await db_js_1.prisma.room.delete({ where: { id: room.id } });
        await (0, roomUnlock_js_1.lockRoom)(room.roomId);
        res.status(204).send();
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
