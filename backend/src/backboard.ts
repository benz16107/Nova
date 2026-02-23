/**
 * Backboard API client — memory and one thread per guest (per stay).
 * Each logged-in guest has their own Backboard thread and memory isolated by guest_id.
 * Official docs: https://docs.backboard.io/
 */

import path from "path";
import fs from "fs";
import { prisma } from "./db.js";
import {
  BACKBOARD_MEMORY_ENABLED,
  BACKBOARD_ASSISTANT_NAME,
  BACKBOARD_ASSISTANT_SYSTEM_PROMPT,
  BACKBOARD_MEMORY_CONTEXT_LIMIT,
} from "../../nova-config.js";

const DEFAULT_BASE = "https://app.backboard.io/api";
const CACHE_FILE = path.resolve(process.cwd(), ".backboard-assistant-id");

let cachedAssistantId: string | null = null;

function getBase(): string {
  const base = process.env.BACKBOARD_API_BASE?.trim();
  if (base) return base.replace(/\/$/, "");
  return DEFAULT_BASE;
}

function getApiKey(): string | null {
  const key = process.env.BACKBOARD_API_KEY?.trim();
  return key || null;
}

function headers(): Record<string, string> {
  const key = getApiKey();
  if (!key) return {};
  return {
    "X-API-Key": key,
    "Content-Type": "application/json",
  };
}

async function fetchBackboard(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<{ ok: boolean; status: number; data?: unknown; text: string }> {
  const base = getBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: headers(),
      body: options.body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    return { ok: res.ok, status: res.status, data, text };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause ? String(err.cause) : "";
    return { ok: false, status: 0, text: cause || message };
  }
}

async function resolveAssistantId(): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  if (process.env.BACKBOARD_ASSISTANT_ID?.trim()) {
    return process.env.BACKBOARD_ASSISTANT_ID.trim();
  }
  if (cachedAssistantId) return cachedAssistantId;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const id = fs.readFileSync(CACHE_FILE, "utf8").trim();
      if (id) {
        cachedAssistantId = id;
        return id;
      }
    }

    const list = await fetchBackboard("/assistants");
    if (list.ok && list.data && typeof list.data === "object") {
      const obj = list.data as Record<string, unknown>;
      const arr = Array.isArray(obj.assistants) ? obj.assistants : [];
      const first = arr[0];
      const id =
        first && typeof first === "object" && first !== null
          ? (first as Record<string, unknown>).assistant_id ?? (first as Record<string, unknown>).id
          : null;
      if (typeof id === "string" && id) {
        cachedAssistantId = id;
        try {
          fs.writeFileSync(CACHE_FILE, id, "utf8");
        } catch {}
        return id;
      }
    }

    const create = await fetchBackboard("/assistants", {
      method: "POST",
      body: JSON.stringify({
        name: BACKBOARD_ASSISTANT_NAME,
        system_prompt: BACKBOARD_ASSISTANT_SYSTEM_PROMPT,
      }),
    });
    if (create.ok && create.data && typeof create.data === "object") {
      const obj = create.data as Record<string, unknown>;
      const id = obj.assistant_id ?? obj.id;
      if (typeof id === "string" && id) {
        cachedAssistantId = id;
        try {
          fs.writeFileSync(CACHE_FILE, id, "utf8");
        } catch {}
        return id;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Create a new Backboard thread for the assistant (one per guest/stay). */
async function createThread(): Promise<string | null> {
  const assistantId = await resolveAssistantId();
  if (!assistantId) return null;
  const res = await fetchBackboard(`/assistants/${assistantId}/threads`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok || !res.data || typeof res.data !== "object") return null;
  const obj = res.data as Record<string, unknown>;
  const id = obj.thread_id ?? obj.threadId;
  return typeof id === "string" && id ? id : null;
}

/**
 * Ensure this guest has their own Backboard thread (and thus isolated memory context).
 * Creates a thread on first use and stores it on the guest.
 */
export async function ensureThreadForGuest(guestId: string): Promise<string | null> {
  if (!BACKBOARD_MEMORY_ENABLED) return null;
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) return null;
  const existing = (guest as { backboardThreadId?: string | null }).backboardThreadId;
  if (existing) return existing;
  const threadId = await createThread();
  if (!threadId) return null;
  await prisma.guest.update({
    where: { id: guestId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma GuestUpdateInput may be stale until client is regenerated
    data: { backboardThreadId: threadId } as any,
  });
  return threadId;
}

export type MemoryItem = { guest_id: string; room_id: string; content: string };

/**
 * Fetch all memories from Backboard (for manager dashboard: recent feed, search).
 * Returns items with guest_id and room_id from metadata.
 */
export async function getAllMemoriesRaw(): Promise<MemoryItem[]> {
  if (!BACKBOARD_MEMORY_ENABLED) return [];
  const assistantId = await resolveAssistantId();
  if (!assistantId) return [];
  const res = await fetchBackboard(`/assistants/${assistantId}/memories`);
  if (!res.ok) return [];
  if (!res.data || typeof res.data !== "object") return [];
  const obj = res.data as Record<string, unknown>;
  const raw = obj.data ?? obj.memories;
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((m): m is Record<string, unknown> => m != null && typeof m === "object")
    .map((m) => {
      const meta = (m.metadata as Record<string, unknown>) ?? {};
      const content = typeof m.content === "string" ? m.content : "";
      return {
        guest_id: String(meta.guest_id ?? ""),
        room_id: String(meta.room_id ?? ""),
        content,
      };
    })
    .filter((m) => m.guest_id && m.content);
}

/**
 * Get memories for this guest only. Memory is stored with metadata.guest_id so each
 * stay has its own isolated memory; we filter to that guest.
 */
export async function getMemoriesForGuest(guestId: string): Promise<string[]> {
  const all = await getAllMemoriesRaw();
  return all.filter((m) => m.guest_id === guestId).map((m) => m.content);
}

/**
 * Get memories for all guests that stayed in this room (room_id in metadata).
 * Returns content plus guest_id for attribution.
 */
export async function getMemoriesForRoom(roomId: string): Promise<{ guestId: string; content: string }[]> {
  const all = await getAllMemoriesRaw();
  return all
    .filter((m) => m.room_id === String(roomId))
    .map((m) => ({ guestId: m.guest_id, content: m.content }));
}

/** Add a memory for this guest only (metadata isolates it to this stay). */
export async function addMemory(
  guestId: string,
  roomId: string,
  content: string
): Promise<void> {
  if (!BACKBOARD_MEMORY_ENABLED) return;
  const assistantId = await resolveAssistantId();
  if (!assistantId) return;
  await fetchBackboard(`/assistants/${assistantId}/memories`, {
    method: "POST",
    body: JSON.stringify({
      content,
      metadata: { guest_id: String(guestId), room_id: String(roomId) },
    }),
  });
}

export function memorySummary(memories: string[]): string {
  if (memories.length === 0) return "No prior requests or complaints this stay.";
  const limit = Math.max(1, BACKBOARD_MEMORY_CONTEXT_LIMIT);
  return "Past during this stay: " + memories.slice(-limit).join("; ");
}

export async function checkBackboardConnection(): Promise<{ ok: boolean }> {
  if (!BACKBOARD_MEMORY_ENABLED) return { ok: false };
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false };
  const assistantId = await resolveAssistantId();
  if (assistantId) return { ok: true };
  const res = await fetchBackboard("/assistants");
  if (res.ok) return { ok: false };
  console.warn(
    `Backboard: ${res.status ? `HTTP ${res.status}` : "request failed"} — ${res.text.slice(0, 200).replace(/\n/g, " ")}`
  );
  return { ok: false };
}
