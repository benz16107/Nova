"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
exports.meRouter = (0, express_1.Router)();
// GET /api/me — requires guest_token or session; for MVP we use query guestId for testing
exports.meRouter.get("/", async (req, res) => {
    try {
        const guestId = (req.query.guest_token ?? req.query.guestId);
        if (!guestId) {
            return res.status(401).json({ error: "guest_token or guestId required" });
        }
        const guest = await db_js_1.prisma.guest.findUnique({
            where: { id: guestId },
            include: { room: true },
        });
        if (!guest) {
            return res.status(404).json({ error: "Guest not found" });
        }
        const session = await db_js_1.prisma.conciergeSession.findUnique({
            where: { guestId: guest.id },
        });
        const conciergeActive = session?.active ?? false;
        const conciergeAllowed = guest.checkedIn && !guest.checkedOut;
        res.json({
            guest: {
                id: guest.id,
                firstName: guest.firstName,
                lastName: guest.lastName,
                roomId: guest.room.roomId,
            },
            conciergeActive,
            conciergeAllowed,
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
// POST /api/me/activate — activate app with room number + first name + last name; link device / push token
exports.meRouter.post("/activate", async (req, res) => {
    try {
        const { roomId, firstName, lastName, pushToken } = req.body;
        if (!roomId || !firstName || !lastName) {
            return res.status(400).json({ error: "roomId, firstName, and lastName required" });
        }
        const room = await db_js_1.prisma.room.findUnique({ where: { roomId } });
        if (!room) {
            return res.status(404).json({ error: "Room not found" });
        }
        const guest = await db_js_1.prisma.guest.findFirst({
            where: { roomId: room.id, firstName: firstName.trim(), lastName: lastName.trim() },
            include: { room: true },
        });
        if (!guest) {
            return res.status(404).json({ error: "No guest found for this room and name" });
        }
        if (guest.checkedOut) {
            return res.status(403).json({ error: "Account disabled. You have checked out." });
        }
        if (!guest.checkedIn) {
            return res.status(403).json({ error: "Not checked in. Please check in at the front desk to use Nova." });
        }
        if (pushToken) {
            await db_js_1.prisma.guest.update({
                where: { id: guest.id },
                data: { pushToken },
            });
        }
        res.json({
            guest: {
                id: guest.id,
                firstName: guest.firstName,
                lastName: guest.lastName,
                roomId: room.roomId,
            },
            token: guest.id, // MVP: use guest id as token for /api/me and WebSocket
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
