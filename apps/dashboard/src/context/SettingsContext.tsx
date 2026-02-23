import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { DEFAULT_ROOMS_PER_FLOOR } from "../config/hotel";

export type SettingsState = {
  hotelLayout: number[] | null;
  hotelName: string | null;
  hasCustomPassword: boolean;
  loading: boolean;
  error: string | null;
};

const defaultState: SettingsState = {
  hotelLayout: null,
  hotelName: null,
  hasCustomPassword: false,
  loading: true,
  error: null,
};

const SettingsContext = createContext<SettingsState & { refetch: () => Promise<void> }>({
  ...defaultState,
  refetch: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettingsState>(defaultState);

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : `Failed to load settings (${res.status})`;
        setState((s) => ({ ...s, loading: false, error: msg }));
        return;
      }
      setState({
        hotelLayout: data.hotelLayout ?? null,
        hotelName: data.hotelName ?? null,
        hasCustomPassword: data.hasCustomPassword ?? false,
        loading: false,
        error: null,
      });
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message === "Failed to fetch"
          ? "Could not reach server. Is the backend running? (e.g. port 3000)"
          : e instanceof Error
            ? e.message
            : "Failed to load settings";
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <SettingsContext.Provider value={{ ...state, refetch }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

/** Rooms per floor from API or default. Safe to use in Guests/Activity. */
export function useRoomsPerFloor(): number[] {
  const { hotelLayout } = useSettings();
  return hotelLayout ?? DEFAULT_ROOMS_PER_FLOOR;
}
