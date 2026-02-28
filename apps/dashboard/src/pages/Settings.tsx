import { useState, useEffect } from "react";
import { useSettings } from "../context/SettingsContext";
import { getRoomIdListFromConfig, getRoomsByFloorFromConfig } from "../config/hotel";

export default function Settings() {
  const { hotelLayout, hotelName, hasCustomPassword, loading, error, refetch } = useSettings();
  const [hotelNameEdit, setHotelNameEdit] = useState("");
  const [roomsPerFloorEdit, setRoomsPerFloorEdit] = useState<number[]>([]);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectStatus, setInspectStatus] = useState<"idle" | "pending" | "success" | "failed">("idle");
  const [inspectRoomId, setInspectRoomId] = useState<string | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  useEffect(() => {
    setHotelNameEdit(hotelName ?? "");
  }, [hotelName]);

  useEffect(() => {
    if (hotelLayout && hotelLayout.length > 0) {
      setRoomsPerFloorEdit([...hotelLayout]);
    } else {
      setRoomsPerFloorEdit([6, 4, 6, 8]);
    }
  }, [hotelLayout]);

  async function saveHotelName() {
    setNameMessage(null);
    setNameSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelName: hotelNameEdit.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameMessage({ type: "err", text: data.error || "Failed to save" });
        return;
      }
      setNameMessage({ type: "ok", text: "Saved." });
      await refetch();
    } finally {
      setNameSaving(false);
    }
  }

  async function saveLayout() {
    setLayoutMessage(null);
    if (roomsPerFloorEdit.some((n) => n < 1 || n > 99)) {
      setLayoutMessage({ type: "err", text: "Each floor must have 1–99 rooms." });
      return;
    }
    setLayoutSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelLayout: { roomsPerFloor: roomsPerFloorEdit } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLayoutMessage({ type: "err", text: data.error || "Failed to save" });
        return;
      }
      setLayoutMessage({ type: "ok", text: "Layout saved." });
      await refetch();
    } finally {
      setLayoutSaving(false);
    }
  }

  async function savePassword() {
    setPasswordMessage(null);
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordMessage({ type: "err", text: "New password and confirmation do not match." });
      return;
    }
    if (passwordForm.new.length < 6) {
      setPasswordMessage({ type: "err", text: "New password must be at least 6 characters." });
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({ type: "err", text: data.error || "Failed to update password." });
        return;
      }
      setPasswordMessage({ type: "ok", text: "Password updated." });
      setPasswordForm({ current: "", new: "", confirm: "" });
      await refetch();
    } finally {
      setPasswordSaving(false);
    }
  }

  function addFloor() {
    setRoomsPerFloorEdit((prev) => [...prev, 4]);
  }

  function removeFloor() {
    if (roomsPerFloorEdit.length <= 1) return;
    setRoomsPerFloorEdit((prev) => prev.slice(0, -1));
  }

  function setFloorCount(floorIndex: number, value: number) {
    const n = Math.max(1, Math.min(99, value));
    setRoomsPerFloorEdit((prev) => {
      const next = [...prev];
      next[floorIndex] = n;
      return next;
    });
  }

  async function startCardRoomCheck() {
    setInspectError(null);
    setInspectRoomId(null);
    setInspectLoading(true);
    try {
      const res = await fetch("/api/nfc/inspect-card/queue", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInspectError(data.error || "Failed to start card check.");
        return;
      }
      setInspectStatus("pending");
    } finally {
      setInspectLoading(false);
    }
  }

  useEffect(() => {
    if (inspectStatus !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/nfc/inspect-card/status");
        if (!res.ok) return;
        const data = await res.json().catch(() => null) as {
          status?: "idle" | "pending" | "success" | "failed";
          roomId?: string | null;
        } | null;
        if (!data?.status) return;
        if (data.status === "success") {
          setInspectStatus("success");
          setInspectRoomId(data.roomId ?? null);
        } else if (data.status === "failed") {
          setInspectStatus("failed");
        }
      } catch {
        // ignore poll error
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [inspectStatus]);

  if (loading) {
    return (
      <div style={{ color: "var(--text-muted)", padding: "1rem 0" }}>
        Loading settings…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "1rem 0" }}>
        <p style={{ color: "var(--error)", marginBottom: "0.5rem" }}>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const byFloor = getRoomsByFloorFromConfig(roomsPerFloorEdit);

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 600, marginBottom: "1.5rem", color: "var(--text)" }}>
        Settings
      </h1>

      {/* Hotel name */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
          Hotel name
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Optional display name for the property.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={hotelNameEdit}
            onChange={(e) => setHotelNameEdit(e.target.value)}
            placeholder="e.g. Sunset Inn"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              minWidth: 200,
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveHotelName}
            disabled={nameSaving}
          >
            {nameSaving ? "Saving…" : "Save"}
          </button>
          {nameMessage && (
            <span style={{ color: nameMessage.type === "ok" ? "var(--success)" : "var(--error)", fontSize: "var(--text-sm)" }}>
              {nameMessage.text}
            </span>
          )}
        </div>
      </section>

      {/* Hotel layout */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
          Hotel layout
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Set the number of rooms per floor. Room IDs will be 101, 102, … for floor 1; 201, 202, … for floor 2; etc.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {roomsPerFloorEdit.map((count, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ minWidth: 80, color: "var(--text)" }}>Floor {i + 1}</label>
              <input
                type="number"
                min={1}
                max={99}
                value={count}
                onChange={(e) => setFloorCount(i, parseInt(e.target.value, 10) || 0)}
                style={{
                  width: 72,
                  padding: "0.5rem 0.5rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                rooms → {byFloor[i]?.roomIds.slice(0, 5).join(", ")}
                {byFloor[i] && byFloor[i].roomIds.length > 5 ? "…" : ""}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={addFloor}>
            Add floor
          </button>
          <button type="button" className="btn btn-ghost" onClick={removeFloor} disabled={roomsPerFloorEdit.length <= 1}>
            Remove floor
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveLayout}
            disabled={layoutSaving}
          >
            {layoutSaving ? "Saving…" : "Save layout"}
          </button>
          {layoutMessage && (
            <span style={{ color: layoutMessage.type === "ok" ? "var(--success)" : "var(--error)", fontSize: "var(--text-sm)" }}>
              {layoutMessage.text}
            </span>
          )}
        </div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          Total rooms: {getRoomIdListFromConfig(roomsPerFloorEdit).length}
        </p>
      </section>

      {/* Change password */}
      <section>
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
          Change manager password
        </h2>
        {hasCustomPassword && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            A custom password is set. Use it to log in instead of the default.
          </p>
        )}
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Set a custom password for manager login. Leave new password blank to keep the current one.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 280, marginBottom: "0.75rem" }}>
          <input
            type="password"
            placeholder="Current password"
            value={passwordForm.current}
            onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          />
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            value={passwordForm.new}
            onChange={(e) => setPasswordForm((p) => ({ ...p, new: e.target.value }))}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={savePassword}
            disabled={passwordSaving || !passwordForm.current || !passwordForm.new || !passwordForm.confirm}
          >
            {passwordSaving ? "Updating…" : "Update password"}
          </button>
          {passwordMessage && (
            <span style={{ color: passwordMessage.type === "ok" ? "var(--success)" : "var(--error)", fontSize: "var(--text-sm)" }}>
              {passwordMessage.text}
            </span>
          )}
        </div>
      </section>

      {/* Card room checker */}
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
          Card room checker
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Start scan mode, tap a key card on the reader, then see which room is encoded on the card.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={startCardRoomCheck}
            disabled={inspectLoading || inspectStatus === "pending"}
          >
            {inspectStatus === "pending" ? "Waiting for card scan…" : inspectLoading ? "Starting…" : "Check card room"}
          </button>
          {inspectStatus === "success" && inspectRoomId && (
            <span style={{ color: "var(--success)", fontSize: "var(--text-sm)" }}>
              Card is registered to room {inspectRoomId}.
            </span>
          )}
          {inspectStatus === "failed" && (
            <span style={{ color: "var(--error)", fontSize: "var(--text-sm)" }}>
              Could not read room from card. Try again.
            </span>
          )}
          {inspectError && (
            <span style={{ color: "var(--error)", fontSize: "var(--text-sm)" }}>
              {inspectError}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
