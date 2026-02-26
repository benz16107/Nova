import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    // Check localStorage first, otherwise fallback to system preference
    const saved = localStorage.getItem("nova-theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("nova-theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("nova-theme", "light");
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="btn btn-ghost btn-sm"
      style={{
        padding: "0.4rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

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
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: "1.5rem 1.5rem 2rem" }}>
        <Outlet />
      </main>
    </div>
  );
}
