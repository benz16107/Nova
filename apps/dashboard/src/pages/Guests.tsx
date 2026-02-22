import { useState, useEffect, Fragment } from "react";

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
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function Guests() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [rooms, setRooms] = useState<{ id: string; roomId: string; guests: Guest[] }[]>([]);
  const [archivedGuests, setArchivedGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    roomId: "",
    guests: [{ firstName: "", lastName: "" }] as { firstName: string; lastName: string }[],
  });
  const [formError, setFormError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [modalGuest, setModalGuest] = useState<Guest | null>(null);
  const [modalForm, setModalForm] = useState({ firstName: "", lastName: "", roomId: "" });
  const [modalError, setModalError] = useState("");
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [expandedArchivedRoomId, setExpandedArchivedRoomId] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [gRes, rRes, aRes] = await Promise.all([
        fetch("/api/guests"),
        fetch("/api/rooms"),
        fetch("/api/guests?archived=true"),
      ]);
      if (gRes.ok) setGuests(await gRes.json());
      if (rRes.ok) setRooms(await rRes.json());
      if (aRes.ok) setArchivedGuests(await aRes.json());
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

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const roomId = form.roomId.trim();
    const guestsToAdd = form.guests.filter((g) => g.firstName.trim() && g.lastName.trim());
    if (!roomId) {
      setFormError("Room number is required.");
      return;
    }
    if (guestsToAdd.length === 0) {
      setFormError("At least one guest (first and last name) is required.");
      return;
    }
    for (const g of guestsToAdd) {
      const res = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: g.firstName.trim(), lastName: g.lastName.trim(), roomId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError((data as { error?: string }).error || "Failed to add room/guests.");
        return;
      }
    }
    setForm({ roomId: "", guests: [{ firstName: "", lastName: "" }] });
    load();
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
        setModalOpen(false);
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
        setModalOpen(false);
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
      if (modalGuest?.id === g.id) setModalOpen(false);
      load();
    }
  }

  async function handleDeleteRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Delete room ${room.roomId} and all guests? This cannot be undone.`)) return;
    const res = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
    if (res.ok) {
      if (modalGuest && room.guests?.some((g) => g.id === modalGuest.id)) setModalOpen(false);
      load();
    }
  }

  async function handleRestoreRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Re-add room ${room.roomId} and all guests to the room list? They will appear as not checked in.`)) return;
    const res = await fetch(`/api/rooms/${room.id}/restore`, { method: "POST" });
    if (res.ok) load();
  }

  async function handleCheckInRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    for (const g of room.guests ?? []) {
      await fetch(`/api/guests/${g.id}/check-in`, { method: "POST" });
    }
    load();
  }

  async function handleCheckOutRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Check out room ${room.roomId} and all guests? They will no longer be able to use Nova and will be moved to the archived list.`)) return;
    for (const g of room.guests ?? []) {
      await fetch(`/api/guests/${g.id}/check-out`, { method: "POST" });
    }
    load();
  }

  async function handleArchiveRoom(room: { id: string; roomId: string; guests: Guest[] }) {
    if (!confirm(`Archive room ${room.roomId} and all guests? They will be moved to the archived list and can no longer use Nova.`)) return;
    for (const g of room.guests ?? []) {
      await fetch(`/api/guests/${g.id}/archive`, { method: "POST" });
    }
    load();
  }

  function openEditModal(g: Guest, roomNumber?: string) {
    setModalError("");
    setModalMode("edit");
    setModalGuest(g);
    setModalForm({
      firstName: g.firstName,
      lastName: g.lastName,
      roomId: roomNumber ?? (g as Guest & { room?: { roomId: string } }).room?.roomId ?? "",
    });
    setModalOpen(true);
  }

  function openAddGuestModal(roomId: string) {
    setModalError("");
    setModalMode("add");
    setModalGuest(null);
    setModalForm({ firstName: "", lastName: "", roomId });
    setModalOpen(true);
  }

  function addGuestRow() {
    setForm((f) => ({ ...f, guests: [...f.guests, { firstName: "", lastName: "" }] }));
  }

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <h1>Guests & Rooms</h1>
      <section style={{ marginBottom: 32 }}>
        <h2>Add room</h2>
        <form onSubmit={handleAddRoom} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
          {formError && <p style={{ color: "#c00", margin: 0, fontSize: 14 }}>{formError}</p>}
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Room number</label>
            <input
              value={form.roomId}
              onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
              placeholder="e.g. 101"
              required
              style={{ width: "100%", maxWidth: 120, padding: 8, boxSizing: "border-box" }}
            />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Guests</span>
              <button type="button" onClick={addGuestRow} style={{ fontSize: 13 }}>
                Add additional guest
              </button>
            </div>
            {form.guests.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  value={g.firstName}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      guests: f.guests.map((guest, j) => (j === i ? { ...guest, firstName: e.target.value } : guest)),
                    }))
                  }
                  placeholder="First name"
                  style={{ flex: 1, padding: 8, boxSizing: "border-box" }}
                />
                <input
                  value={g.lastName}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      guests: f.guests.map((guest, j) => (j === i ? { ...guest, lastName: e.target.value } : guest)),
                    }))
                  }
                  placeholder="Last name"
                  style={{ flex: 1, padding: 8, boxSizing: "border-box" }}
                />
              </div>
            ))}
          </div>
          <button type="submit">Add room</button>
        </form>
      </section>

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 12,
              minWidth: 320,
              maxWidth: "90vw",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{modalMode === "edit" ? "Edit guest" : "Add additional guest to room"}</h3>
            <form onSubmit={handleModalSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {modalError && <p style={{ color: "#c00", margin: 0, fontSize: 14 }}>{modalError}</p>}
              <div>
                <label style={{ display: "block", marginBottom: 4 }}>First name</label>
                <input
                  value={modalForm.firstName}
                  onChange={(e) => setModalForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                  style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4 }}>Last name</label>
                <input
                  value={modalForm.lastName}
                  onChange={(e) => setModalForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                  style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
                />
              </div>
              {modalMode === "edit" && (
                <div>
                  <label style={{ display: "block", marginBottom: 4 }}>Room</label>
                  <input
                    value={modalForm.roomId}
                    onChange={(e) => setModalForm((f) => ({ ...f, roomId: e.target.value }))}
                    placeholder="e.g. 101"
                    required
                    style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
                  />
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="submit">{modalMode === "edit" ? "Update" : "Add additional guest"}</button>
                <button type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <section>
        <h2>Rooms</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Room</th>
              <th style={{ textAlign: "left", padding: 8 }}>Guest</th>
              <th style={{ textAlign: "left", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", padding: 8 }}>Time</th>
              <th style={{ textAlign: "left", padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              // First-added guest (by createdAt) is main; rest are additional
              const sortedGuests = [...(r.guests ?? [])].sort(
                (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
              );
              const main = sortedGuests[0];
              const additional = sortedGuests.slice(1);
              const statusText = !main
                ? "—"
                : main.checkedOut
                  ? "Checked out"
                  : main.checkedIn
                    ? "Checked in"
                    : "Not checked in";
              const statusTime = !main ? "—" : main.checkedIn ? formatTime(main.checkedInAt) : formatTime(main.createdAt);
              const isExpanded = expandedRoomId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{r.roomId}</td>
                    <td style={{ padding: 8 }}>
                      {main ? `${main.firstName} ${main.lastName}` : "—"}
                      {additional.length > 0 && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => setExpandedRoomId(isExpanded ? null : r.id)}
                            style={{ marginLeft: 4 }}
                            title="Additional guests (same room account)"
                          >
                            Additional guests ({additional.length}) {isExpanded ? "▼" : "▶"}
                          </button>
                        </>
                      )}
                    </td>
                    <td style={{ padding: 8 }}>{statusText}</td>
                    <td style={{ padding: 8 }}>{statusTime}</td>
                    <td style={{ padding: 8 }}>
                      <button type="button" onClick={() => openAddGuestModal(r.roomId)}>Add additional guest</button>
                      {main && (
                        <>
                          {" "}
                          {!main.checkedIn && !main.checkedOut && (
                            <button type="button" onClick={() => handleCheckInRoom(r)}>Check-in</button>
                          )}
                          {main.checkedIn && !main.checkedOut && (
                            <button type="button" onClick={() => handleCheckOutRoom(r)}>Check-out</button>
                          )}
                          {" "}
                          <button type="button" onClick={() => handleArchiveRoom(r)}>Archive room</button>
                          {" "}
                          <button type="button" onClick={() => openEditModal(main, r.roomId)}>Edit</button>
                          {" "}
                          <button type="button" onClick={() => handleDeleteRoom(r)}>Delete room</button>
                        </>
                      )}
                    </td>
                  </tr>
                  {isExpanded && additional.length > 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, verticalAlign: "top", borderBottom: "1px solid #eee" }}>
                        <div style={{ padding: "12px 8px", background: "#f9f9f9" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                            Additional guests (same room account — checked in/out and archived with main guest)
                          </div>
                          {additional.map((g) => (
                            <div
                              key={g.id}
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                marginBottom: 4,
                                background: "#fff",
                                borderRadius: 6,
                                border: "1px solid #eee",
                              }}
                            >
                              <span style={{ minWidth: 120 }}>{g.firstName} {g.lastName}</span>
                              <span style={{ flex: 1 }} />
                              <button type="button" onClick={() => openEditModal(g, r.roomId)}>Edit</button>
                              <button type="button" onClick={() => handleDeleteGuest(g)}>Delete guest</button>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
      <section style={{ marginTop: 32 }}>
        <h2>Archived rooms</h2>
        <p style={{ color: "#666", marginBottom: 8 }}>Checked-out or archived rooms are listed here.</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Room</th>
              <th style={{ textAlign: "left", padding: 8 }}>Guest</th>
              <th style={{ textAlign: "left", padding: 8 }}>Archived via</th>
              <th style={{ textAlign: "left", padding: 8 }}>Time</th>
              <th style={{ textAlign: "left", padding: 8 }}></th>
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
                return (
                  <tr><td colSpan={5} style={{ padding: 16, color: "#888" }}>No archived rooms yet.</td></tr>
                );
              }
              return archivedRooms.map((ar) => {
                const main = ar.guests[0];
                const additional = ar.guests.slice(1);
                const isExpanded = expandedArchivedRoomId === ar.id;
                return (
                  <Fragment key={ar.id}>
                    <tr style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{ar.roomId}</td>
                      <td style={{ padding: 8 }}>
                        {main ? `${main.firstName} ${main.lastName}` : "—"}
                        {additional.length > 0 && (
                          <>
                            {" "}
                            <button
                              type="button"
                              onClick={() => setExpandedArchivedRoomId(isExpanded ? null : ar.id)}
                              style={{ marginLeft: 4 }}
                            >
                              Additional guests ({additional.length}) {isExpanded ? "▼" : "▶"}
                            </button>
                          </>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>{main ? archiveReasonLabel(main.archivedVia) : "—"}</td>
                      <td style={{ padding: 8 }}>{main ? formatTime(main.checkedOutAt) : "—"}</td>
                      <td style={{ padding: 8 }}>
                        <button type="button" onClick={() => handleRestoreRoom(ar)}>Re-add to rooms</button>
                        {" "}
                        <button type="button" onClick={() => handleDeleteRoom(ar)}>Delete room</button>
                      </td>
                    </tr>
                    {isExpanded && additional.length > 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0, verticalAlign: "top", borderBottom: "1px solid #eee" }}>
                          <div style={{ padding: "12px 8px", background: "#f9f9f9" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Additional guests</div>
                            {additional.map((g) => (
                              <div
                                key={g.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 12px",
                                  marginBottom: 4,
                                  background: "#fff",
                                  borderRadius: 6,
                                  border: "1px solid #eee",
                                }}
                              >
                                <span style={{ minWidth: 120 }}>{g.firstName} {g.lastName}</span>
                                <span style={{ color: "#666" }}>{archiveReasonLabel(g.archivedVia)}</span>
                                <span style={{ color: "#666", fontSize: 13 }}>{formatTime(g.checkedOutAt)}</span>
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
      </section>
    </div>
  );
}
