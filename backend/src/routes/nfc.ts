import { Router } from "express";
import { prisma } from "../db.js";
import { pushNotifyGuest } from "../push.js";

export const nfcRouter = Router();

// POST /api/nfc/read — body: room_id, card_uid, timestamp
nfcRouter.post("/read", async (req, res) => {
  try {
    const { room_id: roomId, card_uid: cardUid, timestamp } = req.body as {
      room_id?: string;
      card_uid?: string;
      timestamp?: string;
    };
    if (!roomId) {
      return res.status(400).json({ error: "room_id required" });
    }
    const room = await prisma.room.findUnique({ where: { roomId } });
    if (!room) {
      return res.status(200).json({ ok: true, message: "Room not registered; no guest to activate" });
    }
    // Primary guest for this room (most recently updated)
    const guest = await prisma.guest.findFirst({
      where: { roomId: room.id },
      orderBy: { updatedAt: "desc" },
    });
    if (!guest) {
      return res.status(200).json({ ok: true, message: "No guest assigned to room" });
    }
    // Create or update concierge session
    await prisma.conciergeSession.upsert({
      where: { guestId: guest.id },
      create: { guestId: guest.id, active: true },
      update: { active: true, updatedAt: new Date() },
    });
    // Push notification to guest app (stub if no FCM)
    await pushNotifyGuest(guest.id, "Nova is ready.");
    res.status(200).json({
      ok: true,
      guestId: guest.id,
      message: "Concierge session activated",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
