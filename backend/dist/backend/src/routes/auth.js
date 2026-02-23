"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const settings_js_1 = require("./settings.js");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
    }
    const valid = await (0, settings_js_1.verifyManagerPassword)(password);
    if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = Buffer.from(`staff:${email}:${Date.now()}`).toString("base64url");
    res.json({ token });
});
