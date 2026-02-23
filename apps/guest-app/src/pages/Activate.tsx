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
    <div className="g-screen g-screen-centered">
      <div className="g-card g-max-w" style={{ padding: "32px 24px" }}>
        <h1 className="g-page-title g-mb-1">Activate your room</h1>
        <p className="g-subtitle g-mb-3">Enter your room number and name to get started.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="g-input g-mb-2"
            placeholder="Room number"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            autoComplete="off"
          />
          <input
            type="text"
            className="g-input g-mb-2"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          <input
            type="text"
            className="g-input g-mb-2"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          {error && <p className="g-error-msg g-mb-2">{error}</p>}
          <button type="submit" className="g-btn g-btn-primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Activating…" : "Activate"}
          </button>
        </form>
      </div>
    </div>
  );
}
