"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
exports.authRouter = (0, express_1.Router)();
// MVP: single shared password from env. No user DB.
const STAFF_PASSWORD = process.env.MANAGER_PASSWORD ?? "hotel-staff";
exports.authRouter.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
    }
    if (password !== STAFF_PASSWORD) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    // Opaque token for MVP (no JWT)
    const token = Buffer.from(`staff:${email}:${Date.now()}`).toString("base64url");
    res.json({ token });
});
