import { Router } from "express";
import { prisma } from "../db.js";
import { getAllMemoriesRaw } from "../backboard.js";

export const memoriesRouter = Router();

/** GET /api/memories/recent?limit=10 — latest memories across all guests (for dashboard widget). */
memoriesRouter.get("/recent", async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const raw = await getAllMemoriesRaw();
    const guestIds = [...new Set(raw.map((m) => m.guest_id))];
    const guests = await prisma.guest.findMany({
      where: { id: { in: guestIds } },
      include: { room: true },
    });
    const guestMap = new Map(guests.map((g) => [g.id, g]));
    const items = raw
      .map((m) => {
        const guest = guestMap.get(m.guest_id);
        return {
          guestId: m.guest_id,
          roomId: m.room_id,
          content: m.content,
          firstName: guest?.firstName,
          lastName: guest?.lastName,
          roomNumber: guest?.room?.roomId,
        };
      })
      .filter((i) => i.firstName != null)
      .slice(-limit)
      .reverse();
    res.json({ memories: items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/memories/search?q=pillows — search memories by content. */
memoriesRouter.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json({ memories: [] });
    const raw = await getAllMemoriesRaw();
    const filtered = raw.filter((m) => m.content.toLowerCase().includes(q));
    const guestIds = [...new Set(filtered.map((m) => m.guest_id))];
    const guests = await prisma.guest.findMany({
      where: { id: { in: guestIds } },
      include: { room: true },
    });
    const guestMap = new Map(guests.map((g) => [g.id, g]));
    const items = filtered.map((m) => {
      const guest = guestMap.get(m.guest_id);
      return {
        guestId: m.guest_id,
        roomId: m.room_id,
        content: m.content,
        firstName: guest?.firstName,
        lastName: guest?.lastName,
        roomNumber: guest?.room?.roomId,
      };
    });
    res.json({ memories: items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/memories/room/:roomNumber/previous-stay — memories from the last archived guest in this room (handover). */
memoriesRouter.get("/room/:roomNumber/previous-stay", async (req, res) => {
  try {
    const roomNumber = req.params.roomNumber;
    const room = await prisma.room.findUnique({ where: { roomId: roomNumber } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const lastGuest = await prisma.guest.findFirst({
      where: { roomId: room.id, archived: true },
      orderBy: { checkedOutAt: "desc" },
      include: { room: true },
    });
    if (!lastGuest) return res.json({ memories: [], guest: null });
    const { getMemoriesForGuest } = await import("../backboard.js");
    const memories = await getMemoriesForGuest(lastGuest.id);
    res.json({
      memories,
      guest: {
        firstName: lastGuest.firstName,
        lastName: lastGuest.lastName,
        roomId: lastGuest.room.roomId,
        checkedOutAt: lastGuest.checkedOutAt,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
