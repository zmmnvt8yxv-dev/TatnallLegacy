import type { PlayerSeasonWeek } from "../data/selectors";
import type { PlayerWeeklyStats } from "../data/services";

const POINTS_KEYS = [
  "fantasy_points_ppr",
  "fantasy_points",
  "ppr_points",
  "points",
  "fpts",
];

const PASSING_YARDS_KEYS = [
  "passing_yards",
  "passing_yds",
  "pass_yards",
  "pass_yds",
  "passYds",
  "passYards",
  "pass_yd",
];
const PASSING_TDS_KEYS = [
  "passing_tds",
  "passing_td",
  "pass_tds",
  "pass_td",
  "passTds",
  "passTDs",
  "passTD",
];
const RUSHING_YARDS_KEYS = [
  "rushing_yards",
  "rushing_yds",
  "rush_yards",
  "rush_yds",
  "rush_yd",
  "rushYds",
  "rushYards",
];
const RUSHING_TDS_KEYS = [
  "rushing_tds",
  "rushing_td",
  "rush_tds",
  "rush_td",
  "rushTds",
  "rushTDs",
  "rushTD",
];
const RECEPTIONS_KEYS = ["receptions", "reception", "rec", "recs", "receptions_total"];
const RECEIVING_YARDS_KEYS = [
  "receiving_yards",
  "receiving_yds",
  "rec_yards",
  "rec_yds",
  "recYds",
  "recYards",
  "rec_yd",
];
const RECEIVING_TDS_KEYS = [
  "receiving_tds",
  "receiving_td",
  "rec_tds",
  "rec_td",
  "recTds",
  "recTDs",
  "recTD",
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

function getStatValue(stats: Record<string, number>, keys: string[]): number | null {
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function mapWeeklyStats(entries: PlayerWeeklyStats[]): PlayerSeasonWeek[] {
  return entries
    .map((entry) => ({
      week: entry.week,
      points: getPoints(entry.stats),
      opponent: entry.opponent ?? null,
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
