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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease-in-out",
        color: "var(--text-muted)"
      }}
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}

function FeedbackCollapsibleCard({ f }: { f: FeedbackItem }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(f.createdAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const guestName = f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : "—";

  return (
    <div
      className="card feedback-collapsible-card"
      style={{ marginBottom: "0.75rem", cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s" }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "var(--shadow)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ background: "var(--surface-hover)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius-sm)", fontWeight: 600, border: "1px solid var(--border)" }}>
            Room {f.roomId}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{guestName}</span>
            <span className="text-muted" style={{ fontSize: "var(--text-xs)" }}>{dateStr}</span>
          </div>
        </div>
        <div>
          <ChevronIcon expanded={expanded} />
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 1.25rem 1.25rem 1.25rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem", backgroundColor: "var(--surface-hover)", borderBottomLeftRadius: "var(--radius)", borderBottomRightRadius: "var(--radius)" }}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text)", lineHeight: "var(--leading-normal)", fontSize: "var(--text-base)" }}>
            {f.content}
          </p>
          {f.source && (
            <div style={{ marginTop: "1rem" }}>
              <span className="badge badge-muted">Source: {f.source}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Feedback() {
  const [list, setList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllFeedbacks, setShowAllFeedbacks] = useState(false);

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

  const displayedList = showAllFeedbacks ? list : list.slice(0, 5);

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
              Generating AI Summary...
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
              AI Feedback Insights
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
                  Top Praise
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
                  Areas for Improvement
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
                  Key Insight
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
        <div className="feedback-cards-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 className="section-title" style={{ margin: 0, color: "var(--text)" }}>Recent Feedback Records</h3>
            <span className="badge badge-muted">{list.length} total</span>
          </div>
          {displayedList.map((f) => (
            <FeedbackCollapsibleCard key={f.id} f={f} />
          ))}
          {list.length > 5 && (
            <button
              className="btn btn-ghost"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => setShowAllFeedbacks(!showAllFeedbacks)}
            >
              {showAllFeedbacks ? "Show less" : `View all ${list.length} feedback records`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
