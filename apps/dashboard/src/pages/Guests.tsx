import { useState, useEffect, Fragment } from "react";
import { getRoomIdListFromConfig, getRoomsByFloorFromConfig } from "../config/hotel";
import { useRoomsPerFloor } from "../context/SettingsContext";

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  roomId: string;
  room: { roomId: string };
  checkedIn?: boolean;
  checkedOut?: boolean;
  archived?: boolean;
  archivedVia?: string | null; // "check_out" | "manual"
  createdAt?: string;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  updatedAt?: string;
};

function archiveReasonLabel(via: string | null | undefined): string {
  if (via === "check_out") return "Checked out";
  if (via === "manual") return "Manual archive";
  return "—";
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleString("en-US", { month: "short", day: "numeric" });
  const timePart = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s+([AP]M)$/, "$1");
  return `${datePart}, ${timePart}`;
}

export default function Guests() {
  const roomsPerFloor = useRoomsPerFloor();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [rooms, setRooms] = useState<{ id: string; roomId: string; guests: Guest[] }[]>([]);
  const [archivedGuests, setArchivedGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    roomId: "",
    guests: [{ firstName: "", lastName: "" }, { firstName: "", lastName: "" }] as { firstName: string; lastName: string }[],
  });
  const [formError, setFormError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAnchor, setModalAnchor] = useState<{ top: number; left: number } | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [modalGuest, setModalGuest] = useState<Guest | null>(null);
  const [modalForm, setModalForm] = useState({ firstName: "", lastName: "", roomId: "" });
  const [modalError, setModalError] = useState("");
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [expandedArchivedRoomId, setExpandedArchivedRoomId] = useState<string | null>(null);
  const [stayContextGuestId, setStayContextGuestId] = useState<string | null>(null);
  const [stayContextMemories, setStayContextMemories] = useState<string[]>([]);
  const [stayContextLoading, setStayContextLoading] = useState(false);
  const [checkOutSummary, setCheckOutSummary] = useState<{
    roomId: string;
    guests: Array<{
      guest: { id: string; firstName: string; lastName: string; roomId: string };
      memories: string[];
      requests: { id: string; type: string; description: string; status: string; closedAt?: string | null; createdAt: string }[];
    }>;
  } | null>(null);
  const [checkOutInProgress, setCheckOutInProgress] = useState(false);
  const [previousStayByRoom, setPreviousStayByRoom] = useState<Record<string, { memories: string[]; guest: { firstName: string; lastName: string; roomId: string } | null }>>({});
  const [moreMenuGuestId, setMoreMenuGuestId] = useState<string | null>(null);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [stayContextAiSummary, setStayContextAiSummary] = useState<{ summary: string; tags: string[] } | null>(null);
  const [stayContextAiLoading, setStayContextAiLoading] = useState(false);
  const [checkOutAiSummary, setCheckOutAiSummary] = useState<{ summary: string; tags: string[] } | null>(null);
  const [checkOutAiLoading, setCheckOutAiLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [roomsFilterStatus, setRoomsFilterStatus] = useState<string>("all");
  const [roomsSearchQuery, setRoomsSearchQuery] = useState<string>("");
  const [highlightedRoomId, setHighlightedRoomId] = useState<string | null>(null);
  const [archivedSectionExpanded, setArchivedSectionExpanded] = useState(false);

  // Card programming state
  const [programmingRoom, setProgrammingRoom] = useState<{ id: string; roomId: string; guests: Guest[] } | null>(null);
  const [programmingStatus, setProgrammingStatus] = useState<"pending" | "success" | "failed" | null>(null);

  function scrollToRoomInList(roomId: string) {
    const el = document.getElementById(`room-row-${roomId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedRoomId(roomId);
      setTimeout(() => setHighlightedRoomId(null), 2000);
    }
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [gRes, rRes, aRes] = await Promise.all([
        fetch("/api/guests").catch(() => null),
        fetch("/api/rooms").catch(() => null),
        fetch("/api/guests?archived=true").catch(() => null),
      ]);
      if (gRes?.ok) {
        const data = await gRes.json().catch(() => []);
        if (Array.isArray(data)) setGuests(data);
      }
      if (rRes?.ok) {
        const data = await rRes.json().catch(() => []);
        if (Array.isArray(data)) setRooms(data);
      }
      if (aRes?.ok) {
        const data = await aRes.json().catch(() => []);
        if (Array.isArray(data)) setArchivedGuests(data);
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setAiConfigured(d.configured ?? false))
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    if (!stayContextGuestId) return;
    setStayContextMemories([]);
    setStayContextAiSummary(null);
    setStayContextLoading(true);
    fetch(`/api/guests/${stayContextGuestId}/memories`)
      .then((r) => r.json())
      .then((data: { memories?: string[] }) => {
        setStayContextMemories(Array.isArray(data.memories) ? data.memories : []);
      })
      .catch(() => setStayContextMemories([]))
      .finally(() => setStayContextLoading(false));
    if (aiConfigured) {
      setStayContextAiLoading(true);
      fetch("/api/ai/summarize-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: stayContextGuestId }),
      })
        .then((r) => r.json())
        .then((d: { summary?: string; tags?: string[] }) => setStayContextAiSummary({ summary: d.summary ?? "", tags: Array.isArray(d.tags) ? d.tags : [] }))
        .catch(() => setStayContextAiSummary(null))
        .finally(() => setStayContextAiLoading(false));
    }
  }, [stayContextGuestId, aiConfigured]);

  useEffect(() => {
    if (!checkOutSummary || checkOutSummary.guests.length === 0) {
      setCheckOutAiSummary(null);
      return;
    }
    if (!aiConfigured) return;
    setCheckOutAiLoading(true);
    const guestIds = checkOutSummary.guests.map((g) => g.guest.id);
    fetch("/api/ai/summarize-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestIds.length === 1 ? { guestId: guestIds[0] } : { guestIds }),
    })
      .then((r) => r.json())
      .then((d: { summary?: string; tags?: string[] }) => setCheckOutAiSummary({ summary: d.summary ?? "", tags: Array.isArray(d.tags) ? d.tags : [] }))
      .catch(() => setCheckOutAiSummary(null))
      .finally(() => setCheckOutAiLoading(false));
  }, [checkOutSummary?.roomId, checkOutSummary?.guests?.length, aiConfigured]);

  useEffect(() => {
    if (!expandedRoomId) return;
    const room = rooms.find((x) => x.id === expandedRoomId);
    if (!room?.roomId) return;
    const roomNumber = room.roomId;
    if (previousStayByRoom[roomNumber] !== undefined) return;
    fetch(`/api/memories/room/${encodeURIComponent(roomNumber)}/previous-stay`)
      .then((r) => r.json())
      .then((data: { memories?: string[]; guest?: { firstName: string; lastName: string; roomId: string } | null }) => {
        setPreviousStayByRoom((prev) => ({
          ...prev,
          [roomNumber]: {
            memories: Array.isArray(data.memories) ? data.memories : [],
            guest: data.guest ?? null,
          },
        }));
      })
      .catch(() =>
        setPreviousStayByRoom((prev) => ({ ...prev, [roomNumber]: { memories: [], guest: null } }))
      );
  }, [expandedRoomId, rooms]);

  // Poll for card writing status
  useEffect(() => {
    if (!programmingRoom || programmingStatus !== "pending") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/nfc/write-status/${programmingRoom.roomId}`);
        if (res.ok) {
          const { status } = await res.json();
          if (status === "success") {
            setProgrammingStatus("success");
            clearInterval(interval);
            // Auto finalize check-in
            setTimeout(() => finalizeCheckIn(programmingRoom), 1500);
          } else if (status === "failed") {
            setProgrammingStatus("failed");
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.error("Error polling NFC status:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [programmingRoom?.id, programmingStatus]);

  async function finalizeCheckIn(room: { id: string; roomId: string; guests: Guest[] }) {
    const scrollY = window.scrollY;
    // Only call check-in API if not already checked in (to preserve checkedInAt timestamp)
    const isAlreadyCheckedIn = room.guests?.some(g => g.checkedIn && !g.checkedOut);

    if (!isAlreadyCheckedIn) {
      for (const g of room.guests ?? []) {
        await fetch(`/api/guests/${g.id}/check-in`, { method: "POST" });
      }
      await load();
    }

    setProgrammingRoom(null);
    setProgrammingStatus(null);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
  }

  async function handleCancelProgramming() {
    if (!programmingRoom) return;
    try {
      await fetch("/api/nfc/cancel-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: programmingRoom.roomId }),
      });
    } catch (e) {
      console.error("Error cancelling programming:", e);
    }
    setProgrammingRoom(null);
    setProgrammingStatus(null);
  }

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const roomId = form.roomId.trim();
    const guestsToAdd = form.guests.filter((g) => g.firstName.trim() && g.lastName.trim());
    if (!roomId) {
      setFormError("Room number is required.");
      return;
    }
    if (rooms.some((r) => r.roomId === roomId)) {
      setFormError("This room is already reserved or checked in. Choose an available room.");
      return;
    }
    if (guestsToAdd.length === 0) {
      setFormError("At least one guest (first and last name) is required.");
      return;
    }
    for (const g of guestsToAdd) {
      let res: Response;
      try {
        res = await fetch("/api/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: g.firstName.trim(),
            lastName: g.lastName.trim(),
            roomId: String(roomId),
          }),
        });
      } catch (netErr) {
        setFormError("Network error. Is the backend running on port 3000?");
        return;
      }
      const raw = await res.text();
      let parsed: string | undefined;
      if (raw) {
        try {
          const data = JSON.parse(raw) as { error?: string };
          parsed = data?.error;
        } catch {
          parsed = undefined;
        }
      }
      if (!res.ok) {
        setFormError(parsed || (raw && raw.length < 200 ? raw : undefined) || `Failed to reserve room/guests (${res.status}).`);
        return;
      }
    }
    setForm({ roomId: "", guests: [{ firstName: "", lastName: "" }, { firstName: "", lastName: "" }] });
    await load();
  }

  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    if (modalMode === "edit" && modalGuest) {
      const res = await fetch(`/api/guests/${modalGuest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: modalForm.firstName,
          lastName: modalForm.lastName,
          roomId: modalForm.roomId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        closeModal();
        load();
      } else {
        setModalError((data as { error?: string }).error || "Failed to update guest.");
      }
    } else {
      const res = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modalForm),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        closeModal();
        load();
      } else {
        setModalError((data as { error?: string }).error || "Failed to add guest.");
      }
    }
  }

  async function handleDeleteGuest(g: Guest) {
    if (!confirm(`Delete guest ${g.firstName} ${g.lastName}? This cannot be undone.`)) return;
    const res = await fetch(`/api/guests/${g.id}`, { method: "DELETE" });
    if (res.ok) {
      if (modalGuest?.id === g.id) closeModal();
      setExpandedRoomId(null);
      load();
    }
  }

  async function handleDeleteRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Delete room ${room.roomId} and all guests? This cannot be undone.`)) return;
    const res = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
    if (res.ok) {
      if (modalGuest && room.guests?.some((g) => g.id === modalGuest.id)) closeModal();
      load();
    }
  }

  async function handleRestoreRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Re-reserve room ${room.roomId} and all guests to the room list? They will appear as reserved.`)) return;
    const res = await fetch(`/api/rooms/${room.id}/restore`, { method: "POST" });
    if (res.ok) load();
  }

  async function handleCheckInRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    try {
      // 1. Queue the write on the backend
      const res = await fetch("/api/nfc/queue-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.roomId }),
      });
      if (res.ok) {
        setProgrammingRoom(room);
        setProgrammingStatus("pending");
      } else {
        alert("Failed to start card programming. Is the backend running?");
      }
    } catch (e) {
      alert("Error starting check-in.");
    }
  }

  async function handleUndoCheckIn(room: { id: string; roomId: string; guests: Guest[] }) {
    const main = room.guests?.[0];
    if (!main) return;
    const scrollY = window.scrollY;
    await fetch(`/api/guests/${main.id}/undo-check-in`, { method: "POST" });
    await load();
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
  }

  function handleCheckOutClick(room: { id: string; roomId: string; guests: Guest[] }) {
    const main = room.guests?.[0];
    if (!main) return;
    fetch(`/api/guests/${main.id}/check-out-summary`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data: {
        roomId?: string;
        guests?: Array<{
          guest: { id: string; firstName: string; lastName: string; roomId: string };
          memories: string[];
          requests: { id: string; type: string; description: string; status: string; closedAt?: string | null; createdAt: string }[];
        }>;
      } | null) => {
        if (data?.roomId && Array.isArray(data.guests) && data.guests.length > 0) {
          setCheckOutSummary({
            roomId: data.roomId,
            guests: data.guests,
          });
        }
      })
      .catch(() => { });
  }

  async function handleCheckOutConfirm() {
    if (!checkOutSummary || checkOutSummary.guests.length === 0) return;
    setCheckOutInProgress(true);
    try {
      await fetch(`/api/guests/${checkOutSummary.guests[0].guest.id}/check-out`, { method: "POST" });
      setCheckOutSummary(null);
      load();
    } finally {
      setCheckOutInProgress(false);
    }
  }

  function handleExport(guestId: string) {
    const url = `/api/guests/${guestId}/export`;
    window.open(url, "_blank", "noopener");
  }

  function handlePrintSummary(guestId: string) {
    Promise.all([
      fetch(`/api/guests/${guestId}/export`).then((r) => r.json()),
      fetch("/api/ai/status").then((r) => r.json()).then((d: { configured?: boolean }) => d.configured).catch(() => false),
    ])
      .then(([data, aiOk]) => {
        const g = (data as { guest?: { firstName?: string; lastName?: string; roomId?: string } }).guest ?? {};
        if (!aiOk) return Promise.resolve({ data, g, aiSection: "" });
        return fetch("/api/ai/summarize-guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestId }),
        })
          .then((r) => r.json())
          .then((d: { summary?: string; tags?: string[] }) => {
            let aiSection = "";
            if (d.summary) aiSection = `<section><strong>AI summary</strong><p>${escapeHtml(d.summary)}</p>${(d.tags?.length ?? 0) > 0 ? `<p style="font-size:12px;color:#555">Tags: ${escapeHtml((d.tags ?? []).join(", "))}</p>` : ""}</section>`;
            return { data, g, aiSection };
          })
          .catch(() => ({ data, g, aiSection: "" }));
      })
      .then(({ data, g, aiSection }) => {
        const d = data as { guest?: { firstName?: string; lastName?: string; roomId?: string }; memories?: string[]; requests?: { type: string; description: string; createdAt: string }[]; exportedAt?: string };
        const html = `
<!DOCTYPE html><html><head><title>Guest summary · ${g.firstName ?? ""} ${g.lastName ?? ""}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;max-width:600px;margin:0 auto} h1{font-size:18px} ul{margin:8px 0;padding-left:20px} .meta{color:#666;font-size:14px;margin-bottom:16px} section{margin-bottom:20px}</style></head><body>
<h1>Guest summary</h1>
<div class="meta">${g.firstName ?? ""} ${g.lastName ?? ""} · Room ${g.roomId ?? ""} · Exported ${d.exportedAt ? new Date(d.exportedAt).toLocaleString() : ""}</div>
${aiSection}
${(d.memories?.length ?? 0) > 0 ? `<section><strong>Stay context (Nova memory)</strong><ul>${(d.memories ?? []).map((m: string) => `<li>${escapeHtml(m)}</li>`).join("")}</ul></section>` : ""}
${(d.requests?.length ?? 0) > 0 ? `<section><strong>Requests & complaints</strong><ul>${(d.requests ?? []).map((r: { type: string; description: string }) => `<li><strong>${escapeHtml(r.type)}</strong>: ${escapeHtml(r.description)}</li>`).join("")}</ul></section>` : ""}
</body></html>`;
        const win = window.open("", "_blank", "noopener");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); }, 300);
        }
      })
      .catch(() => alert("Failed to load summary."));
  }
  function escapeHtml(s: string) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  async function handleArchiveRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Archive room ${room.roomId} and all guests? They will be moved to the archived list and can no longer use Nova.`)) return;
    for (const g of room.guests ?? []) {
      await fetch(`/api/guests/${g.id}/archive`, { method: "POST" });
    }
    load();
  }

  function openEditModal(g: Guest, roomNumber?: string, e?: React.MouseEvent) {
    setModalError("");
    setModalMode("edit");
    setModalGuest(g);
    setModalForm({
      firstName: g.firstName,
      lastName: g.lastName,
      roomId: roomNumber ?? (g as Guest & { room?: { roomId: string } }).room?.roomId ?? "",
    });
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const w = 320;
      const pad = 8;
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
      if (left < pad) left = pad;
      if (top + 280 > window.innerHeight - pad) top = rect.top - 280 - 4;
      if (top < pad) top = pad;
      setModalAnchor({ top, left });
    } else setModalAnchor(null);
    setModalOpen(true);
  }

  function openAddGuestModal(roomId: string, e?: React.MouseEvent) {
    setModalError("");
    setModalMode("add");
    setModalGuest(null);
    setModalForm({ firstName: "", lastName: "", roomId });
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const w = 320;
      const pad = 8;
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
      if (left < pad) left = pad;
      if (top + 280 > window.innerHeight - pad) top = rect.top - 280 - 4;
      if (top < pad) top = pad;
      setModalAnchor({ top, left });
    } else setModalAnchor(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalAnchor(null);
  }

  function addGuestRow() {
    setForm((f) => ({ ...f, guests: [...f.guests, { firstName: "", lastName: "" }] }));
  }
  function removeGuestRow(index: number) {
    setForm((f) => {
      if (f.guests.length <= 1) return f;
      return { ...f, guests: f.guests.filter((_, i) => i !== index) };
    });
  }

  const roomStatusById = (() => {
    const map = new Map<string, "available" | "added" | "checked-in">();
    const allIds = getRoomIdListFromConfig(roomsPerFloor);
    allIds.forEach((id) => map.set(id, "available"));
    rooms.forEach((r) => {
      const checkedIn = r.guests?.some((g) => g.checkedIn && !g.checkedOut);
      map.set(r.roomId, checkedIn ? "checked-in" : "added");
    });
    return map;
  })();
  const availableRoomIds = getRoomIdListFromConfig(roomsPerFloor).filter((id) => roomStatusById.get(id) === "available");

  if (loading) return <p className="text-muted">Loading…</p>;
  return (
    <div className="page">
      <header className="page-header">
        <h1>Guests & Rooms</h1>
      </header>
      <div className="flex gap-3 mb-3 guests-add-and-map">
        <section className="card card-body add-room-card">
          <h2 className="add-room-title">Reserve room</h2>
          <form onSubmit={handleAddRoom} className="add-room-form form-stack">
            {formError && <p className="text-error add-room-error">{formError}</p>}
            <div className="add-room-field">
              <label className="add-room-label">Room</label>
              <select
                className="select add-room-input"
                value={availableRoomIds.includes(form.roomId) ? form.roomId : ""}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                required
              >
                <option value="">Select room…</option>
                {availableRoomIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              {availableRoomIds.length === 0 && <p className="text-muted add-room-hint">No available rooms. Add more guests from the rooms list below.</p>}
            </div>
            <div className="add-room-field">
              <div className="add-room-guests-header">
                <span className="add-room-label">Guests</span>
                <button type="button" className="btn btn-ghost btn-sm add-room-add-guest" onClick={addGuestRow}>Add guest</button>
              </div>
              <div className="add-room-guests-rows">
                {form.guests.map((g, i) => (
                  <div key={i} className="add-room-guest-row">
                    <input
                      className="input add-room-input"
                      value={g.firstName}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          guests: f.guests.map((guest, j) => (j === i ? { ...guest, firstName: e.target.value } : guest)),
                        }))
                      }
                      placeholder="First name"
                    />
                    <input
                      className="input add-room-input"
                      value={g.lastName}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          guests: f.guests.map((guest, j) => (j === i ? { ...guest, lastName: e.target.value } : guest)),
                        }))
                      }
                      placeholder="Last name"
                    />
                    {form.guests.length > 1 && i !== 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost add-room-remove guest-row-remove"
                        onClick={() => removeGuestRow(i)}
                        title="Remove guest row"
                        aria-label="Remove guest row"
                      >
                        ×
                      </button>
                    ) : (
                      <span className="add-room-remove-placeholder" aria-hidden />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-muted add-room-hint">Add more guests later from the rooms list below. Use “Add guest”.</p>
            </div>
            <button type="submit" className="btn btn-primary add-room-submit">Reserve room</button>
          </form>
        </section>
        <section className="card card-body room-map-wrap" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="room-map-header">
            <h2 className="room-map-title">Room map</h2>
            <div className="room-map-legend">
              <span className="room-map-legend-dot room-map-legend-dot--available" />
              <span className="room-map-legend-text">Available</span>
              <span className="room-map-legend-dot room-map-legend-dot--added" />
              <span className="room-map-legend-text">Reserved</span>
              <span className="room-map-legend-dot room-map-legend-dot--checked-in" />
              <span className="room-map-legend-text">Checked in</span>
            </div>
          </div>
          <div className="room-map">
            {getRoomsByFloorFromConfig(roomsPerFloor).map(({ floor, roomIds }) => (
              <div key={floor} className="room-map-floor">
                <span className="room-map-floor-num">Floor {floor}</span>
                <div className="room-map-grid">
                  {roomIds.map((id) => {
                    const status = roomStatusById.get(id) ?? "available";
                    const isAvailable = status === "available";
                    const isCheckedIn = status === "checked-in";
                    const isReserved = status === "added";
                    const isScrollable = isCheckedIn || isReserved;
                    const isClickable = isAvailable || isScrollable;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`room-map-cell room-map-cell--${status} ${!isClickable ? "room-map-cell--disabled" : ""} ${isScrollable ? "room-map-cell--scrollable" : ""}`}
                        onClick={() => {
                          if (isAvailable) setForm((f) => ({ ...f, roomId: id }));
                          if (isScrollable) scrollToRoomInList(id);
                        }}
                        title={isAvailable ? `${id} – Available (click to select)` : isCheckedIn ? `${id} – Checked in (click to scroll to room in list)` : isReserved ? `${id} – Reserved (click to scroll to room in list)` : `${id} – Reserved`}
                      >
                        {id}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={modalAnchor ? { position: "fixed", top: modalAnchor.top, left: modalAnchor.left, margin: 0 } : undefined}
          >
            <h2 className="modal-title">{modalMode === "edit" ? "Edit guest" : "Add additional guest to room"}</h2>
            <form onSubmit={handleModalSubmit} className="form-stack">
              {modalError && <p className="text-error" style={{ margin: 0 }}>{modalError}</p>}
              <div>
                <label className="label">First name</label>
                <input className="input" value={modalForm.firstName} onChange={(e) => setModalForm((f) => ({ ...f, firstName: e.target.value }))} required style={{ width: "100%" }} />
              </div>
              <div>
                <label className="label">Last name</label>
                <input className="input" value={modalForm.lastName} onChange={(e) => setModalForm((f) => ({ ...f, lastName: e.target.value }))} required style={{ width: "100%" }} />
              </div>
              {modalMode === "edit" && (
                <div>
                  <label className="label">Room</label>
                  <select
                    className="select"
                    value={modalForm.roomId}
                    onChange={(e) => setModalForm((f) => ({ ...f, roomId: e.target.value }))}
                    required
                    style={{ width: "100%" }}
                  >
                    <option value="">Select room…</option>
                    {(() => {
                      const list = getRoomIdListFromConfig(roomsPerFloor);
                      const hasCurrent = list.includes(modalForm.roomId);
                      if (modalForm.roomId && !hasCurrent) list.push(modalForm.roomId);
                      return list.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
                    })().map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-1 mt-2">
                <button type="submit" className="btn btn-primary">{modalMode === "edit" ? "Update" : "Add additional guest"}</button>
                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stayContextGuestId && (
        <div className="modal-overlay" onClick={() => setStayContextGuestId(null)}>
          <div className="modal" style={{ minWidth: 360, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">What Nova knows about this stay</h2>
            {stayContextAiLoading && <p className="text-muted mb-2">Generating AI summary…</p>}
            {stayContextAiSummary && !stayContextAiLoading && (
              <div className="card-body mb-2" style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}>
                <div className="section-title" style={{ marginBottom: "0.5rem" }}>AI summary</div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>{stayContextAiSummary.summary}</p>
                {stayContextAiSummary.tags.length > 0 && <p className="text-muted" style={{ margin: 0, fontSize: "0.85rem" }}>Tags: {stayContextAiSummary.tags.join(", ")}</p>}
              </div>
            )}
            {stayContextLoading ? (
              <p className="text-muted">Loading…</p>
            ) : stayContextMemories.length === 0 ? (
              <p className="text-muted">No memories yet for this guest this stay.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {stayContextMemories.map((mem, i) => (
                  <li key={i} className="mb-1">{mem}</li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-ghost mt-2" onClick={() => setStayContextGuestId(null)}>Close</button>
          </div>
        </div>
      )}

      {checkOutSummary && (
        <div className="modal-overlay" onClick={() => !checkOutInProgress && setCheckOutSummary(null)}>
          <div className="modal" style={{ minWidth: 400, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              Check-out summary · Room {checkOutSummary.roomId}
              {checkOutSummary.guests.length > 0 && (
                <span className="text-muted" style={{ fontWeight: 500, fontSize: "0.95rem" }}>
                  {" "}({checkOutSummary.guests.map((g) => `${g.guest.firstName} ${g.guest.lastName}`).join(", ")})
                </span>
              )}
            </h2>
            <p className="text-muted mb-2">Confirm nothing is left open, then check out all guests in this room.</p>
            {checkOutAiLoading && <p className="text-muted mb-2">Generating AI summary…</p>}
            {checkOutAiSummary && !checkOutAiLoading && (
              <div className="card-body mb-2" style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}>
                <div className="section-title" style={{ marginBottom: "0.5rem" }}>AI summary (all guests)</div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>{checkOutAiSummary.summary}</p>
                {checkOutAiSummary.tags.length > 0 && <p className="text-muted" style={{ margin: 0, fontSize: "0.85rem" }}>Tags: {checkOutAiSummary.tags.join(", ")}</p>}
              </div>
            )}
            {checkOutSummary.guests.map((entry, idx) => {
              const hasData = entry.memories.length > 0 || entry.requests.length > 0;
              return (
                <div key={entry.guest.id} className="mb-3" style={{ borderBottom: idx < checkOutSummary.guests.length - 1 ? "1px solid var(--border)" : undefined, paddingBottom: idx < checkOutSummary.guests.length - 1 ? "1rem" : 0 }}>
                  <div className="section-title" style={{ marginBottom: "0.35rem" }}>{entry.guest.firstName} {entry.guest.lastName}</div>
                  {entry.memories.length > 0 && (
                    <div className="mb-2">
                      <span className="text-muted" style={{ fontSize: "0.8125rem" }}>Stay context: </span>
                      <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0, fontSize: "0.9rem" }}>
                        {entry.memories.map((m, i) => (
                          <li key={i} className="mb-0">{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {entry.requests.length > 0 && (
                    <div className="mb-2">
                      <span className="text-muted" style={{ fontSize: "0.8125rem" }}>Requests & complaints: </span>
                      <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0, fontSize: "0.9rem" }}>
                        {entry.requests.map((r) => (
                          <li key={r.id} className="mb-0">
                            <strong>{r.type}</strong>: {r.description}
                            <span className="text-muted" style={{ marginLeft: "0.35rem", fontSize: "0.8125rem" }}>
                              {r.status === "closed" ? "— Fulfilled" : "— Open"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!hasData && <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>No requests or memories.</p>}
                </div>
              );
            })}
            <div className="flex gap-1 mt-2">
              <button type="button" className="btn btn-primary" onClick={handleCheckOutConfirm} disabled={checkOutInProgress}>
                {checkOutInProgress ? "Checking out…" : "Confirm check-out"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCheckOutSummary(null)} disabled={checkOutInProgress}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {programmingRoom && (
        <div className="modal-overlay">
          <div className="modal" style={{ minWidth: 400, textAlign: "center", padding: "2rem" }}>
            <h2 className="modal-title">NFC Programming: Room {programmingRoom.roomId}</h2>

            <div style={{ margin: "2rem 0" }}>
              {programmingStatus === "pending" && (
                <>
                  <div className="spinner mb-2" style={{ margin: "0 auto", width: 40, height: 40, border: "4px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <p><strong>Checking in Guest...</strong></p>
                  <p style={{ fontSize: "1.1rem", color: "var(--accent)", margin: "1rem 0" }}>
                    Please tap a keycard to the Reader for <strong>Room {programmingRoom.roomId}</strong>.
                  </p>
                </>
              )}

              {programmingStatus === "success" && (
                <>
                  <div style={{ fontSize: "3rem", color: "var(--success)", marginBottom: "1rem" }}>✓</div>
                  <p><strong>Success! Card Programmed.</strong></p>
                  <p className="text-muted">Finalizing check-in...</p>
                </>
              )}

              {programmingStatus === "failed" && (
                <>
                  <div style={{ fontSize: "3rem", color: "var(--error)", marginBottom: "1rem" }}>×</div>
                  <p><strong>Programming Failed.</strong></p>
                  <p className="text-muted">The hardware reported an error writing to the card.</p>
                  <button type="button" className="btn btn-primary mt-2" onClick={() => handleCheckInRoom(programmingRoom)}>Retry Programming</button>
                </>
              )}
            </div>

            <button type="button" className="btn btn-ghost" onClick={handleCancelProgramming}>Cancel Check-in</button>

            <style>{`
              @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
          </div>
        </div>
      )}

      <section className="card" style={{ overflow: "visible" }}>
        <div className="card-body">
          <h2 className="section-title">Rooms</h2>
          <div className="rooms-list-controls">
            <div className="rooms-control-group rooms-search-wrap">
              <label className="rooms-control-label">Search guest</label>
              <div className="rooms-search-input-wrap">
                <input
                  type="text"
                  className="input rooms-search-input"
                  placeholder="Search by name…"
                  value={roomsSearchQuery}
                  onChange={(e) => setRoomsSearchQuery(e.target.value)}
                  aria-label="Search guest name"
                />
                {roomsSearchQuery.trim() !== "" && (
                  <button
                    type="button"
                    className="btn btn-ghost rooms-search-clear"
                    onClick={() => setRoomsSearchQuery("")}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="rooms-control-group">
              <label className="rooms-control-label">Filter by status</label>
              <div className="rooms-filter-slider" role="group" aria-label="Filter by status">
                <button
                  type="button"
                  className={`rooms-filter-option ${roomsFilterStatus === "all" ? "rooms-filter-option--active" : ""}`}
                  onClick={() => setRoomsFilterStatus("all")}
                >
                  Show all
                </button>
                <button
                  type="button"
                  className={`rooms-filter-option ${roomsFilterStatus === "Reserved" ? "rooms-filter-option--active" : ""}`}
                  onClick={() => setRoomsFilterStatus("Reserved")}
                >
                  Only reserved
                </button>
                <button
                  type="button"
                  className={`rooms-filter-option ${roomsFilterStatus === "Checked in" ? "rooms-filter-option--active" : ""}`}
                  onClick={() => setRoomsFilterStatus("Checked in")}
                >
                  Only checked in
                </button>
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Guest</th>
                  <th>Guests</th>
                  <th>Status</th>
                  <th>Reserved</th>
                  <th>Checked in</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const getRoomStatus = (r: { id: string; roomId: string; guests: Guest[] }) => {
                    const main = [...(r.guests ?? [])].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())[0];
                    return !main ? "—" : main.checkedOut ? "Checked out" : main.checkedIn ? "Checked in" : "Reserved";
                  };
                  const searchLower = roomsSearchQuery.trim().toLowerCase();
                  const guestMatchesSearch = (r: { id: string; roomId: string; guests: Guest[] }) => {
                    if (!searchLower) return true;
                    return (r.guests ?? []).some(
                      (g) =>
                        (g.firstName ?? "").toLowerCase().includes(searchLower) ||
                        (g.lastName ?? "").toLowerCase().includes(searchLower)
                    );
                  };
                  let list = rooms;
                  if (roomsFilterStatus !== "all") list = list.filter((r) => getRoomStatus(r) === roomsFilterStatus);
                  if (searchLower) list = list.filter(guestMatchesSearch);
                  list = [...list].sort((a, b) => String(a.roomId).localeCompare(String(b.roomId), undefined, { numeric: true }));
                  const autoExpandedRoomIds = new Set<string>();
                  if (searchLower) {
                    list.forEach((r) => {
                      const sorted = [...(r.guests ?? [])].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
                      const additional = sorted.slice(1);
                      const additionalMatches = additional.some(
                        (g) =>
                          (g.firstName ?? "").toLowerCase().includes(searchLower) ||
                          (g.lastName ?? "").toLowerCase().includes(searchLower)
                      );
                      if (additionalMatches) autoExpandedRoomIds.add(r.id);
                    });
                  }
                  return list.map((r) => {
                    const sortedGuests = [...(r.guests ?? [])].sort(
                      (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
                    );
                    const main = sortedGuests[0];
                    const additional = sortedGuests.slice(1);
                    const statusText = !main ? "—" : main.checkedOut ? "Checked out" : main.checkedIn ? "Checked in" : "Reserved";
                    const isExpanded = expandedRoomId === r.id || (searchLower !== "" && autoExpandedRoomIds.has(r.id));
                    return (
                      <Fragment key={r.id}>
                        <tr id={`room-row-${r.roomId}`} className={highlightedRoomId === r.roomId ? "room-row-highlight" : ""}>
                          <td style={{ whiteSpace: "nowrap" }}>{r.roomId}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{main ? `${main.firstName} ${main.lastName}` : "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span className="flex align-center" style={{ gap: "0.35rem" }}>
                              {(r.guests ?? []).length}
                              {additional.length > 0 && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedRoomId(isExpanded ? null : r.id)} title="Additional guests in this room" style={{ marginLeft: 0, paddingLeft: 0, paddingRight: 0, fontSize: "0.8rem" }}>
                                  {isExpanded ? "Hide" : "Show"}
                                </button>
                              )}
                            </span>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>{statusText}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{main ? formatTime(main.createdAt) : "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{main && main.checkedInAt ? formatTime(main.checkedInAt) : "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <div className="flex align-center gap-1" style={{ gap: "0.35rem", flexWrap: "nowrap" }}>
                              <button type="button" className="btn btn-sm" onClick={(e) => openAddGuestModal(r.roomId, e)}>Add guest</button>
                              {main && (
                                <>
                                  <span className="flex align-center">
                                    {!main.checkedIn && !main.checkedOut && <button type="button" className="btn btn-sm btn-accent" style={{ minWidth: "5.5rem" }} onClick={() => handleCheckInRoom(r)}>Check-in</button>}
                                    {main.checkedIn && !main.checkedOut && <button type="button" className="btn btn-sm btn-primary" style={{ minWidth: "5.5rem" }} onClick={() => handleCheckOutClick(r)}>Check-out</button>}
                                  </span>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleArchiveRoom(r)}>Archive</button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    title="More actions"
                                    onClick={(e) => {
                                      if (moreMenuGuestId === main.id) {
                                        setMoreMenuGuestId(null);
                                        setMoreMenuPosition(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const menuWidth = 160;
                                        const padding = 8;
                                        let left = rect.left;
                                        let top = rect.bottom + 4;
                                        if (left + menuWidth > window.innerWidth - padding) left = window.innerWidth - menuWidth - padding;
                                        if (left < padding) left = padding;
                                        if (top + 120 > window.innerHeight - padding) top = rect.top - 120 - 4;
                                        if (top < padding) top = padding;
                                        setMoreMenuPosition({ top, left });
                                        setMoreMenuGuestId(main.id);
                                      }
                                    }}
                                    style={{ padding: "0.35rem 0.5rem" }}
                                  >
                                    More {moreMenuGuestId === main.id ? "▲" : "▼"}
                                  </button>
                                  {moreMenuGuestId === main.id && moreMenuPosition && (
                                    <>
                                      <div style={{ position: "fixed", inset: 0, zIndex: 1 }} onClick={() => { setMoreMenuGuestId(null); setMoreMenuPosition(null); }} />
                                      <div className="card" style={{ position: "fixed", top: moreMenuPosition.top, left: moreMenuPosition.left, zIndex: 2, minWidth: 160, padding: "0.25rem 0" }}>
                                        {main.checkedIn && !main.checkedOut && (
                                          <>
                                            <button type="button" className="btn btn-ghost" style={{ display: "block", width: "100%", justifyContent: "flex-start" }} onClick={() => { handleCheckInRoom(r); setMoreMenuGuestId(null); setMoreMenuPosition(null); }}>Register another card</button>
                                            <button type="button" className="btn btn-ghost" style={{ display: "block", width: "100%", justifyContent: "flex-start" }} onClick={() => { handleUndoCheckIn(r); setMoreMenuGuestId(null); setMoreMenuPosition(null); }}>Mark as reserved</button>
                                          </>
                                        )}
                                        <button type="button" className="btn btn-ghost" style={{ display: "block", width: "100%", justifyContent: "flex-start" }} onClick={() => { setStayContextGuestId(main.id); setMoreMenuGuestId(null); setMoreMenuPosition(null); }}>Stay context</button>
                                        <button type="button" className="btn btn-ghost" style={{ display: "block", width: "100%", justifyContent: "flex-start" }} onClick={() => { handlePrintSummary(main.id); setMoreMenuGuestId(null); setMoreMenuPosition(null); }}>Print summary</button>
                                        <button type="button" className="btn btn-ghost text-error" style={{ display: "block", width: "100%", justifyContent: "flex-start" }} onClick={() => { handleDeleteRoom(r); setMoreMenuGuestId(null); setMoreMenuPosition(null); }}>Delete</button>
                                      </div>
                                    </>
                                  )}
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => openEditModal(main, r.roomId, e)}>Edit</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{ padding: 0, verticalAlign: "top", borderBottom: "1px solid var(--border)" }}>
                              <div className="card-body" style={{ background: "var(--surface-hover)", padding: "1rem" }}>
                                {previousStayByRoom[r.roomId] && (previousStayByRoom[r.roomId].memories.length > 0 || previousStayByRoom[r.roomId].guest) && (
                                  <div className="card-body mb-2" style={{ marginBottom: "0.75rem" }}>
                                    <div className="section-title" style={{ marginBottom: "0.5rem" }}>Previous stay in this room</div>
                                    {previousStayByRoom[r.roomId].guest && (
                                      <div className="text-muted mb-1" style={{ fontSize: "0.85rem" }}>{previousStayByRoom[r.roomId].guest!.firstName} {previousStayByRoom[r.roomId].guest!.lastName}</div>
                                    )}
                                    {previousStayByRoom[r.roomId].memories.length > 0 ? (
                                      <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.9rem" }}>
                                        {previousStayByRoom[r.roomId].memories.map((mem, i) => (
                                          <li key={i} className="mb-1">{mem}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-muted" style={{ margin: 0, fontSize: "0.85rem" }}>No memories from previous stay.</p>
                                    )}
                                  </div>
                                )}
                                {additional.length > 0 && (
                                  <>
                                    <div className="section-title" style={{ marginBottom: "0.5rem" }}>Additional guests</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                      {additional.map((g) => (
                                        <div key={g.id} className="flex flex-wrap align-center gap-1" style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                                          <span style={{ minWidth: 120 }}>{g.firstName} {g.lastName}</span>
                                          <span style={{ flex: 1 }} />
                                          <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => openEditModal(g, r.roomId, e)}>Edit</button>
                                          <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => handleDeleteGuest(g)}>Delete guest</button>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="card mt-3" style={{ overflow: "visible" }}>
        <div className="card-body">
          <div className="flex align-center gap-2" style={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: archivedSectionExpanded ? "0.75rem" : 0 }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 4 }}>Archived rooms</h2>
              <p className="text-muted" style={{ margin: 0 }}>
                {archivedSectionExpanded
                  ? "Checked-out or archived rooms are listed here."
                  : (() => {
                    const byRoom = new Map<string, Guest[]>();
                    for (const g of archivedGuests) {
                      const id = g.roomId;
                      if (!byRoom.has(id)) byRoom.set(id, []);
                      byRoom.get(id)!.push(g);
                    }
                    const count = byRoom.size;
                    return count === 0 ? "No archived rooms yet." : `${count} archived room${count === 1 ? "" : "s"}.`;
                  })()}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setArchivedSectionExpanded((v) => !v)}
            >
              {archivedSectionExpanded ? "Hide" : "Show"}
            </button>
          </div>
          {archivedSectionExpanded && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Guest</th>
                    <th>Archived via</th>
                    <th>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const byRoom = new Map<string, Guest[]>();
                    for (const g of archivedGuests) {
                      const id = g.roomId;
                      if (!byRoom.has(id)) byRoom.set(id, []);
                      byRoom.get(id)!.push(g);
                    }
                    const archivedRooms = Array.from(byRoom.entries()).map(([id, guests]) => {
                      const sorted = [...guests].sort(
                        (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
                      );
                      const roomDisplayId = (sorted[0] as Guest & { room?: { roomId: string } }).room?.roomId ?? "—";
                      return { id, roomId: roomDisplayId, guests: sorted };
                    });
                    if (archivedRooms.length === 0) {
                      return <tr><td colSpan={5} className="text-muted" style={{ padding: "1.5rem" }}>No archived rooms yet.</td></tr>;
                    }
                    return archivedRooms.map((ar) => {
                      const main = ar.guests[0];
                      const additional = ar.guests.slice(1);
                      const isExpanded = expandedArchivedRoomId === ar.id;
                      return (
                        <Fragment key={ar.id}>
                          <tr>
                            <td>{ar.roomId}</td>
                            <td>
                              {main ? `${main.firstName} ${main.lastName}` : "—"}
                              {additional.length > 0 && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedArchivedRoomId(isExpanded ? null : ar.id)} style={{ marginLeft: 4 }}>
                                  Additional guests ({additional.length}) {isExpanded ? "▼" : "▶"}
                                </button>
                              )}
                            </td>
                            <td>{main ? archiveReasonLabel(main.archivedVia) : "—"}</td>
                            <td>{main ? formatTime(main.checkedOutAt) : "—"}</td>
                            <td>
                              <button type="button" className="btn btn-sm" onClick={() => handleRestoreRoom(ar)}>Re-add to rooms</button>
                              {" "}
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDeleteRoom(ar)}>Delete room</button>
                            </td>
                          </tr>
                          {isExpanded && additional.length > 0 && (
                            <tr>
                              <td colSpan={5} style={{ padding: 0, verticalAlign: "top", borderBottom: "1px solid var(--border)" }}>
                                <div className="card-body" style={{ background: "var(--surface-hover)", padding: "1rem" }}>
                                  <div className="section-title" style={{ marginBottom: "0.5rem" }}>Additional guests</div>
                                  {additional.map((g) => (
                                    <div key={g.id} className="flex align-center gap-1 mb-1" style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                                      <span style={{ minWidth: 120 }}>{g.firstName} {g.lastName}</span>
                                      <span className="text-muted">{archiveReasonLabel(g.archivedVia)}</span>
                                      <span className="text-muted" style={{ fontSize: "0.85rem" }}>{formatTime(g.checkedOutAt)}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
