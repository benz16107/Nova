import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const nav = [
    { path: "/guests", label: "Guests & Rooms" },
    { path: "/requests", label: "Requests & Complaints" },
  ];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#333", color: "#fff", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <nav style={{ display: "flex", gap: 16 }}>
          {nav.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              style={{ color: location.pathname === path ? "#fff" : "#ccc", textDecoration: "none" }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} style={{ background: "transparent", color: "#fff", border: "1px solid #666", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>Log out</button>
      </header>
      <main style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
