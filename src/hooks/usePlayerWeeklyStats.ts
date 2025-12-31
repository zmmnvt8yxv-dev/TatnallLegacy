import { useEffect, useState } from "react";
import { fetchFantasyWeeklyStats, fetchNflverseWeeklyStats } from "../data/services";
import type { PlayerSeasonWeek } from "../data/selectors";
import { mapWeeklyStats } from "./weeklyStats";

type PlayerWeeklyStatsState = {
  status: "idle" | "loading" | "ready" | "error";
  weeks: PlayerSeasonWeek[];
};

const DEFAULT_STATE: PlayerWeeklyStatsState = {
  status: "idle",
  weeks: [],
};

export function usePlayerWeeklyStats(
  playerId: string | null,
  playerName: string | null,
  season: number | null,
): PlayerWeeklyStatsState {
  const [state, setState] = useState<PlayerWeeklyStatsState>(DEFAULT_STATE);

  useEffect(() => {
    if ((!playerId && !playerName) || !season) {
      setState(DEFAULT_STATE);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    const fetchStats = async () => {
      if (playerName) {
        const nflverseEntries = await fetchNflverseWeeklyStats(playerName, season);
        if (nflverseEntries.length > 0) {
          return nflverseEntries;
        }
      }
      if (playerId) {
        return fetchFantasyWeeklyStats(playerId, season);
      }
      return [];
    };

    fetchStats()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setState({ status: "ready", weeks: mapWeeklyStats(entries) });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.warn("Unable to load live weekly stats", error);
        setState((prev) => ({ ...prev, status: "error" }));
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, playerName, season]);

  return state;
}
