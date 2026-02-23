import { Router, type Response } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";

export const settingsRouter = Router();

const SALT_LEN = 16;
const KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const STAFF_PASSWORD_ENV = process.env.MANAGER_PASSWORD ?? "hotel-staff";
const PASSWORD_KEY = "staff_password_hash";

const SETTINGS_NOT_AVAILABLE =
  "Settings not available. In the backend folder run: npx prisma generate — then restart the server.";

function ensureSettingsModel(res: Response): boolean {
  if (prisma?.setting == null) {
    res.status(503).json({ error: SETTINGS_NOT_AVAILABLE });
    return false;
  }
  return true;
}

async function getSetting(key: string): Promise<string | null> {
  if (prisma?.setting == null) return null;
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  if (prisma?.setting == null) throw new Error(SETTINGS_NOT_AVAILABLE);
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

function hashPassword(password: string, salt: Buffer): string {
  return crypto.scryptSync(password, salt, KEYLEN, SCRYPT_OPTIONS).toString("base64");
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hash] = stored.split(":");
  if (!saltB64 || !hash) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = hashPassword(password, salt);
  return expected === hash;
}

function createStoredPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = hashPassword(password, salt);
  return `${salt.toString("base64")}:${hash}`;
}

/** GET /api/settings — get all manager-editable settings (no password hash) */
settingsRouter.get("/", async (_req, res) => {
  if (!ensureSettingsModel(res)) return;
  try {
    const [hotelRow, passwordRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "hotel_layout" } }),
      prisma.setting.findUnique({ where: { key: PASSWORD_KEY } }),
    ]);
    const hotelLayout = hotelRow?.value ? (JSON.parse(hotelRow.value) as { roomsPerFloor?: number[] }) : null;
    const hasCustomPassword = Boolean(passwordRow?.value);
    const hotelNameRow = await prisma.setting.findUnique({ where: { key: "hotel_name" } });
    const hotelName = hotelNameRow?.value ?? null;
    res.json({
      hotelLayout: hotelLayout?.roomsPerFloor ?? null,
      hotelName: hotelName as string | null,
      hasCustomPassword,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** PATCH /api/settings — update settings (hotel layout, password, hotel name) */
settingsRouter.patch("/", async (req, res) => {
  if (!ensureSettingsModel(res)) return;
  try {
    const body = (req.body as {
      hotelLayout?: { roomsPerFloor?: number[] };
      hotelName?: string | null;
      currentPassword?: string;
      newPassword?: string;
    }) || {};

    if (body.hotelLayout?.roomsPerFloor != null) {
      const arr = body.hotelLayout.roomsPerFloor;
      if (!Array.isArray(arr) || arr.some((n) => typeof n !== "number" || n < 1 || n > 99)) {
        return res.status(400).json({ error: "roomsPerFloor must be an array of numbers between 1 and 99" });
      }
      await setSetting("hotel_layout", JSON.stringify({ roomsPerFloor: arr }));
    }

    if (body.hotelName !== undefined) {
      const value = typeof body.hotelName === "string" ? body.hotelName.trim() : "";
      await setSetting("hotel_name", value || "");
    }

    if (body.newPassword != null && body.newPassword !== "") {
      const current = body.currentPassword ?? "";
      const stored = await getSetting(PASSWORD_KEY);
      const envOk = current === STAFF_PASSWORD_ENV;
      const customOk = stored ? verifyPassword(current, stored) : false;
      if (!envOk && !customOk) {
        return res.status(400).json({ error: "Current password is incorrect." });
      }
      if (body.newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters." });
      }
      await setSetting(PASSWORD_KEY, createStoredPassword(body.newPassword));
    }

    const [hotelRow, passwordRow, hotelNameRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "hotel_layout" } }),
      prisma.setting.findUnique({ where: { key: PASSWORD_KEY } }),
      prisma.setting.findUnique({ where: { key: "hotel_name" } }),
    ]);
    const hotelLayout = hotelRow?.value ? (JSON.parse(hotelRow.value) as { roomsPerFloor?: number[] }) : null;
    res.json({
      hotelLayout: hotelLayout?.roomsPerFloor ?? null,
      hotelName: (hotelNameRow?.value as string) ?? null,
      hasCustomPassword: Boolean(passwordRow?.value),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export async function verifyManagerPassword(password: string): Promise<boolean> {
  const stored = await getSetting(PASSWORD_KEY);
  if (stored) return verifyPassword(password, stored);
  return password === STAFF_PASSWORD_ENV;
}
