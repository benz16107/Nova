import { useState, useEffect } from "react";

type RequestRow = {
  id: string;
  type: string;
  description: string;
  roomId: string;
  createdAt: string;
  guest?: { firstName: string; lastName: string };
};

export default function Requests() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filter, setFilter] = useState<"all" | "request" | "complaint">("all");
  const [loading, setLoading] = useState(true);

  async function loadRequests(silent = false) {
    if (!silent) setLoading(true);
    const url = filter === "complaint" ? "/api/complaints" : `/api/requests${filter === "request" ? "?type=request" : ""}`;
    try {
      const r = await fetch(url);
      const data = await r.json();
      setRequests(Array.isArray(data) ? data : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [filter]);

  useEffect(() => {
    const interval = setInterval(() => loadRequests(true), 30_000);
    const onFocus = () => loadRequests(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [filter]);

  if (loading) return <p>Loading…</p>;
  return (
    <div>
      <h1>Requests & Complaints</h1>
      <p style={{ color: "#666" }}>When the agent receives a request, it is pushed here.</p>
      <div style={{ marginBottom: 16 }}>
        <label>Filter: </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All</option>
          <option value="request">Requests</option>
          <option value="complaint">Complaints</option>
        </select>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd" }}>
            <th style={{ textAlign: "left", padding: 8 }}>Room</th>
            <th style={{ textAlign: "left", padding: 8 }}>Type</th>
            <th style={{ textAlign: "left", padding: 8 }}>Description</th>
            <th style={{ textAlign: "left", padding: 8 }}>Guest</th>
            <th style={{ textAlign: "left", padding: 8 }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{r.roomId}</td>
              <td style={{ padding: 8 }}>{r.type}</td>
              <td style={{ padding: 8 }}>{r.description}</td>
              <td style={{ padding: 8 }}>{r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : "—"}</td>
              <td style={{ padding: 8 }}>{new Date(r.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <p style={{ color: "#666" }}>No items yet.</p>}
    </div>
  );
}
