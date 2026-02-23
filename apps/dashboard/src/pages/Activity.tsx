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
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<RequestRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
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

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchActive(false);
      setSearchResults(null);
      return;
    }
    setSearchActive(true);
    setSearchLoading(true);
    const lower = q.toLowerCase();
    loadRequests()
      .then((reqs) => {
        const filtered = reqs.filter((r) => {
          const desc = (r.description || "").toLowerCase();
          const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName}`.toLowerCase() : "";
          const room = (r.roomId || "").toLowerCase();
          return desc.includes(lower) || guestName.includes(lower) || room.includes(lower);
        });
        setSearchResults(filtered);
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchActive(false);
    setSearchResults(null);
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

  const hasSearch = searchActive && searchResults !== null;
  const searchTotal = hasSearch ? searchResults!.length : 0;

  const checkedInRooms = rooms.filter(
    (room) => room.guests && room.guests.some((g) => g.checkedIn && !g.checkedOut)
  );
  const openCountByRoom: Record<string, number> = {};
  for (const r of requests) {
    if (r.status !== "closed" && r.type !== "complaint") openCountByRoom[r.roomId] = (openCountByRoom[r.roomId] ?? 0) + 1;
  }

  const roomIdsFromRequests = [...new Set(requests.map((r) => r.roomId))];
  const allRoomIdsBase = [...roomIdsFromRequests].sort(roomSort);
  const searchRoomIds = hasSearch && searchResults
    ? [...new Set(searchResults.map((r) => r.roomId))].sort(roomSort)
    : [];
  const allRoomIds = hasSearch && searchRoomIds.length > 0 ? searchRoomIds : allRoomIdsBase;

  const reqsFiltered = roomFilter ? requests.filter((r) => r.roomId === roomFilter) : requests;
  const searchReqs = hasSearch ? (roomFilter ? searchResults!.filter((r) => r.roomId === roomFilter) : searchResults!) : [];

  function formatShortDate(createdAt: string) {
    const d = new Date(createdAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderRequestRow(r: RequestRow) {
    const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : "—";
    const isComplaint = r.type === "complaint";
    const isOpen = r.status !== "closed";
    return (
      <tr key={r.id}>
        <td className="cell-room">Room {r.roomId}</td>
        <td>
          <span className={isComplaint ? "badge badge-complaint" : "badge badge-request"}>{r.type}</span>
          {isOpen ? <span className="badge badge-muted" style={{ marginLeft: "0.35rem" }}>Open</span> : <span className="text-muted" style={{ marginLeft: "0.35rem", fontSize: "0.8125rem" }}>Closed</span>}
        </td>
        <td className="cell-muted">{guestName}</td>
        <td className="cell-muted">{formatShortDate(r.createdAt)}</td>
        <td className="cell-desc" title={r.description}><span>{r.description}</span></td>
        <td style={{ width: "1%", whiteSpace: "nowrap" }}>
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
        </td>
      </tr>
    );
  }

  function renderActivityLogRow(r: RequestRow) {
    const guestName = r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : "—";
    const isComplaint = r.type === "complaint";
    const isOpen = r.status !== "closed";
    return (
      <tr key={r.id}>
        <td className="cell-room">Room {r.roomId}</td>
        <td>
          <span className={isComplaint ? "badge badge-complaint" : "badge badge-request"}>{r.type}</span>
          {isOpen ? <span className="badge badge-muted" style={{ marginLeft: "0.35rem" }}>Open</span> : <span className="text-muted" style={{ marginLeft: "0.35rem", fontSize: "0.8125rem" }}>Closed</span>}
        </td>
        <td className="cell-muted">{guestName}</td>
        <td className="cell-muted">{formatShortDate(r.createdAt)}</td>
        <td className="cell-desc" title={r.description}><span>{r.description}</span></td>
      </tr>
    );
  }

  return (
    <div className="page">
      <div className="page-header mb-3">
        <h1 className="mt-0">Activity</h1>
        <p className="text-muted">Requests and complaints by room.</p>
      </div>

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
        <h2 className="section-title">Reserved rooms</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "0.75rem" }}>
          {checkedInRooms.length === 0 ? (
            <div className="activity-empty" style={{ padding: "1.25rem" }}>No rooms checked in.</div>
          ) : (
            checkedInRooms
              .sort((a, b) => roomSort(a.roomId, b.roomId))
              .map((room) => {
                const openCount = openCountByRoom[room.roomId] ?? 0;
                const hasOpen = openCount > 0;
                const isSelected = roomFilter === room.roomId;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setRoomFilter(isSelected ? "" : room.roomId)}
                    className={`room-pill ${hasOpen ? "has-open" : ""}`}
                    style={isSelected ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
                  >
                    <div className="room-num">Room {room.roomId}</div>
                    {hasOpen && <div className="room-open">{openCount} open request{openCount !== 1 ? "s" : ""}</div>}
                  </button>
                );
              })
          )}
        </div>
      </section>

      <h2 className="section-title mt-3">Activity by room</h2>
      <form onSubmit={runSearch}>
        <div className="activity-search-bar">
          <input
            type="text"
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search requests…"
            style={{ minWidth: 260, maxWidth: 360 }}
          />
          <button type="submit" className="btn btn-primary" disabled={searchLoading}>
            {searchLoading ? "Searching…" : "Search"}
          </button>
          {searchActive && (
            <button type="button" className="btn btn-ghost" onClick={clearSearch}>Clear</button>
          )}
        </div>
      </form>

      <div className="activity-filter-row">
        <span className="section-title" style={{ marginBottom: 0 }}>Room</span>
        <select
          className="select"
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          style={{ width: "auto", minWidth: 120 }}
        >
          <option value="">All rooms</option>
          {allRoomIds.map((rid) => (
            <option key={rid} value={rid}>Room {rid}</option>
          ))}
        </select>
        {roomFilter && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoomFilter("")}>Clear room</button>
        )}
      </div>

      {loading && !hasSearch ? (
        <div className="activity-empty">Loading…</div>
      ) : (() => {
        const list = hasSearch ? searchReqs : reqsFiltered;
        const openList = list.filter((r) => r.status !== "closed");
        const closedList = list.filter((r) => r.status === "closed");
        const title = hasSearch ? `Search results${searchTotal > 0 ? ` (${list.length})` : ""}` : "Requests & complaints";
        if (openList.length === 0) {
          return (
            <>
              <div className="activity-empty">
                {hasSearch ? `No requests match${roomFilter ? " for this room" : ""}.` : "No open requests."}
              </div>
              {closedList.length > 0 && (
                <section className="card" style={{ marginTop: "1.25rem" }}>
                  <div className="activity-card-header">Closed requests ({closedList.length})</div>
                  <div className="activity-table-wrap">
                    <table className="activity-table">
                      <thead>
                        <tr>
                          <th>Room</th><th>Type</th><th>Guest</th><th>Time</th><th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...closedList].sort((a, b) => new Date((b.closedAt || b.createdAt) as string).getTime() - new Date((a.closedAt || a.createdAt) as string).getTime()).map((r) => renderActivityLogRow(r))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          );
        }
        return (
          <>
            <section className="card">
              <div className="activity-card-header">{title}</div>
              <div className="activity-table-wrap">
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
              </div>
            </section>
            {closedList.length > 0 && (
              <section className="card" style={{ marginTop: "1.25rem" }}>
                <div className="activity-card-header">Closed requests ({closedList.length})</div>
                <div className="activity-table-wrap">
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Room</th><th>Type</th><th>Guest</th><th>Time</th><th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...closedList].sort((a, b) => new Date((b.closedAt || b.createdAt) as string).getTime() - new Date((a.closedAt || a.createdAt) as string).getTime()).map((r) => renderActivityLogRow(r))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
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
              const activityListRaw = hasSearch ? searchReqs : reqsFiltered;
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
                              <th>Room</th><th>Type</th><th>Guest</th><th>Time</th><th>Description</th>
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
