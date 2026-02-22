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
