import { Router } from "express";
import { prisma } from "../db.js";

export const meRouter = Router();

// GET /api/me — requires guest_token or session; for MVP we use query guestId for testing
meRouter.get("/", async (req, res) => {
  try {
    const guestId = (req.query.guest_token ?? req.query.guestId) as string | undefined;
    if (!guestId) {
      return res.status(401).json({ error: "guest_token or guestId required" });
    }
    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: { room: true },
    });
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }
    const session = await prisma.conciergeSession.findUnique({
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
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/me/activate — activate app with room number + first name + last name; link device / push token
meRouter.post("/activate", async (req, res) => {
  try {
    const { roomId, firstName, lastName, pushToken } = req.body as {
      roomId?: string;
      firstName?: string;
      lastName?: string;
      pushToken?: string;
    };
    if (!roomId || !firstName || !lastName) {
      return res.status(400).json({ error: "roomId, firstName, and lastName required" });
    }
    const room = await prisma.room.findUnique({ where: { roomId } });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    const guest = await prisma.guest.findFirst({
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
      await prisma.guest.update({
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
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
