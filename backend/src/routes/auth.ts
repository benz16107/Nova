import { Router } from "express";
import { verifyManagerPassword } from "./settings.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }
  const valid = await verifyManagerPassword(password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = Buffer.from(`staff:${email}:${Date.now()}`).toString("base64url");
  res.json({ token });
});
