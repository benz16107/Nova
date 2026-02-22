import { Router } from "express";
import { prisma } from "../db.js";

export const roomsRouter = Router();

// Bookings = guest per room for MVP. Active list: rooms that have at least one non-archived guest.
roomsRouter.get("/", async (_req, res) => {
  try {
    const rooms = await prisma.room.findMany({
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
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/rooms/:id/restore — un-archive room and all guests, set to not checked in (re-add to active list)
roomsRouter.post("/:id/restore", async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.id } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    await prisma.guest.updateMany({
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
    res.json({ ok: true, roomId: room.roomId });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

roomsRouter.delete("/:id", async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.id } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const guests = await prisma.guest.findMany({ where: { roomId: room.id }, select: { id: true } });
    for (const g of guests) {
      await prisma.request.deleteMany({ where: { guestId: g.id } });
      await prisma.conciergeSession.deleteMany({ where: { guestId: g.id } });
    }
    await prisma.guest.deleteMany({ where: { roomId: room.id } });
    await prisma.room.delete({ where: { id: room.id } });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});