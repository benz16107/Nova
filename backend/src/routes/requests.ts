import { Router } from "express";
import { prisma } from "../db.js";

export const requestsRouter = Router();

// GET /api/requests — list all requests (and optionally complaints filter)
requestsRouter.get("/", async (req, res) => {
  try {
    const type = req.query.type as string | undefined; // "request" | "complaint"
    const roomId = req.query.roomId as string | undefined;
    const where: { type?: string; roomId?: string } = {};
    if (type) where.type = type;
    if (roomId) where.roomId = roomId;
    const requests = await prisma.request.findMany({
      where,
      include: { guest: { include: { room: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Complaints list (mount at /api/complaints)
export const complaintsRouter = Router();
complaintsRouter.get("/", async (_req, res) => {
  try {
    const requests = await prisma.request.findMany({
      where: { type: "complaint" },
      include: { guest: { include: { room: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
