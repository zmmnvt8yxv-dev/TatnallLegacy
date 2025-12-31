import { createRequestCache, getOrSetCached } from "./cache";
import { extractNumericStats, getRecord, isRecord, toNumber, toStringValue } from "./utils";
import type { PlayerSeasonStats, PlayerWeeklyStats } from "./types";

const DEFAULT_BASE_URL = "https://fantasyfootballapi.pro/api";
const DEFAULT_SEASON_PATH = "/stats/season";
const DEFAULT_WEEKLY_PATH = "/stats/weekly";
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 15;

const seasonStatsCache = createRequestCache<PlayerSeasonStats | null>();
const weeklyStatsCache = createRequestCache<PlayerWeeklyStats[]>();

function buildUrl(path: string, params: Record<string, string | number>) {
  const baseUrl = import.meta.env.VITE_FANTASY_STATS_BASE_URL ?? DEFAULT_BASE_URL;
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson(url: string) {
  const headers: Record<string, string> = {};
  const apiKey = import.meta.env.VITE_FANTASY_STATS_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Fantasy stats request failed: ${response.status}`);
  }
  return response.json();
}

function normalizeSeasonStats(
  payload: unknown,
  playerId: string,
  season: number,
): PlayerSeasonStats | null {
  const record = Array.isArray(payload)
    ? payload.find((entry) => String(getRecord(entry).player_id ?? getRecord(entry).playerId) === playerId)
    : payload;

  if (!record || !isRecord(record)) {
    return null;
  }

  const playerName =
    toStringValue(record.player_name ?? record.name ?? record.full_name ?? record.fullName, "").trim() ||
    playerId;

  return {
    playerId,
    playerName,
    season,
    team: toStringValue(record.team ?? record.team_abbr ?? record.nfl_team ?? record.nflTeam, "") || null,
    position: toStringValue(record.position ?? record.pos, "") || null,
    stats: extractNumericStats(record.stats ?? record.totals ?? record),
  };
}

function normalizeWeeklyStats(
  payload: unknown,
  playerId: string,
  season: number,
): PlayerWeeklyStats[] {
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(getRecord(payload).weeks)
      ? (getRecord(payload).weeks as unknown[])
      : Array.isArray(getRecord(payload).stats)
        ? (getRecord(payload).stats as unknown[])
        : [];

  return entries
    .map((entry) => {
      const record = getRecord(entry);
      const week = toNumber(record.week ?? record.week_id ?? record.weekId);
      if (!week) {
        return null;
      }
      const playerName =
        toStringValue(record.player_name ?? record.name ?? record.full_name ?? record.fullName, "").trim() ||
        playerId;

      return {
        playerId,
        playerName,
        season,
        week,
        team: toStringValue(record.team ?? record.team_abbr ?? record.nfl_team ?? record.nflTeam, "") || null,
        position: toStringValue(record.position ?? record.pos, "") || null,
        stats: extractNumericStats(record.stats ?? record),
      } satisfies PlayerWeeklyStats;
    })
    .filter((entry): entry is PlayerWeeklyStats => Boolean(entry));
}

export async function fetchFantasySeasonStats(
  playerId: string,
  season: number,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerSeasonStats | null> {
  const key = `season:${playerId}:${season}`;
  return getOrSetCached(seasonStatsCache, key, async () => {
    const path = import.meta.env.VITE_FANTASY_STATS_SEASON_PATH ?? DEFAULT_SEASON_PATH;
    const url = buildUrl(path, { playerId, season });
    const payload = await fetchJson(url);
    return normalizeSeasonStats(payload, playerId, season);
  }, ttlMs);
}

export async function fetchFantasyWeeklyStats(
  playerId: string,
  season: number,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerWeeklyStats[]> {
  const key = `weekly:${playerId}:${season}`;
  return getOrSetCached(weeklyStatsCache, key, async () => {
    const path = import.meta.env.VITE_FANTASY_STATS_WEEKLY_PATH ?? DEFAULT_WEEKLY_PATH;
    const url = buildUrl(path, { playerId, season });
    const payload = await fetchJson(url);
    return normalizeWeeklyStats(payload, playerId, season);
  }, ttlMs);
}
