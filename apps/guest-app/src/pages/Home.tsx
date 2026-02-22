import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useGuestToken, useGuestAuth } from "../guestToken";

export default function Home() {
  const token = useGuestToken();
  const { setGuestToken } = useGuestAuth();
  const [conciergeAllowed, setConciergeAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/me?guest_token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { conciergeAllowed?: boolean }) => setConciergeAllowed(data.conciergeAllowed ?? false))
      .catch(() => setConciergeAllowed(false));
  }, [token]);

  if (conciergeAllowed === false) {
    return (
      <div style={{ padding: 24, maxWidth: 400, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ marginTop: 0 }}>Stay ended</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>You have checked out. Nova is no longer available.</p>
        <button
          type="button"
          onClick={() => setGuestToken(null)}
          style={{ padding: "12px 24px", fontSize: 16, background: "#333", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ marginTop: 0 }}>Your room</h1>
      <p style={{ color: "#888", marginBottom: 32 }}>Ready to talk to Nova?</p>
      <Link
        to="/concierge"
        style={{ padding: "16px 32px", fontSize: 18, background: "#3b82f6", color: "#fff", textDecoration: "none", borderRadius: 12 }}
      >
        Open Nova
      </Link>
    </div>
  );
}
