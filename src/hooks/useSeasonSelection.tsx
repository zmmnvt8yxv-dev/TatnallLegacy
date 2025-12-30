import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dataLoader } from "../data/loader";

type SeasonSelectionState = {
  status: "loading" | "ready" | "error";
  years: number[];
  year?: number;
  error?: string;
  setYear: (year: number) => void;
};

const STORAGE_KEY = "tatnall-season-year";
const SeasonSelectionContext = createContext<SeasonSelectionState | undefined>(undefined);

function resolveDefaultYear(years: number[]): number | undefined {
  if (typeof window !== "undefined") {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && years.includes(stored)) {
      return stored;
    }
  }
  return years.length ? Math.max(...years) : undefined;
}

export function SeasonSelectionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<SeasonSelectionState, "setYear">>({
    status: "loading",
    years: [],
    year: undefined,
    error: undefined,
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const manifest = await dataLoader.loadManifest();
        const years = (manifest.years ?? []).slice().sort((a, b) => b - a);
        const year = resolveDefaultYear(years);
        if (!active) return;
        setState({ status: "ready", years, year, error: undefined });
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          years: [],
          year: undefined,
          error: error instanceof Error ? error.message : "Unable to load seasons",
        });
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const setYear = (year: number) => {
    setState((prev) => ({
      ...prev,
      year,
    }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(year));
    }
  };

  const value = useMemo<SeasonSelectionState>(
    () => ({
      ...state,
      setYear,
    }),
    [state]
  );

  return (
    <SeasonSelectionContext.Provider value={value}>
      {children}
    </SeasonSelectionContext.Provider>
  );
}

export function useSeasonSelection(): SeasonSelectionState {
  const context = useContext(SeasonSelectionContext);
  if (!context) {
    throw new Error("useSeasonSelection must be used within SeasonSelectionProvider");
  }
  return context;
}
