import { Router } from "express";
import { verifyManagerPassword } from "./settings.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    return res.status(400).json({ error: "Password required" });
  }
  const valid = await verifyManagerPassword(password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = Buffer.from(`staff:${Date.now()}`).toString("base64url");
  res.json({ token });
});
