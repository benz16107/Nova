"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complaintsRouter = exports.requestsRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
exports.requestsRouter = (0, express_1.Router)();
// GET /api/requests — list all requests (and optionally complaints filter)
exports.requestsRouter.get("/", async (req, res) => {
    try {
        const type = req.query.type; // "request" | "complaint"
        const roomId = req.query.roomId;
        const where = {};
        if (type)
            where.type = type;
        if (roomId)
            where.roomId = roomId;
        const requests = await db_js_1.prisma.request.findMany({
            where,
            include: { guest: { include: { room: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(requests);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
// PATCH /api/requests/:id/close — mark request as closed (manager completed it)
exports.requestsRouter.patch("/:id/close", async (req, res) => {
    try {
        const id = req.params.id;
        const request = await db_js_1.prisma.request.update({
            where: { id },
            data: { status: "closed", closedAt: new Date() },
        });
        res.json(request);
    }
    catch (e) {
        if (e && typeof e === "object" && "code" in e && e.code === "P2025")
            return res.status(404).json({ error: "Request not found" });
        res.status(500).json({ error: String(e) });
    }
});
// PATCH /api/requests/:id/reopen — mark request as open again
exports.requestsRouter.patch("/:id/reopen", async (req, res) => {
    try {
        const id = req.params.id;
        const request = await db_js_1.prisma.request.update({
            where: { id },
            data: { status: "open", closedAt: null },
        });
        res.json(request);
    }
    catch (e) {
        if (e && typeof e === "object" && "code" in e && e.code === "P2025")
            return res.status(404).json({ error: "Request not found" });
        res.status(500).json({ error: String(e) });
    }
});
// POST /api/requests/:id/reply — manager sends a reply; Nova will deliver it when the guest opens Nova next
exports.requestsRouter.post("/:id/reply", async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body || {};
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message)
            return res.status(400).json({ error: "message required" });
        const request = await db_js_1.prisma.request.update({
            where: { id },
            data: { managerReply: message, managerRepliedAt: new Date(), managerReplyShownAt: null },
        });
        res.json(request);
    }
    catch (e) {
        if (e && typeof e === "object" && "code" in e && e.code === "P2025")
            return res.status(404).json({ error: "Request not found" });
        res.status(500).json({ error: String(e) });
    }
});
// Complaints list (mount at /api/complaints)
exports.complaintsRouter = (0, express_1.Router)();
exports.complaintsRouter.get("/", async (_req, res) => {
    try {
        const requests = await db_js_1.prisma.request.findMany({
            where: { type: "complaint" },
            include: { guest: { include: { room: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(requests);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
