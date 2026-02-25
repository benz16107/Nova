import { Router } from "express";
import { prisma } from "../db.js";

export const feedbackRouter = Router();

/** POST /api/feedback — guest submits feedback (query: guest_token). */
feedbackRouter.post("/", async (req, res) => {
  try {
    const guestToken = (req.query.guest_token ?? req.query.guestId) as string | undefined;
    if (!guestToken) {
      return res.status(401).json({ error: "guest_token required" });
    }
    const guest = await prisma.guest.findUnique({
      where: { id: guestToken },
      include: { room: true },
    });
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    const body = (req.body as { content?: string; source?: string }) || {};
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return res.status(400).json({ error: "content required" });
    const source = body.source === "voice" ? "voice" : "text";
    const feedback = await prisma.feedback.create({
      data: {
        guestId: guest.id,
        roomId: guest.room.roomId,
        content,
        source,
      },
      include: { guest: { select: { firstName: true, lastName: true } } },
    });
    res.status(201).json(feedback);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/feedback — list all feedback (dashboard). Optional ?roomId= */
feedbackRouter.get("/", async (req, res) => {
  try {
    const roomId = req.query.roomId as string | undefined;
    const where = roomId ? { roomId } : {};
    const list = await prisma.feedback.findMany({
      where,
      include: { guest: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
