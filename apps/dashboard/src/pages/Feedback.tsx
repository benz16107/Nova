import { useState, useEffect, useCallback } from "react";

type FeedbackItem = {
  id: string;
  roomId: string;
  content: string;
  source?: string | null;
  createdAt: string;
  guest?: { id: string; firstName: string; lastName: string };
};

type AIDashboardData = {
  overall_vibe: string;
  top_praise: string[];
  improvements: string[];
  insights: string;
  error?: string;
};

export default function Feedback() {
  const [list, setList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [aiData, setAiData] = useState<AIDashboardData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadFeedback = useCallback(async () => {
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

  const loadAIDashboard = useCallback(async () => {
    setAiLoading(true);
    try {
      const r = await fetch("/api/ai/feedback-dashboard");
      const data = await r.json().catch(() => null);
      if (data && !data.error) {
        setAiData(data);
      } else if (data?.error) {
        setAiData({ error: data.error } as AIDashboardData);
      }
    } catch {
      // ignore
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeedback();
    loadAIDashboard();
    const interval = setInterval(loadFeedback, 30_000);
    return () => clearInterval(interval);
  }, [loadFeedback, loadAIDashboard]);

  return (
    <div>
      <h1 className="section-title" style={{ marginBottom: "0.5rem" }}>Feedback and suggestions</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        All feedback collected from guests after checkout.
      </p>

      {/* AI Dashboard Section */}
      {aiLoading ? (
        <div className="ai-dashboard">
          <div className="ai-dashboard-header">
            <h2 className="ai-dashboard-title">
              ✨ Generating AI Summary...
            </h2>
          </div>
          <div className="ai-dashboard-body">
            <p className="text-muted mb-0">Analyzing recent feedback and memory threads...</p>
          </div>
        </div>
      ) : aiData && !aiData.error ? (
        <div className="ai-dashboard">
          <div className="ai-dashboard-header">
            <h2 className="ai-dashboard-title">
              ✨ AI Feedback Insights
            </h2>
            <button className="btn btn-sm btn-ghost" onClick={loadAIDashboard}>
              Refresh
            </button>
          </div>
          <div className="ai-dashboard-body">
            <div className="ai-vibe-card">
              <strong>Overall Vibe:</strong> {aiData.overall_vibe}
            </div>

            <div className="ai-dashboard-grid">
              <div className="ai-list-card">
                <h3 className="ai-list-title praise">
                  <span style={{ fontSize: "1.2rem" }}>💚</span> Top Praise
                </h3>
                {aiData.top_praise?.length > 0 ? (
                  <ul className="ai-list">
                    {aiData.top_praise.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-sm mb-0">No praise identified.</p>
                )}
              </div>

              <div className="ai-list-card">
                <h3 className="ai-list-title improvements">
                  <span style={{ fontSize: "1.2rem" }}>🔧</span> Areas for Improvement
                </h3>
                {aiData.improvements?.length > 0 ? (
                  <ul className="ai-list">
                    {aiData.improvements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-sm mb-0">No distinct improvements identified.</p>
                )}
              </div>
            </div>

            {aiData.insights && (
              <div className="ai-insights-card">
                <div className="ai-insights-title">
                  <span style={{ fontSize: "1.2rem" }}>💡</span> Key Insight
                </div>
                {aiData.insights}
              </div>
            )}
          </div>
        </div>
      ) : aiData?.error ? (
        <div className="ai-dashboard" style={{ borderColor: "var(--error)", background: "var(--error-soft)" }}>
          <div className="ai-dashboard-body text-error">
            <strong>AI Summary Unavailable:</strong> {aiData.error}
          </div>
        </div>
      ) : null}

      {/* Feedback List Section */}
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
