import { Router } from "express";
import { prisma } from "../db.js";
import { pushNotifyGuest } from "../push.js";
import { unlockRoom } from "../roomUnlock.js";

export const nfcRouter = Router();

// In-memory store for pending card writes
// Key: roomId, Value: status ("pending" | "success" | "failed")
const pendingWrites = new Map<string, "pending" | "success" | "failed">();
// In-memory reader room assignment. Key: readerId, Value: roomId
const readerRooms = new Map<string, string>();

type InspectStatus = "idle" | "pending" | "success" | "failed";
type CardInspectState = {
  status: InspectStatus;
  roomId: string | null;
  cardUid: string | null;
  updatedAt: string | null;
};

const cardInspectState: CardInspectState = {
  status: "idle",
  roomId: null,
  cardUid: null,
  updatedAt: null,
};

const DEFAULT_READER_ID = "reader-1";

function normalizeReaderId(readerId?: string): string {
  const value = readerId?.trim();
  return value && value.length > 0 ? value : DEFAULT_READER_ID;
}

function normalizeRoomId(roomId?: string): string | null {
  const value = roomId?.trim();
  return value && value.length > 0 ? value : null;
}

nfcRouter.get("/reader-config", (_req, res) => {
  const readers = Array.from(readerRooms.entries()).map(([readerId, roomId]) => ({
    readerId,
    roomId,
  }));
  res.json({ readers });
});

nfcRouter.get("/reader-config/:readerId", (req, res) => {
  const readerId = normalizeReaderId(req.params.readerId);
  const roomId = readerRooms.get(readerId) ?? null;
  res.json({ readerId, roomId });
});

nfcRouter.post("/reader-config", (req, res) => {
  const { readerId: rawReaderId, roomId: rawRoomId } = req.body as {
    readerId?: string;
    roomId?: string;
  };
  const readerId = normalizeReaderId(rawReaderId);
  const roomId = normalizeRoomId(rawRoomId);
  if (!roomId) {
    return res.status(400).json({ error: "roomId required" });
  }
  readerRooms.set(readerId, roomId);
  console.log(`[NFC] Reader ${readerId} assigned to room ${roomId}`);
  res.json({ ok: true, readerId, roomId });
});

nfcRouter.delete("/reader-config/:readerId", (req, res) => {
  const readerId = normalizeReaderId(req.params.readerId);
  readerRooms.delete(readerId);
  console.log(`[NFC] Reader ${readerId} assignment cleared`);
  res.json({ ok: true, readerId });
});

nfcRouter.post("/inspect-card/queue", (_req, res) => {
  cardInspectState.status = "pending";
  cardInspectState.roomId = null;
  cardInspectState.cardUid = null;
  cardInspectState.updatedAt = new Date().toISOString();
  console.log("[NFC] Queued card room inspection");
  res.json({ ok: true, status: cardInspectState.status });
});

nfcRouter.get("/inspect-card/pending", (_req, res) => {
  res.json({ pending: cardInspectState.status === "pending" });
});

nfcRouter.get("/inspect-card/status", (_req, res) => {
  res.json(cardInspectState);
});

nfcRouter.post("/inspect-card/confirm", (req, res) => {
  const { roomId: rawRoomId, cardUid: rawCardUid, success } = req.body as {
    roomId?: string;
    cardUid?: string;
    success?: boolean;
  };

  if (success === false) {
    cardInspectState.status = "failed";
    cardInspectState.roomId = null;
    cardInspectState.cardUid = null;
    cardInspectState.updatedAt = new Date().toISOString();
    console.log("[NFC] Card inspection failed");
    return res.json({ ok: true });
  }

  const roomId = normalizeRoomId(rawRoomId);
  const cardUid = rawCardUid?.trim() || null;
  if (!roomId) {
    return res.status(400).json({ error: "roomId required when success=true" });
  }

  cardInspectState.status = "success";
  cardInspectState.roomId = roomId;
  cardInspectState.cardUid = cardUid;
  cardInspectState.updatedAt = new Date().toISOString();
  console.log(`[NFC] Card inspection success: room ${roomId}, uid ${cardUid ?? "n/a"}`);
  res.json({ ok: true });
});

// 1. Dashboard calls this to start the check-in card programming
nfcRouter.post("/queue-write", (req, res) => {
  const { roomId } = req.body as { roomId?: string };
  if (!roomId) return res.status(400).json({ error: "roomId required" });

  pendingWrites.set(roomId, "pending");
  console.log(`[NFC] Queued write for room ${roomId}`);
  res.json({ ok: true });
});

// 2. Dashboard polls this to check if the card was written
nfcRouter.get("/write-status/:roomId", (req, res) => {
  const { roomId } = req.params;
  const status = pendingWrites.get(roomId);

  if (!status) return res.status(404).json({ error: "No pending write found" });

  res.json({ status });

  // Clear from memory if finished
  if (status === "success" || status === "failed") {
    // We give the dashboard a few seconds to poll the result before clearing
    setTimeout(() => pendingWrites.delete(roomId), 10000);
  }
});

// 3. ESP32 polls this to see if it should start writing for its SPECIFIC room
nfcRouter.get("/pending-write/:roomId", (req, res) => {
  const { roomId } = req.params;
  const status = pendingWrites.get(roomId);

  if (status === "pending") {
    return res.json({ pending: true });
  }
  res.json({ pending: false });
});

// 3.5 Generic Writer: ESP32 polls this to see if ANY room needs writing
nfcRouter.get("/any-pending-write", (req, res) => {
  for (const [roomId, status] of pendingWrites.entries()) {
    if (status === "pending") {
      return res.json({ pending: true, roomId });
    }
  }
  res.json({ pending: false });
});

// 4. ESP32 calls this to report success or failure
nfcRouter.post("/confirm-write", (req, res) => {
  const { roomId, success } = req.body as { roomId?: string; success?: boolean };
  if (!roomId) return res.status(400).json({ error: "roomId required" });

  if (pendingWrites.has(roomId)) {
    pendingWrites.set(roomId, success ? "success" : "failed");
    console.log(`[NFC] Card write for room ${roomId} result: ${success ? "SUCCESS" : "FAILED"}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: "Room not in queue" });
  }
});

// 5. Dashboard calls this to cancel a pending write
nfcRouter.post("/cancel-write", (req, res) => {
  const { roomId } = req.body as { roomId?: string };
  if (!roomId) return res.status(400).json({ error: "roomId required" });

  pendingWrites.delete(roomId);
  console.log(`[NFC] Cancelled write for room ${roomId}`);
  res.json({ ok: true });
});

// POST /api/nfc/read — body: room_id, card_uid, timestamp
nfcRouter.post("/read", async (req, res) => {
  try {
    const { room_id: roomId, card_uid: cardUid, timestamp } = req.body as {
      room_id?: string;
      card_uid?: string;
      timestamp?: string;
    };
    if (!roomId) {
      return res.status(400).json({ error: "room_id required" });
    }
    const room = await prisma.room.findUnique({ where: { roomId } });
    if (!room) {
      return res.status(200).json({ ok: true, doorAllowed: false, message: "Room not registered; no guest to activate" });
    }

    // Only unlock if there are checked-in, not checked-out guests
    const roomGuests = await prisma.guest.findMany({
      where: { roomId: room.id, checkedIn: true, checkedOut: false },
      orderBy: { updatedAt: "desc" },
    });
    if (roomGuests.length === 0) {
      // Do NOT unlock the room if no eligible guests
      return res.status(200).json({ ok: true, doorAllowed: false, message: "No checked-in guests assigned; room remains locked" });
    }

    await unlockRoom(room.roomId, cardUid);

    for (const guest of roomGuests) {
      await prisma.conciergeSession.upsert({
        where: { guestId: guest.id },
        create: { guestId: guest.id, active: true },
        update: { active: true, updatedAt: new Date() },
      });
      await pushNotifyGuest(guest.id, "Nova is ready.");
    }

    res.status(200).json({
      ok: true,
      doorAllowed: true,
      activatedGuestCount: roomGuests.length,
      message: "Room unlocked and concierge activated for checked-in guests",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
