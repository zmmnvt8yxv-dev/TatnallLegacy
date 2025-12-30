import { useEffect, useState } from "react";
import { dataLoader } from "../data/loader";
import type { SeasonData } from "../data/schema";

type SeasonState = {
  status: "loading" | "ready" | "error";
  season?: SeasonData;
  error?: string;
  year?: number;
};

export function useSeasonData(requestedYear?: number): SeasonState {
  const [state, setState] = useState<SeasonState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const loadSeason = async () => {
      setState({ status: "loading" });
      try {
        let year = requestedYear;
        if (!year) {
          const manifest = await dataLoader.loadManifest();
          const years = manifest.years ?? [];
          year = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
        }
        const season = await dataLoader.loadSeason(year);
        if (!active) {
          return;
        }
        setState({ status: "ready", season, year });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "Unable to load season data",
        });
      }
    };

    loadSeason();

    return () => {
      active = false;
    };
  }, [requestedYear]);

  return state;
}
