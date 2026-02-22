import { Router } from "express";
import { prisma } from "../db.js";

export const guestsRouter = Router();

guestsRouter.get("/", async (req, res) => {
  try {
    const archivedOnly = req.query.archived === "true";
    const guests = await prisma.guest.findMany({
      where: archivedOnly ? { archived: true } : { archived: { not: true } },
      include: { room: true },
      orderBy: { updatedAt: "desc" },
    });
    res.json(guests);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.get("/:id", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    res.json(guest);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.post("/", async (req, res) => {
  try {
    const { firstName, lastName, roomId } = req.body as {
      firstName?: string;
      lastName?: string;
      roomId?: string;
    };
    if (!firstName || !lastName || !roomId) {
      return res.status(400).json({ error: "firstName, lastName, roomId required" });
    }
    let room = await prisma.room.findUnique({ where: { roomId } });
    if (!room) {
      room = await prisma.room.create({ data: { roomId } });
    }
    const guest = await prisma.guest.create({
      data: {
        firstName,
        lastName,
        roomId: room.id,
      },
      include: { room: true },
    });
    res.status(201).json(guest);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.put("/:id", async (req, res) => {
  try {
    const { firstName, lastName, roomId } = req.body as {
      firstName?: string;
      lastName?: string;
      roomId?: string;
    };
    const existing = await prisma.guest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Guest not found" });
    const data: { firstName?: string; lastName?: string; roomId?: string } = {};
    if (firstName != null) data.firstName = firstName;
    if (lastName != null) data.lastName = lastName;
    const oldRoomId = roomId != null ? existing.roomId : null;
    if (roomId != null) {
      let room = await prisma.room.findUnique({ where: { roomId } });
      if (!room) room = await prisma.room.create({ data: { roomId } });
      data.roomId = room.id;
    }
    const guest = await prisma.guest.update({
      where: { id: req.params.id },
      data,
      include: { room: true },
    });
    if (oldRoomId != null && data.roomId && oldRoomId !== data.roomId) {
      const remaining = await prisma.guest.count({ where: { roomId: oldRoomId } });
      if (remaining === 0) {
        await prisma.room.delete({ where: { id: oldRoomId } }).catch(() => {});
      }
    }
    res.json(guest);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.post("/:id/check-in", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const now = new Date();
    await prisma.guest.updateMany({
      where: { roomId: guest.roomId },
      data: { checkedIn: true, checkedInAt: now },
    });
    res.json({ ok: true, checkedIn: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.post("/:id/check-out", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const now = new Date();
    await prisma.guest.updateMany({
      where: { roomId: guest.roomId },
      data: { checkedOut: true, checkedOutAt: now, archived: true, archivedVia: "check_out" },
    });
    res.json({ ok: true, checkedOut: true, archived: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.post("/:id/archive", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const data: { archived: true; archivedVia: string; checkedOut?: true; checkedOutAt?: Date } = { archived: true, archivedVia: "manual" };
    if (!guest.checkedOut) {
      data.checkedOut = true;
      data.checkedOutAt = new Date();
    }
    await prisma.guest.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ ok: true, archived: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.delete("/:id", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const roomId = guest.roomId;
    await prisma.request.deleteMany({ where: { guestId: guest.id } });
    await prisma.conciergeSession.deleteMany({ where: { guestId: guest.id } });
    await prisma.guest.delete({ where: { id: req.params.id } });
    const remaining = await prisma.guest.count({ where: { roomId } });
    if (remaining === 0) {
      await prisma.room.delete({ where: { id: roomId } }).catch(() => {});
    }
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
