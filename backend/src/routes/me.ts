import { Router } from "express";
import { prisma } from "../db.js";
import { isRoomUnlocked } from "../roomUnlock.js";

export const meRouter = Router();

function getConciergeBlockedReason(guest: { checkedIn: boolean; checkedOut: boolean }, roomUnlocked: boolean): "checked_out" | "not_checked_in" | "door_not_unlocked" | null {
  if (guest.checkedOut) return "checked_out";
  if (!guest.checkedIn) return "not_checked_in";
  if (!roomUnlocked) return "door_not_unlocked";
  return null;
}

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
    const roomUnlocked = await isRoomUnlocked(guest.room.roomId);
    const conciergeActive = (session?.active ?? false) && roomUnlocked;
    const conciergeAllowed = guest.checkedIn && !guest.checkedOut && roomUnlocked;
    const conciergeBlockedReason = getConciergeBlockedReason(
      { checkedIn: guest.checkedIn, checkedOut: guest.checkedOut },
      roomUnlocked,
    );
    res.json({
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        roomId: guest.room.roomId,
      },
      conciergeActive,
      conciergeAllowed,
      conciergeBlockedReason,
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
    const roomGuests = await prisma.guest.findMany({
      where: { roomId: room.id },
      include: { room: true },
    });

    const guest = roomGuests.find(g =>
      g.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
      g.lastName.trim().toLowerCase() === lastName.trim().toLowerCase()
    );
    if (!guest) {
      return res.status(404).json({ error: "No guest found for this room and name" });
    }
    if (guest.checkedOut) {
      return res.status(403).json({ error: "Account disabled. You have checked out." });
    }
    if (!guest.checkedIn) {
      return res.status(403).json({ error: "Not checked in. Please check in at the front desk to use Nova." });
    }
    const roomUnlocked = await isRoomUnlocked(room.roomId);
    if (!roomUnlocked) {
      return res.status(403).json({ error: "Room key not scanned at door yet. Please tap your key card at the room reader first." });
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
