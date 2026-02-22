"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guestsRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
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
        res.json(guest);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
exports.guestsRouter.post("/", async (req, res) => {
    try {
        const { firstName, lastName, roomId } = req.body;
        if (!firstName || !lastName || !roomId) {
            return res.status(400).json({ error: "firstName, lastName, roomId required" });
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
        res.status(500).json({ error: String(e) });
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
