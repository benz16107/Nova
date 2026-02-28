"use strict";
/**
 * Backboard API client — memory and one thread per guest (per stay).
 * Each logged-in guest has their own Backboard thread and memory isolated by guest_id.
 * Official docs: https://docs.backboard.io/
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureThreadForGuest = ensureThreadForGuest;
exports.getAllMemoriesRaw = getAllMemoriesRaw;
exports.getMemoriesForGuest = getMemoriesForGuest;
exports.getMemoriesForRoom = getMemoriesForRoom;
exports.addMemory = addMemory;
exports.memorySummary = memorySummary;
exports.checkBackboardConnection = checkBackboardConnection;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_js_1 = require("./db.js");
const nova_config_js_1 = require("../../nova-config.js");
const DEFAULT_BASE = "https://app.backboard.io/api";
const CACHE_FILE = path_1.default.resolve(process.cwd(), ".backboard-assistant-id");
let cachedAssistantId = null;
function getBase() {
    const base = process.env.BACKBOARD_API_BASE?.trim();
    if (base)
        return base.replace(/\/$/, "");
    return DEFAULT_BASE;
}
function getApiKey() {
    const key = process.env.BACKBOARD_API_KEY?.trim();
    return key || null;
}
function headers() {
    const key = getApiKey();
    if (!key)
        return {};
    return {
        "X-API-Key": key,
        "Content-Type": "application/json",
    };
}
async function fetchBackboard(path, options = {}) {
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
        let data;
        try {
            data = text ? JSON.parse(text) : undefined;
        }
        catch {
            data = undefined;
        }
        return { ok: res.ok, status: res.status, data, text };
    }
    catch (err) {
        clearTimeout(timeout);
        const message = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error && err.cause ? String(err.cause) : "";
        return { ok: false, status: 0, text: cause || message };
    }
}
async function resolveAssistantId() {
    const apiKey = getApiKey();
    if (!apiKey)
        return null;
    if (process.env.BACKBOARD_ASSISTANT_ID?.trim()) {
        return process.env.BACKBOARD_ASSISTANT_ID.trim();
    }
    if (cachedAssistantId)
        return cachedAssistantId;
    try {
        if (fs_1.default.existsSync(CACHE_FILE)) {
            const id = fs_1.default.readFileSync(CACHE_FILE, "utf8").trim();
            if (id) {
                cachedAssistantId = id;
                return id;
            }
        }
        const list = await fetchBackboard("/assistants");
        if (list.ok && list.data) {
            const arr = Array.isArray(list.data) ? list.data : [];
            const first = arr[0];
            const id = first && typeof first === "object" && first !== null
                ? first.assistant_id ?? first.id
                : null;
            if (typeof id === "string" && id) {
                cachedAssistantId = id;
                try {
                    fs_1.default.writeFileSync(CACHE_FILE, id, "utf8");
                }
                catch { }
                return id;
            }
        }
        const create = await fetchBackboard("/assistants", {
            method: "POST",
            body: JSON.stringify({
                name: nova_config_js_1.BACKBOARD_ASSISTANT_NAME,
                system_prompt: nova_config_js_1.BACKBOARD_ASSISTANT_SYSTEM_PROMPT,
            }),
        });
        if (create.ok && create.data && typeof create.data === "object") {
            const obj = create.data;
            const id = obj.assistant_id ?? obj.id;
            if (typeof id === "string" && id) {
                cachedAssistantId = id;
                try {
                    fs_1.default.writeFileSync(CACHE_FILE, id, "utf8");
                }
                catch { }
                return id;
            }
        }
    }
    catch {
        // ignore
    }
    return null;
}
/** Create a new Backboard thread for the assistant (one per guest/stay). */
async function createThread() {
    const assistantId = await resolveAssistantId();
    if (!assistantId)
        return null;
    const res = await fetchBackboard(`/assistants/${assistantId}/threads`, {
        method: "POST",
        body: "{}",
    });
    if (!res.ok || !res.data || typeof res.data !== "object")
        return null;
    const obj = res.data;
    const id = obj.thread_id ?? obj.threadId;
    return typeof id === "string" && id ? id : null;
}
/**
 * Ensure this guest has their own Backboard thread (and thus isolated memory context).
 * Creates a thread on first use and stores it on the guest.
 */
async function ensureThreadForGuest(guestId) {
    if (!nova_config_js_1.BACKBOARD_MEMORY_ENABLED)
        return null;
    const guest = await db_js_1.prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest)
        return null;
    const existing = guest.backboardThreadId;
    if (existing)
        return existing;
    const threadId = await createThread();
    if (!threadId)
        return null;
    await db_js_1.prisma.guest.update({
        where: { id: guestId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma GuestUpdateInput may be stale until client is regenerated
        data: { backboardThreadId: threadId },
    });
    return threadId;
}
/**
 * Fetch all memories from Backboard (for manager dashboard: recent feed, search).
 * Returns items with guest_id and room_id from metadata.
 */
async function getAllMemoriesRaw() {
    if (!nova_config_js_1.BACKBOARD_MEMORY_ENABLED)
        return [];
    const assistantId = await resolveAssistantId();
    if (!assistantId)
        return [];
    const res = await fetchBackboard(`/assistants/${assistantId}/memories`);
    if (!res.ok)
        return [];
    const raw = Array.isArray(res.data)
        ? res.data
        : res.data && typeof res.data === "object"
            ? (res.data.data ??
                res.data.memories)
            : [];
    const list = Array.isArray(raw) ? raw : [];
    return list
        .filter((m) => m != null && typeof m === "object")
        .map((m) => {
        const meta = m.metadata ?? {};
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
async function getMemoriesForGuest(guestId) {
    const all = await getAllMemoriesRaw();
    return all.filter((m) => m.guest_id === guestId).map((m) => m.content);
}
/**
 * Get memories for all guests that stayed in this room (room_id in metadata).
 * Returns content plus guest_id for attribution.
 */
async function getMemoriesForRoom(roomId) {
    const all = await getAllMemoriesRaw();
    return all
        .filter((m) => m.room_id === String(roomId))
        .map((m) => ({ guestId: m.guest_id, content: m.content }));
}
/** Add a memory for this guest only (metadata isolates it to this stay). */
async function addMemory(guestId, roomId, content) {
    if (!nova_config_js_1.BACKBOARD_MEMORY_ENABLED)
        return;
    const assistantId = await resolveAssistantId();
    if (!assistantId)
        return;
    const res = await fetchBackboard(`/assistants/${assistantId}/memories`, {
        method: "POST",
        body: JSON.stringify({
            content,
            metadata: { guest_id: String(guestId), room_id: String(roomId) },
        }),
    });
    if (!res.ok) {
        console.warn(`Backboard addMemory failed (${res.status || "request_failed"}): ${res.text.slice(0, 200).replace(/\n/g, " ")}`);
    }
}
function memorySummary(memories) {
    if (memories.length === 0)
        return "No prior requests or complaints this stay.";
    const limit = Math.max(1, nova_config_js_1.BACKBOARD_MEMORY_CONTEXT_LIMIT);
    // Memories from Backboard are newest-first (descending).
    // We take the top `limit` newest memories, then reverse them so they flow chronologically (oldest -> newest)
    // This helps the AI understand what the "last" request was.
    const chronological = memories.slice(0, limit).reverse();
    return "Past during this stay (chronological order): " + chronological.join("; ");
}
async function checkBackboardConnection() {
    if (!nova_config_js_1.BACKBOARD_MEMORY_ENABLED)
        return { ok: false };
    const apiKey = getApiKey();
    if (!apiKey)
        return { ok: false };
    const assistantId = await resolveAssistantId();
    if (assistantId)
        return { ok: true };
    const res = await fetchBackboard("/assistants");
    if (res.ok)
        return { ok: false };
    console.warn(`Backboard: ${res.status ? `HTTP ${res.status}` : "request failed"} — ${res.text.slice(0, 200).replace(/\n/g, " ")}`);
    return { ok: false };
}
