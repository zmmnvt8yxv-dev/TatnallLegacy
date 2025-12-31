import { createRequestCache, getOrSetCached } from "./cache";
import { extractNumericStats, getRecord, isRecord, pickFirstRecord, toNumber, toStringValue } from "./utils";
import type { PlayerBio, PlayerGameLogEntry } from "./types";

const ESPN_BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl";
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 10;

const rosterCache = createRequestCache<PlayerBio[]>();
const playerCache = createRequestCache<PlayerBio | null>();
const gameLogCache = createRequestCache<PlayerGameLogEntry[]>();

function buildEspnUrl(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(path, ESPN_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchEspnJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ESPN request failed: ${response.status}`);
  }
  return response.json();
}

function normalizeEspnAthlete(entry: unknown): PlayerBio | null {
  const record = getRecord(entry);
  const id = toStringValue(record.id ?? record.athleteId ?? record.uid, "").trim();
  const name = toStringValue(record.fullName ?? record.displayName ?? record.name, "").trim();
  if (!id || !name) {
    return null;
  }

  const team = pickFirstRecord(record.team, record.currentTeam, record.teamInfo);
  const position = pickFirstRecord(record.position, record.positionInfo);
  const headshot = pickFirstRecord(record.headshot, record.images, record.image);

  return {
    playerId: id,
    name,
    team: toStringValue(team?.abbreviation ?? team?.shortDisplayName ?? team?.name, "") || null,
    position: toStringValue(position?.abbreviation ?? position?.name, "") || null,
    jersey: toStringValue(record.jersey ?? record.jerseyNumber, "") || null,
    headshot: toStringValue(headshot?.href ?? headshot?.url, "") || null,
  };
}

function normalizeRoster(payload: unknown): PlayerBio[] {
  const data = getRecord(payload);
  const athletes = Array.isArray(data.athletes)
    ? data.athletes
    : Array.isArray(data.team?.athletes)
      ? data.team.athletes
      : [];

  const roster: PlayerBio[] = [];

  athletes.forEach((group) => {
    if (Array.isArray(group?.items)) {
      group.items.forEach((athlete: unknown) => {
        const normalized = normalizeEspnAthlete(athlete);
        if (normalized) {
          roster.push(normalized);
        }
      });
      return;
    }
    const normalized = normalizeEspnAthlete(group);
    if (normalized) {
      roster.push(normalized);
    }
  });

  return roster;
}

function normalizeGameLog(payload: unknown, playerId: string, season: number): PlayerGameLogEntry[] {
  const data = getRecord(payload);
  const events = Array.isArray(data.events)
    ? data.events
    : Array.isArray(data.games)
      ? data.games
      : Array.isArray(data.items)
        ? data.items
        : [];

  return events
    .map((event) => {
      const record = getRecord(event);
      const week = toNumber(record.week ?? record.weekNumber ?? record.week_id);
      const opponent =
        toStringValue(record.opponent?.abbreviation ?? record.opponent?.displayName ?? record.opponent, "") ||
        null;
      const result = toStringValue(record.result ?? record.outcome, "") || null;
      const statsSource = record.statistics ?? record.stats ?? record.statLines ?? record;

      return {
        playerId,
        season,
        week,
        opponent,
        result,
        stats: extractNumericStats(statsSource),
      } satisfies PlayerGameLogEntry;
    })
    .filter((entry) => entry.stats && Object.keys(entry.stats).length > 0);
}

export async function fetchEspnRoster(
  teamId: string,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerBio[]> {
  const key = `roster:${teamId}`;
  return getOrSetCached(rosterCache, key, async () => {
    const url = buildEspnUrl(`/teams/${teamId}/roster`);
    const payload = await fetchEspnJson(url);
    return normalizeRoster(payload);
  }, ttlMs);
}

export async function fetchEspnPlayerInfo(
  athleteId: string,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerBio | null> {
  const key = `player:${athleteId}`;
  return getOrSetCached(playerCache, key, async () => {
    const url = buildEspnUrl(`/athletes/${athleteId}`);
    const payload = await fetchEspnJson(url);
    return normalizeEspnAthlete(payload);
  }, ttlMs);
}

export async function fetchEspnGameLog(
  athleteId: string,
  season: number,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerGameLogEntry[]> {
  const key = `gamelog:${athleteId}:${season}`;
  return getOrSetCached(gameLogCache, key, async () => {
    const url = buildEspnUrl(`/athletes/${athleteId}/gamelog`, { season });
    const payload = await fetchEspnJson(url);
    return normalizeGameLog(payload, athleteId, season);
  }, ttlMs);
}
