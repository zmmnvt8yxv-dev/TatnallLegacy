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

const PASSING_YARDS_KEYS = ["passing_yards", "pass_yards", "pass_yds", "passYds", "passYards"];
const PASSING_TDS_KEYS = ["passing_tds", "pass_tds", "pass_td", "passTds", "passTDs"];
const RUSHING_YARDS_KEYS = ["rushing_yards", "rush_yards", "rush_yds", "rushYds", "rushYards"];
const RUSHING_TDS_KEYS = ["rushing_tds", "rush_tds", "rush_td", "rushTds", "rushTDs"];
const RECEPTIONS_KEYS = ["receptions", "rec", "recs", "receptions_total"];
const RECEIVING_YARDS_KEYS = [
  "receiving_yards",
  "rec_yards",
  "rec_yds",
  "recYds",
  "recYards",
];
const RECEIVING_TDS_KEYS = ["receiving_tds", "rec_tds", "rec_td", "recTds", "recTDs"];

function getPoints(stats: Record<string, number>): number {
  for (const key of POINTS_KEYS) {
    const value = stats[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function getStatValue(stats: Record<string, number>, keys: string[]): number | null {
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function mapWeeklyStats(entries: PlayerWeeklyStats[]): PlayerSeasonWeek[] {
  return entries
    .map((entry) => ({
      week: entry.week,
      points: getPoints(entry.stats),
      opponent: null,
      team: entry.team ?? null,
      started: null,
      passingYards: getStatValue(entry.stats, PASSING_YARDS_KEYS),
      passingTds: getStatValue(entry.stats, PASSING_TDS_KEYS),
      rushingYards: getStatValue(entry.stats, RUSHING_YARDS_KEYS),
      rushingTds: getStatValue(entry.stats, RUSHING_TDS_KEYS),
      receptions: getStatValue(entry.stats, RECEPTIONS_KEYS),
      receivingYards: getStatValue(entry.stats, RECEIVING_YARDS_KEYS),
      receivingTds: getStatValue(entry.stats, RECEIVING_TDS_KEYS),
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
