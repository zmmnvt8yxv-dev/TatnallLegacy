import { useCallback, useEffect, useRef, useState } from "react";
import { dataLoader } from "../data/loader";
import type { SeasonData } from "../data/schema";

type AllSeasonsState = {
  status: "idle" | "loading" | "ready" | "error";
  seasons: SeasonData[];
  years: number[];
  error?: string;
  loadAllSeasons: () => void;
};

export function useAllSeasonsData(): AllSeasonsState {
  const [state, setState] = useState<Omit<AllSeasonsState, "loadAllSeasons">>({
    status: "idle",
    seasons: [],
    years: [],
  });
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadAllSeasons = useCallback(() => {
    if (state.status === "loading" || state.status === "ready") {
      return;
    }
    const load = async () => {
      setState((prev) => ({ ...prev, status: "loading", error: undefined }));
      try {
        const manifest = await dataLoader.loadManifest();
        const years = manifest.years ?? [];
        const seasons = years.length > 0 ? await dataLoader.preloadSeasons(years) : [];
        if (!isMounted.current) {
          return;
        }
        setState({ status: "ready", seasons, years });
      } catch (error) {
        if (!isMounted.current) {
          return;
        }
        setState({
          status: "error",
          seasons: [],
          years: [],
          error: error instanceof Error ? error.message : "Unable to load season data",
        });
      }
    };

    load();
  }, [state.status]);

  return { ...state, loadAllSeasons };
}
