import { useEffect, useMemo, useState } from "react";
import { fetchNflverseWeeklyStats } from "../data/services";
import type { PlayerSeasonWeek } from "../data/selectors";
import { mapWeeklyStats } from "./weeklyStats";

type PlayerSeasonWeeklyStatsState = {
  status: "idle" | "loading" | "ready" | "error";
  weeksBySeason: Record<number, PlayerSeasonWeek[]>;
};

const DEFAULT_STATE: PlayerSeasonWeeklyStatsState = {
  status: "idle",
  weeksBySeason: {},
};

export function usePlayerNflverseSeasonWeeklyStats(
  playerName: string | null,
  seasons: number[],
): PlayerSeasonWeeklyStatsState {
  const [state, setState] = useState<PlayerSeasonWeeklyStatsState>(DEFAULT_STATE);
  const seasonsKey = useMemo(() => seasons.join(","), [seasons]);

  useEffect(() => {
    if (!playerName || seasons.length === 0) {
      setState(DEFAULT_STATE);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    Promise.all(
      seasons.map(async (season) => {
        const entries = await fetchNflverseWeeklyStats(playerName, season);
        return { season, weeks: mapWeeklyStats(entries) };
      }),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }
        const weeksBySeason = results.reduce<Record<number, PlayerSeasonWeek[]>>(
          (acc, { season, weeks }) => {
            if (weeks.length) {
              acc[season] = weeks;
            }
            return acc;
          },
          {},
        );
        setState({ status: "ready", weeksBySeason });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.warn("Unable to load nflverse weekly stats", error);
        setState({ status: "error", weeksBySeason: {} });
      });

    return () => {
      cancelled = true;
    };
  }, [playerName, seasonsKey]);

  return state;
}
