import { useEffect, useState } from "react";
import { dataLoader } from "../data/loader";
import type { SeasonData } from "../data/schema";

type AllSeasonsState = {
  status: "loading" | "ready" | "error";
  seasons: SeasonData[];
  years: number[];
  error?: string;
};

export function useAllSeasonsData(): AllSeasonsState {
  const [state, setState] = useState<AllSeasonsState>({
    status: "loading",
    seasons: [],
    years: [],
  });

  useEffect(() => {
    let active = true;

    const loadAllSeasons = async () => {
      setState({ status: "loading", seasons: [], years: [] });
      try {
        const manifest = await dataLoader.loadManifest();
        const years = manifest.years ?? [];
        const seasons = years.length > 0 ? await dataLoader.preloadSeasons(years) : [];
        if (!active) {
          return;
        }
        setState({ status: "ready", seasons, years });
      } catch (error) {
        if (!active) {
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

    loadAllSeasons();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
