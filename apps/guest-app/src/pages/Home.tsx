import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useGuestToken, useGuestAuth } from "../guestToken";

type ConciergeBlockedReason = "checked_out" | "not_checked_in" | "door_not_unlocked";

export default function Home() {
  const token = useGuestToken();
  const { setGuestToken } = useGuestAuth();
  const [conciergeAllowed, setConciergeAllowed] = useState<boolean | null>(null);
  const [conciergeBlockedReason, setConciergeBlockedReason] = useState<ConciergeBlockedReason | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/me?guest_token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: {
        conciergeAllowed?: boolean;
        conciergeBlockedReason?: ConciergeBlockedReason | null;
        guest?: { firstName?: string; roomId?: string };
      }) => {
        setConciergeAllowed(data.conciergeAllowed ?? false);
        setConciergeBlockedReason(data.conciergeBlockedReason ?? null);
        if (data?.guest?.firstName) setGuestName(data.guest.firstName);
        if (data?.guest?.roomId) setRoomId(data.guest.roomId);
      })
      .catch(() => {
        setConciergeAllowed(false);
        setConciergeBlockedReason(null);
      });
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

  const blockedTitle = conciergeBlockedReason === "checked_out"
    ? "You have checked out"
    : conciergeBlockedReason === "not_checked_in"
      ? "Check-in required"
      : conciergeBlockedReason === "door_not_unlocked"
        ? "Key card scan required"
        : "Nova is unavailable";

  const blockedSubtitle = conciergeBlockedReason === "checked_out"
    ? "Thank you for staying with us. We hope you had a great stay."
    : conciergeBlockedReason === "not_checked_in"
      ? "Please check in at the front desk before using Nova."
      : conciergeBlockedReason === "door_not_unlocked"
        ? "Please tap your room key card at the door reader to activate Nova for your room."
        : "Please try again in a moment.";

  if (conciergeAllowed === false) {
    return (
      <div className="g-screen g-screen-centered">
        <div className="g-max-w-wide">
          <h1 className="g-page-title g-mb-1">{blockedTitle}</h1>
          <p className="g-subtitle g-mb-3">{blockedSubtitle}</p>

          {conciergeBlockedReason === "checked_out" && !feedbackSent ? (
            <div className="g-card g-mb-3" style={{ padding: 24, textAlign: "left" }}>
              <label className="g-mb-1" style={{ display: "block", fontSize: "0.9375rem", fontWeight: 600 }}>
                Leave feedback (optional)
              </label>
              <p className="g-subtitle g-mb-2" style={{ fontSize: "0.875rem" }}>
                Share any feedback about your stay.
              </p>
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
          ) : conciergeBlockedReason === "checked_out" && feedbackSent ? (
            <div className="g-card g-mb-3" style={{ padding: 24 }}>
              <p className="g-success-msg" style={{ margin: 0 }}>
                Thank you. Your feedback has been submitted.
              </p>
            </div>
          ) : (
            <div className="g-card g-mb-3" style={{ padding: 24 }}>
              <p className="g-subtitle" style={{ margin: 0 }}>
                Once this is completed, reopen the app or tap refresh.
              </p>
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
      <h1 className="g-page-title g-mb-1">{roomId ? `Room ${roomId}` : "Your room"}</h1>
      {guestName && (
        <p className="g-subtitle g-mb-2" style={{ color: "var(--g-text)", fontSize: "1.125rem" }}>
          Welcome, {guestName}
        </p>
      )}
      <p className="g-subtitle g-mb-3">Talk to Nova for help with anything you need.</p>
      <Link to="/concierge" className="g-btn g-btn-primary" style={{ textDecoration: "none" }}>
        Open Nova
      </Link>
    </div>
  );
}
