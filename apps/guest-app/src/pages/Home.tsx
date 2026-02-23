import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useGuestToken, useGuestAuth } from "../guestToken";

export default function Home() {
  const token = useGuestToken();
  const { setGuestToken } = useGuestAuth();
  const [conciergeAllowed, setConciergeAllowed] = useState<boolean | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/me?guest_token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { conciergeAllowed?: boolean; guest?: { firstName?: string } }) => {
        setConciergeAllowed(data.conciergeAllowed ?? false);
        if (data?.guest?.firstName) setGuestName(data.guest.firstName);
      })
      .catch(() => setConciergeAllowed(false));
  }, [token]);

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    const content = feedbackText.trim();
    if (!content || !token || feedbackSending) return;
    setFeedbackSending(true);
    setFeedbackSent(false);
    try {
      const r = await fetch(`/api/feedback?guest_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, source: "text" }),
      });
      if (r.ok) {
        setFeedbackText("");
        setFeedbackSent(true);
      }
    } catch {
      // ignore
    } finally {
      setFeedbackSending(false);
    }
  }

  if (conciergeAllowed === false) {
    return (
      <div className="g-screen g-screen-centered">
        <div className="g-max-w-wide">
          <h1 className="g-page-title g-mb-1">You have checked out</h1>
          <p className="g-subtitle g-mb-3">Thank you for staying with us. We hope you had a great stay.</p>
          {!feedbackSent ? (
            <div className="g-card g-mb-3" style={{ padding: 24, textAlign: "left" }}>
              <label className="g-mb-1" style={{ display: "block", fontSize: "0.9375rem", fontWeight: 600 }}>Leave feedback (optional)</label>
              <p className="g-subtitle g-mb-2" style={{ fontSize: "0.875rem" }}>Share any feedback about your stay.</p>
              <form onSubmit={submitFeedback}>
                <textarea
                  className="g-textarea g-mb-2"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="e.g. The shower was great, would love late checkout next time…"
                  rows={3}
                />
                <button
                  type="submit"
                  className="g-btn g-btn-primary"
                  disabled={!feedbackText.trim() || feedbackSending}
                >
                  {feedbackSending ? "Sending…" : "Submit feedback"}
                </button>
              </form>
            </div>
          ) : (
            <div className="g-card g-mb-3" style={{ padding: 24 }}>
              <p className="g-success-msg" style={{ margin: 0 }}>Thank you, your feedback has been recorded.</p>
            </div>
          )}
          <button type="button" className="g-btn g-btn-secondary" onClick={() => setGuestToken(null)}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="g-screen g-screen-centered">
      <button
        type="button"
        className="g-btn g-btn-ghost"
        style={{ position: "absolute", top: 16, right: 16 }}
        onClick={() => setGuestToken(null)}
      >
        Log out
      </button>
      <h1 className="g-page-title g-mb-1">Your room</h1>
      {guestName && <p className="g-subtitle g-mb-2" style={{ color: "var(--g-text)", fontSize: "1.125rem" }}>Welcome, {guestName}</p>}
      <p className="g-subtitle g-mb-3">Talk to Nova for help with anything you need.</p>
      <Link to="/concierge" className="g-btn g-btn-primary" style={{ textDecoration: "none" }}>
        Open Nova
      </Link>
    </div>
  );
}
