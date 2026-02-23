import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const ok = await login(password);
    if (ok) navigate("/guests", { replace: true });
    else setError("Invalid credentials");
  }

  return (
    <div style={{ maxWidth: 320, margin: "80px auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <h1 style={{ marginTop: 0 }}>Hotel Concierge</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Manager dashboard</p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 16 }}
        />
        {error && <p style={{ color: "#c00", marginBottom: 16 }}>{error}</p>}
        <button type="submit" style={{ width: "100%", padding: 10, background: "#333", color: "#fff", border: "none", borderRadius: 4 }}>Sign in</button>
      </form>
    </div>
  );
}
