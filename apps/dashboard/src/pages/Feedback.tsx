import { useState, useEffect, useCallback } from "react";

type FeedbackItem = {
  id: string;
  roomId: string;
  content: string;
  source?: string | null;
  createdAt: string;
  guest?: { id: string; firstName: string; lastName: string };
};

export default function Feedback() {
  const [list, setList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/feedback");
      const data = await r.json().catch(() => []);
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <h1 className="section-title" style={{ marginBottom: "0.5rem" }}>Feedback and suggestions</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        All feedback collected from guests after checkout.
      </p>

      {loading ? (
        <p className="text-muted">Loading feedback…</p>
      ) : list.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <p className="text-muted mb-0">No feedback collected yet.</p>
          </div>
        </div>
      ) : (
        <ul className="feedback-list">
          {list.map((f) => (
            <li key={f.id} className="feedback-item">
              <p className="feedback-content">{f.content}</p>
              <div className="feedback-meta">
                <span className="feedback-room">Room {f.roomId}</span>
                <span className="feedback-guest">
                  {f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : "—"}
                </span>
                <span className="feedback-time">
                  {new Date(f.createdAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  {f.source ? ` · ${f.source}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
