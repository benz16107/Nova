import { Router } from "express";

export const authRouter = Router();

// MVP: single shared password from env. No user DB.
const STAFF_PASSWORD = process.env.MANAGER_PASSWORD ?? "hotel-staff";

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
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
