import { useState, useEffect, useCallback } from "react";

type RequestRow = {
  id: string;
  type: string;
  description: string;
  roomId: string;
  status?: string;
  createdAt: string;
  closedAt?: string | null;
  guest?: { firstName: string; lastName: string };
  managerReply?: string | null;
  managerRepliedAt?: string | null;
};

type RoomRow = {
  id: string;
  roomId: string;
  guests: { checkedIn: boolean; checkedOut?: boolean }[];
};

function roomSort(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

export default function Activity() {
  const [openTypeFilter, setOpenTypeFilter] = useState<"all" | "request" | "complaint">("all");
  const [openReplyFilter, setOpenReplyFilter] = useState<"all" | "replied" | "not_replied">("all");
  const [openSearchQuery, setOpenSearchQuery] = useState("");

  const [closedTypeFilter, setClosedTypeFilter] = useState<"all" | "request" | "complaint">("all");
  const [closedReplyFilter, setClosedReplyFilter] = useState<"all" | "replied" | "not_replied">("all");
  const [closedSearchQuery, setClosedSearchQuery] = useState("");

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [digestSummary, setDigestSummary] = useState<string | null>(null);
  const [digestCount, setDigestCount] = useState<number>(0);
  const [digestPeriod, setDigestPeriod] = useState<"today" | "week">("today");
  const [digestLoading, setDigestLoading] = useState(false);
  const [alerts, setAlerts] = useState<{ roomId: string; message: string; type: string }[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [aiSectionOpen, setAiSectionOpen] = useState(true);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [activityLogVisible, setActivityLogVisible] = useState(false);
  const [activityLogExpanded, setActivityLogExpanded] = useState(false);
  const [replyModalRequest, setReplyModalRequest] = useState<RequestRow | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const loadRequests = useCallback(async (params?: { type?: string; roomId?: string }) => {
    try {
      const type = params?.type;
      const roomId = params?.roomId;
      const search = new URLSearchParams();
      if (type) search.set("type", type);
      if (roomId) search.set("roomId", roomId);
      const url = `/api/requests${search.toString() ? `?${search.toString()}` : ""}`;
      const r = await fetch(url);
      const data = await r.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [reqs, roomsRes] = await Promise.all([
        loadRequests(),
        fetch("/api/rooms").then((r) => r.json().catch(() => [])).then((d: RoomRow[]) => (Array.isArray(d) ? d : [])),
      ]);
      setRequests(Array.isArray(reqs) ? reqs : []);
      setRooms(Array.isArray(roomsRes) ? roomsRes : []);
    } catch {
      setRequests([]);
      setRooms([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadRequests]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => loadAll(true), 30_000);
    const onFocus = () => loadAll(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAll]);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setAiConfigured(d.configured ?? false))
      .catch(() => setAiConfigured(false));
  }, []);

  useEffect(() => {
    if (!aiConfigured) return;
    setAlertsLoading(true);
    fetch("/api/ai/alerts")
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((d: { alerts?: { roomId: string; message: string; type: string }[] }) => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false));
  }, [aiConfigured]);

  function filterRequests(reqs: RequestRow[], type: string, reply: string, search: string) {
    return reqs.filter((r) => {
      // Type filter
      if (type !== "all" && r.type !== type) return false;
      // Reply filter
      if (reply !== "all") {
        const hasReply = Boolean(r.managerReply?.trim());
        if (reply === "replied" && !hasReply) return false;
        if (reply === "not_replied" && hasReply) return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (r.description || "").toLowerCase();
        const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName}`.toLowerCase() : "";
        const room = (r.roomId || "").toLowerCase();
        if (!desc.includes(q) && !guestName.includes(q) && !room.includes(q)) return false;
      }
      return true;
    });
  }

  function runAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = askQuestion.trim();
    if (!q) return;
    setAskLoading(true);
    setAskAnswer(null);
    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    })
      .then((r) => r.json())
      .then((d: { answer?: string }) => setAskAnswer(d.answer ?? ""))
      .catch(() => setAskAnswer("Failed to get answer."))
      .finally(() => setAskLoading(false));
  }

  function loadDigest(period: "today" | "week") {
    setDigestPeriod(period);
    setDigestLoading(true);
    setDigestSummary(null);
    fetch(`/api/ai/digest?period=${period}`)
      .then((r) => r.json())
      .then((d: { summary?: string; count?: number }) => {
        setDigestSummary(d.summary ?? "");
        setDigestCount(d.count ?? 0);
      })
      .catch(() => setDigestSummary("Failed to load digest."))
      .finally(() => setDigestLoading(false));
  }

  const hasSearch = Boolean(openSearchQuery.trim() || closedSearchQuery.trim());

  const checkedInRooms = rooms.filter(
    (room) => room.guests && room.guests.some((g) => g.checkedIn && !g.checkedOut)
  );
  const checkedInRoomIds = new Set(checkedInRooms.map((room) => room.roomId));
  const openCountByRoom: Record<string, number> = {};
  for (const r of requests) {
    if (r.status !== "closed") openCountByRoom[r.roomId] = (openCountByRoom[r.roomId] ?? 0) + 1;
  }

  const openListFull = requests.filter((r) => r.status !== "closed");
  const closedListFull = requests.filter((r) => r.status === "closed" && checkedInRoomIds.has(r.roomId));

  const openList = filterRequests(openListFull, openTypeFilter, openReplyFilter, openSearchQuery);
  const closedList = filterRequests(closedListFull, closedTypeFilter, closedReplyFilter, closedSearchQuery);

  function formatShortDate(createdAt: string) {
    const d = new Date(createdAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function openReplyModal(r: RequestRow) {
    setReplyModalRequest(r);
    setReplyMessage(r.managerReply ?? "");
    setReplyError(null);
  }

  async function submitReply(e?: React.FormEvent) {
    e?.preventDefault();
    if (!replyModalRequest || !replyMessage.trim() || replySending) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/requests/${replyModalRequest.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyMessage.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReplyModalRequest(null);
        setReplyMessage("");
        loadAll(true);
      } else {
        setReplyError(typeof data?.error === "string" ? data.error : "Failed to send reply");
      }
    } catch {
      setReplyError("Network error");
    } finally {
      setReplySending(false);
    }
  }

  function renderRequestRow(r: RequestRow) {
    const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : "—";
    const isComplaint = r.type === "complaint";
    const isOpen = r.status !== "closed";
    const hasReply = Boolean(r.managerReply?.trim());
    return (
      <tr key={r.id}>
        <td className="cell-room">Room {r.roomId}</td>
        <td>
          <span className={isComplaint ? "badge badge-complaint" : "badge badge-request"}>{r.type}</span>
        </td>
        <td className="cell-muted">{guestName}</td>
        <td className="cell-muted">{formatShortDate(r.createdAt)}</td>
        <td className="cell-desc" title={r.description}><span>{r.description}</span></td>
        <td style={{ verticalAlign: "middle" }}>
          <div className="activity-row-actions">
            <button
              type="button"
              className={`btn btn-sm ${hasReply ? "btn-ghost" : "btn-reply-pending"}`}
              onClick={() => openReplyModal(r)}
              title={hasReply ? "View or edit reply" : "Reply to guest via Nova"}
            >
              {hasReply ? "Replied" : "Reply"}
            </button>
            {isOpen && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  try {
                    await fetch(`/api/requests/${r.id}/close`, { method: "PATCH" });
                    loadAll(true);
                  } catch {
                    // ignore
                  }
                }}
              >
                Close
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  async function reopenRequest(id: string) {
    try {
      await fetch(`/api/requests/${id}/reopen`, { method: "PATCH" });
      loadAll(true);
    } catch {
      // ignore
    }
  }

  function renderActivityLogRow(r: RequestRow, options?: { showReopen?: boolean }) {
    const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : "—";
    const isComplaint = r.type === "complaint";
    const isClosed = r.status === "closed";
    const hasReply = Boolean(r.managerReply?.trim());
    return (
      <tr key={r.id}>
        <td className="cell-room">Room {r.roomId}</td>
        <td>
          <span className={isComplaint ? "badge badge-complaint" : "badge badge-request"}>{r.type}</span>
        </td>
        <td className="cell-muted">{guestName}</td>
        <td className="cell-muted">{formatShortDate(r.createdAt)}</td>
        <td className="cell-desc" title={r.description}><span>{r.description}</span></td>
        <td style={{ verticalAlign: "middle" }}>
          <div className="activity-row-actions">
            {(!isClosed || hasReply) && (
              <button
                type="button"
                className={`btn btn-sm ${hasReply ? "btn-ghost" : "btn-reply-pending"}`}
                onClick={() => openReplyModal(r)}
                title={hasReply ? (isClosed ? "View reply" : "View or edit reply") : "Reply to guest via Nova"}
              >
                {hasReply ? "Replied" : "Reply"}
              </button>
            )}
            {options?.showReopen && isClosed && (
              <button type="button" className="btn btn-sm" onClick={() => reopenRequest(r.id)}>
                Re-open
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="page">
      <div className="page-header mb-3">
        <h1 className="mt-0">Activity</h1>
        <p className="text-muted">Requests and complaints by room.</p>
      </div>

      {replyModalRequest && (
        <div className="modal-overlay" onClick={() => !replySending && (setReplyModalRequest(null), setReplyError(null))}>
          <div className="modal" style={{ minWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {replyModalRequest.status === "closed" ? "View reply" : "Reply to guest via Nova"}
            </h2>
            <p className="text-muted mb-2" style={{ fontSize: "0.9rem" }}>
              Room {replyModalRequest.roomId} · {replyModalRequest.guest ? `${replyModalRequest.guest.firstName} ${replyModalRequest.guest.lastName}` : "—"} · {replyModalRequest.type}
            </p>
            {replyModalRequest.status !== "closed" && (
              <p className="text-muted mb-2" style={{ fontSize: "0.85rem" }}>
                Your message will be delivered the next time the guest opens Nova.
              </p>
            )}
            <form onSubmit={submitReply}>
              <textarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder={replyModalRequest.status === "closed" ? "No reply yet" : "e.g. We've sent extra towels to your room."}
                rows={3}
                className="input"
                readOnly={replyModalRequest.status === "closed"}
                style={{ width: "100%", resize: "vertical", marginBottom: "0.5rem" }}
              />
              {replyError && <p className="text-error mb-2" style={{ fontSize: "0.875rem", marginTop: 0 }}>{replyError}</p>}
              <div className="flex gap-2">
                {replyModalRequest.status !== "closed" ? (
                  <>
                    <button type="submit" className="btn btn-primary" disabled={!replyMessage.trim() || replySending}>
                      {replySending ? "Sending…" : "Send reply"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setReplyModalRequest(null); setReplyError(null); }} disabled={replySending}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => { setReplyModalRequest(null); setReplyError(null); }}>Close</button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {aiConfigured === true && (
        <div className="activity-ai-card">
          <button type="button" className="ai-toggle" onClick={() => setAiSectionOpen(!aiSectionOpen)}>
            <span>AI assistant</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{aiSectionOpen ? "▼" : "▶"}</span>
          </button>
          {aiSectionOpen && (
            <div className="ai-body">
              {alerts.length > 0 && (
                <div className="mb-2">
                  <div className="section-title">Follow-up alerts</div>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {alerts.map((a) => (
                      <li key={a.roomId} className="mb-1"><strong>Room {a.roomId}:</strong> {a.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {alertsLoading && alerts.length === 0 && <p className="text-muted mb-2" style={{ fontSize: "0.9rem" }}>Loading alerts…</p>}
              <form onSubmit={runAsk} className="mb-2">
                <label className="section-title">Ask about activity</label>
                <div className="flex gap-2 wrap mb-1">
                  <input
                    type="text"
                    className="input"
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    placeholder="e.g. Which rooms had complaints today?"
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={askLoading}>{askLoading ? "Asking…" : "Ask"}</button>
                </div>
              </form>
              {askAnswer !== null && <div className="card-body mb-2" style={{ background: "var(--surface-hover)", borderRadius: "var(--radius-sm)" }}>{askAnswer}</div>}
              <div className="flex gap-2 wrap">
                <button type="button" className="btn btn-sm" onClick={() => loadDigest("today")} disabled={digestLoading}>Daily digest</button>
                <button type="button" className="btn btn-sm" onClick={() => loadDigest("week")} disabled={digestLoading}>Weekly digest</button>
              </div>
              {digestSummary !== null && (
                <div className="card-body mt-2 text-muted" style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                  {digestPeriod === "today" ? "Today" : "This week"} ({digestCount} items)
                  <div style={{ marginTop: "0.5rem", color: "var(--text)" }}>{digestSummary}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section className="mb-3">
        <h2 className="section-title">Checked in rooms</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "0.75rem" }}>
          {checkedInRooms.length === 0 ? (
            <div className="activity-empty" style={{ padding: "1.25rem" }}>No rooms checked in.</div>
          ) : (
            checkedInRooms
              .sort((a, b) => roomSort(a.roomId, b.roomId))
              .map((room) => {
                const openCount = openCountByRoom[room.roomId] ?? 0;
                const hasOpen = openCount > 0;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      setOpenSearchQuery(room.roomId);
                    }}
                    className={`room-pill ${hasOpen ? "has-open" : ""}`}
                  >
                    <div className="room-num">{room.roomId}</div>
                    {hasOpen && <div className="room-open">{openCount} open request{openCount !== 1 ? "s" : ""}</div>}
                  </button>
                );
              })
          )}
        </div>
      </section>


      {loading ? (
        <div className="activity-empty">Loading…</div>
      ) : (() => {
        const renderControls = (
          type: "all" | "request" | "complaint",
          setType: (v: "all" | "request" | "complaint") => void,
          reply: "all" | "replied" | "not_replied" | any,
          setReply: (v: "all" | "replied" | "not_replied") => void,
          search: string,
          setSearch: (v: string) => void
        ) => (
          <div className="activity-header-controls">
            <div className="activity-search-bar">
              <input
                type="text"
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search requests…"
              />
              {search && (
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSearch("")}>Clear</button>
              )}
            </div>

            <div className="activity-filter-toggles">
              <div className="toggle-group">
                <button className={`toggle-btn ${type === "all" ? "active" : ""}`} onClick={() => setType("all")}>All</button>
                <button className={`toggle-btn ${type === "request" ? "active" : ""}`} onClick={() => setType("request")}>Requests</button>
                <button className={`toggle-btn ${type === "complaint" ? "active" : ""}`} onClick={() => setType("complaint")}>Complaints</button>
              </div>

              <div className="toggle-group">
                <button className={`toggle-btn ${reply === "all" ? "active" : ""}`} onClick={() => setReply("all")}>All</button>
                <button className={`toggle-btn ${reply === "replied" ? "active" : ""}`} onClick={() => setReply("replied")}>Replied</button>
                <button className={`toggle-btn ${reply === "not_replied" ? "active" : ""}`} onClick={() => setReply("not_replied")}>Not replied</button>
              </div>
            </div>
          </div>
        );

        return (
          <div className="activity-lists-container">
            <section className="card mb-3">
              <div className="activity-card-header has-close">
                <span>Requests & complaints</span>
                {renderControls(openTypeFilter, setOpenTypeFilter, openReplyFilter, setOpenReplyFilter, openSearchQuery, setOpenSearchQuery)}
              </div>
              <div className="activity-table-wrap">
                {openList.length === 0 ? (
                  <div className="activity-empty" style={{ border: "none" }}>{openSearchQuery ? "No results match." : "No open requests."}</div>
                ) : (
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Room</th><th>Type</th><th>Guest</th><th>Time</th><th>Description</th><th style={{ width: "1%" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {openList.map((r) => renderRequestRow(r))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="card">
              <div className="activity-card-header has-close">
                <span>Closed requests</span>
                {renderControls(closedTypeFilter, setClosedTypeFilter, closedReplyFilter, setClosedReplyFilter, closedSearchQuery, setClosedSearchQuery)}
              </div>
              <div className="activity-table-wrap">
                {closedList.length === 0 ? (
                  <div className="activity-empty" style={{ border: "none" }}>{closedSearchQuery ? "No results match." : "No closed requests."}</div>
                ) : (
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Room</th><th>Type</th><th>Guest</th><th>Time</th><th>Description</th><th style={{ width: "1%" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {[...closedList].sort((a, b) => new Date((b.closedAt || b.createdAt) as string).getTime() - new Date((a.closedAt || a.createdAt) as string).getTime()).map((r) => renderActivityLogRow(r, { showReopen: true }))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        );
      })()}

      {!loading || hasSearch ? (
        <div style={{ marginTop: "1.5rem" }}>
          {!activityLogVisible ? (
            <button type="button" className="btn-display-log" onClick={() => setActivityLogVisible(true)}>
              Display activity log
            </button>
          ) : (
            (() => {
              const activityListRaw = requests; // Just use all requests for log
              const activityListSorted = [...activityListRaw].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              const ACTIVITY_LOG_PREVIEW = 10;
              const activityDisplayList = activityLogExpanded ? activityListSorted : activityListSorted.slice(0, ACTIVITY_LOG_PREVIEW);
              const hasMore = activityListSorted.length > ACTIVITY_LOG_PREVIEW;
              const activityTitle = activityListSorted.length === 0
                ? "Activity log"
                : activityLogExpanded
                  ? `Activity log (${activityListSorted.length})`
                  : hasMore
                    ? `Activity log (${ACTIVITY_LOG_PREVIEW} of ${activityListSorted.length})`
                    : `Activity log (${activityListSorted.length})`;
              return (
                <section className="card">
                  <div className="activity-card-header has-close">
                    <span>{activityTitle}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setActivityLogVisible(false); setActivityLogExpanded(false); }}>Close</button>
                  </div>
                  {activityListSorted.length === 0 ? (
                    <div className="activity-empty">No activity yet.</div>
                  ) : (
                    <>
                      <div className="activity-table-wrap">
                        <table className="activity-table">
                          <thead>
                            <tr>
                              <th>Room</th><th>Type</th><th>Guest</th><th>Time</th><th>Description</th><th style={{ width: "1%" }} />
                            </tr>
                          </thead>
                          <tbody>
                            {activityDisplayList.map((r) => renderActivityLogRow(r))}
                          </tbody>
                        </table>
                      </div>
                      {hasMore && (
                        <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid var(--border)" }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setActivityLogExpanded(!activityLogExpanded)}
                          >
                            {activityLogExpanded ? "Show less" : "Expand"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })()
          )}
        </div>
      ) : null}
    </div>
  );
}
