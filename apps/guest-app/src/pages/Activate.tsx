import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGuestAuth } from "../guestToken";

const API_BASE = "";

export default function Activate() {
  const navigate = useNavigate();
  const { setGuestToken } = useGuestAuth();
  const [roomId, setRoomId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!roomId.trim() || !firstName.trim() || !lastName.trim()) {
      setError("Room number, first name, and last name are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/me/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomId.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Activation failed. Check room number and name.");
        return;
      }
      if (data.token) {
        setGuestToken(data.token);
        navigate("/", { replace: true });
      } else {
        setError("Invalid response. Please try again.");
      }
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 360, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Activate your room</h1>
      <p style={{ color: "#888", marginBottom: 24 }}>Enter your room number and name.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Room number"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          autoComplete="off"
          style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}
        />
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}
        />
        <input
          type="text"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}
        />
        {error && <p style={{ color: "#e66", fontSize: 14, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 14, fontSize: 16, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Activating…" : "Activate"}
        </button>
      </form>
    </div>
  );
}
