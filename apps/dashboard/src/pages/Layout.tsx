import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const nav = [
    { path: "/guests", label: "Guests & Rooms" },
    { path: "/requests", label: "Requests & Complaints" },
    { path: "/feedback", label: "Feedback and suggestions" },
    { path: "/settings", label: "Settings" },
  ];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "0 1.5rem",
          height: 56,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <span style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>Manager Dashboard</span>
          <nav style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {nav.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              className="btn btn-ghost"
              style={{
                textDecoration: "none",
                color: location.pathname === path ? "var(--text)" : "var(--text-muted)",
                fontWeight: location.pathname === path ? 600 : 500,
                background: location.pathname === path ? "var(--surface-hover)" : "transparent",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {label}
            </Link>
          ))}
          </nav>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          Log out
        </button>
      </header>
      <main style={{ flex: 1, padding: "1.5rem 1.5rem 2rem" }}>
        <Outlet />
      </main>
    </div>
  );
}
