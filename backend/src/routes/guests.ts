import { Router } from "express";
import { prisma } from "../db.js";
import { getMemoriesForGuest } from "../backboard.js";

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
    const includeMemories = req.query.include === "memories";
    if (includeMemories) {
      const memories = await getMemoriesForGuest(guest.id);
      return res.json({ ...guest, memories });
    }
    res.json(guest);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/guests/:id/memories — Backboard memories for this guest (stay context). */
guestsRouter.get("/:id/memories", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const memories = await getMemoriesForGuest(guest.id);
    res.json({ memories, guest: { firstName: guest.firstName, lastName: guest.lastName, roomId: guest.room.roomId } });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/guests/:id/check-out-summary — guest + requests + memories for pre-check-out confirmation. */
guestsRouter.get("/:id/check-out-summary", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const [memories, requests] = await Promise.all([
      getMemoriesForGuest(guest.id),
      prisma.request.findMany({ where: { guestId: guest.id }, orderBy: { createdAt: "desc" } }),
    ]);
    res.json({
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        roomId: guest.room.roomId,
        checkedInAt: guest.checkedInAt,
      },
      memories,
      requests,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/guests/:id/export — guest summary + memories + requests for print/handover. */
guestsRouter.get("/:id/export", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const [memories, requests] = await Promise.all([
      getMemoriesForGuest(guest.id),
      prisma.request.findMany({ where: { guestId: guest.id }, orderBy: { createdAt: "desc" } }),
    ]);
    res.json({
      guest: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        roomId: guest.room.roomId,
        checkedInAt: guest.checkedInAt,
        checkedOutAt: guest.checkedOutAt,
      },
      memories,
      requests: requests.map((r) => ({ type: r.type, description: r.description, createdAt: r.createdAt })),
      exportedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

guestsRouter.post("/", async (req, res) => {
  try {
    const body = req.body as { firstName?: unknown; lastName?: unknown; roomId?: unknown };
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const roomId = body.roomId != null ? String(body.roomId).trim() : "";
    if (!firstName || !lastName || !roomId) {
      return res.status(400).json({ error: "firstName, lastName, and room number are required" });
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
    console.error("[POST /api/guests]", e);
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
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

guestsRouter.post("/:id/undo-check-in", async (req, res) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    await prisma.guest.updateMany({
      where: { roomId: guest.roomId },
      data: { checkedIn: false, checkedInAt: null },
    });
    res.json({ ok: true, checkedIn: false });
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
