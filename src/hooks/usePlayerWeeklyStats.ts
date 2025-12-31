import { useEffect, useState } from "react";
import { fetchFantasyWeeklyStats } from "../data/services";
import type { PlayerSeasonWeek } from "../data/selectors";
import type { PlayerWeeklyStats } from "../data/services";

type PlayerWeeklyStatsState = {
  status: "idle" | "loading" | "ready" | "error";
  weeks: PlayerSeasonWeek[];
};

const DEFAULT_STATE: PlayerWeeklyStatsState = {
  status: "idle",
  weeks: [],
};

const POINTS_KEYS = [
  "fantasy_points_ppr",
  "fantasy_points",
  "ppr_points",
  "points",
  "fpts",
];

function getPoints(stats: Record<string, number>): number {
  for (const key of POINTS_KEYS) {
    const value = stats[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function mapWeeklyStats(entries: PlayerWeeklyStats[]): PlayerSeasonWeek[] {
  return entries
    .map((entry) => ({
      week: entry.week,
      points: getPoints(entry.stats),
      opponent: null,
      team: entry.team ?? null,
      started: null,
    }))
    .sort((a, b) => a.week - b.week);
}

export function usePlayerWeeklyStats(
  playerId: string | null,
  season: number | null,
): PlayerWeeklyStatsState {
  const [state, setState] = useState<PlayerWeeklyStatsState>(DEFAULT_STATE);

  useEffect(() => {
    if (!playerId || !season) {
      setState(DEFAULT_STATE);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    fetchFantasyWeeklyStats(playerId, season)
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
  }, [playerId, season]);

  return state;
}
