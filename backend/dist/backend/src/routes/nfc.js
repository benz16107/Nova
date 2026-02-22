"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nfcRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const push_js_1 = require("../push.js");
exports.nfcRouter = (0, express_1.Router)();
// POST /api/nfc/read — body: room_id, card_uid, timestamp
exports.nfcRouter.post("/read", async (req, res) => {
    try {
        const { room_id: roomId, card_uid: cardUid, timestamp } = req.body;
        if (!roomId) {
            return res.status(400).json({ error: "room_id required" });
        }
        const room = await db_js_1.prisma.room.findUnique({ where: { roomId } });
        if (!room) {
            return res.status(200).json({ ok: true, message: "Room not registered; no guest to activate" });
        }
        // Primary guest for this room (most recently updated)
        const guest = await db_js_1.prisma.guest.findFirst({
            where: { roomId: room.id },
            orderBy: { updatedAt: "desc" },
        });
        if (!guest) {
            return res.status(200).json({ ok: true, message: "No guest assigned to room" });
        }
        // Create or update concierge session
        await db_js_1.prisma.conciergeSession.upsert({
            where: { guestId: guest.id },
            create: { guestId: guest.id, active: true },
            update: { active: true, updatedAt: new Date() },
        });
        // Push notification to guest app (stub if no FCM)
        await (0, push_js_1.pushNotifyGuest)(guest.id, "Nova is ready.");
        res.status(200).json({
            ok: true,
            guestId: guest.id,
            message: "Concierge session activated",
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
