import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const AUTH_KEY = "hotel_dashboard_token";

type AuthContextType = {
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_KEY)
  );
  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token?: string };
    if (data.token) {
      localStorage.setItem(AUTH_KEY, data.token);
      setToken(data.token);
      return true;
    }
    return false;
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setToken(null);
  }, []);
  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
