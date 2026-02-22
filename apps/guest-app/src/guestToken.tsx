import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "guest_token";

type GuestAuthContextValue = {
  guestToken: string | null;
  setGuestToken: (token: string | null) => void;
};

const GuestAuthContext = createContext<GuestAuthContextValue | null>(null);

export function GuestAuthProvider({ children }: { children: ReactNode }) {
  const [guestToken, setState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
  );
  const setGuestToken = useCallback((token: string | null) => {
    setState(token);
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  return (
    <GuestAuthContext.Provider value={{ guestToken, setGuestToken }}>
      {children}
    </GuestAuthContext.Provider>
  );
}

export function useGuestToken(): string | null {
  const ctx = useContext(GuestAuthContext);
  if (!ctx) throw new Error("useGuestToken must be used within GuestAuthProvider");
  return ctx.guestToken;
}

export function useGuestAuth(): GuestAuthContextValue {
  const ctx = useContext(GuestAuthContext);
  if (!ctx) throw new Error("useGuestAuth must be used within GuestAuthProvider");
  return ctx;
}
