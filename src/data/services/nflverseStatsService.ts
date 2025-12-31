import { createRequestCache, getOrSetCached } from "./cache";
import type { PlayerWeeklyStats } from "./types";

const DEFAULT_BASE_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/player_stats";
const DEFAULT_STATS_PATH = "player_stats.csv";
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 15;
const DEFAULT_PROXY_URL = "https://ghproxy.net/";

const nflverseWeeklyCache = createRequestCache<PlayerWeeklyStats[]>();

const PLAYER_NAME_KEYS = ["player_display_name", "player_name", "player"];
const TEAM_KEYS = ["recent_team", "team", "team_abbr"];
const OPPONENT_KEYS = ["opponent_team", "opponent"];
const SEASON_TYPE_KEYS = ["season_type", "season_type_id", "season_type_name"];

type CsvRow = Record<string, string>;

function normalizePlayerName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .trim();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function toNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFirstValue(record: CsvRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value) {
      return value;
    }
  }
  return null;
}

function isRegularSeason(record: CsvRow): boolean {
  const value = getFirstValue(record, SEASON_TYPE_KEYS);
  if (!value) {
    return true;
  }
  const normalized = value.toLowerCase();
  return normalized === "reg" || normalized === "regular" || normalized === "regular season";
}

function buildUrl(): string {
  const baseUrl = import.meta.env.VITE_NFLVERSE_STATS_BASE_URL ?? DEFAULT_BASE_URL;
  const path = import.meta.env.VITE_NFLVERSE_STATS_PATH ?? DEFAULT_STATS_PATH;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function buildProxyUrl(targetUrl: string): string | null {
  const configuredProxy = import.meta.env.VITE_NFLVERSE_STATS_PROXY;
  if (configuredProxy === "") {
    return null;
  }
  const proxyBase = configuredProxy ?? DEFAULT_PROXY_URL;
  if (!proxyBase) {
    return null;
  }
  if (proxyBase.includes("{url}")) {
    return proxyBase.replace("{url}", encodeURIComponent(targetUrl));
  }
  return `${proxyBase}${encodeURIComponent(targetUrl)}`;
}

async function fetchCsvText(url: string): Promise<string> {
  const proxyUrl = buildProxyUrl(url);
  if (proxyUrl) {
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`NFLverse stats proxy request failed: ${response.status}`);
      }
      return response.text();
    } catch (error) {
      console.warn("NFLverse stats proxy failed, retrying direct request.", error);
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NFLverse stats request failed: ${response.status}`);
  }
  return response.text();
}

function mapNflverseWeeklyStats(
  rows: CsvRow[],
  playerName: string,
  season: number,
): PlayerWeeklyStats[] {
  const normalizedPlayer = normalizePlayerName(playerName);

  return rows
    .map((row) => {
      const seasonValue = toNumber(row.season);
      const weekValue = toNumber(row.week);
      if (seasonValue !== season || !weekValue || !isRegularSeason(row)) {
        return null;
      }

      const candidateName = normalizePlayerName(
        getFirstValue(row, PLAYER_NAME_KEYS) ?? "",
      );
      if (!candidateName || candidateName !== normalizedPlayer) {
        return null;
      }

      return {
        playerId: row.player_id || playerName,
        playerName,
        season,
        week: weekValue,
        team: getFirstValue(row, TEAM_KEYS),
        position: row.position || null,
        opponent: getFirstValue(row, OPPONENT_KEYS),
        stats: {
          fantasy_points: toNumber(row.fantasy_points) ?? 0,
          fantasy_points_ppr:
            toNumber(row.fantasy_points_ppr) ?? toNumber(row.fantasy_points) ?? 0,
          fantasy_points_half_ppr: toNumber(row.fantasy_points_half_ppr) ?? 0,
          passing_yards: toNumber(row.passing_yards) ?? 0,
          passing_tds: toNumber(row.passing_tds) ?? 0,
          rushing_yards: toNumber(row.rushing_yards) ?? 0,
          rushing_tds: toNumber(row.rushing_tds) ?? 0,
          receptions: toNumber(row.receptions) ?? 0,
          receiving_yards: toNumber(row.receiving_yards) ?? 0,
          receiving_tds: toNumber(row.receiving_tds) ?? 0,
        },
      } satisfies PlayerWeeklyStats;
    })
    .filter((entry): entry is PlayerWeeklyStats => Boolean(entry))
    .sort((a, b) => a.week - b.week);
}

export async function fetchNflverseWeeklyStats(
  playerName: string,
  season: number,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerWeeklyStats[]> {
  const key = `nflverse:${playerName}:${season}`;
  return getOrSetCached(nflverseWeeklyCache, key, async () => {
    const csvText = await fetchCsvText(buildUrl());
    const [headerLine, ...lines] = csvText.split(/\r?\n/);
    if (!headerLine) {
      return [];
    }
    const headers = parseCsvLine(headerLine);
    const rows = lines
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const values = parseCsvLine(line);
        return headers.reduce<CsvRow>((acc, header, index) => {
          acc[header] = values[index] ?? "";
          return acc;
        }, {});
      });
    return mapNflverseWeeklyStats(rows, playerName, season);
  }, ttlMs);
}
