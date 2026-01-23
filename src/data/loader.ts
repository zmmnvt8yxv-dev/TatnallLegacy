import { safeUrl } from "../lib/url";
import {
  ManifestSchema,
  PlayersArraySchema,
  PlayerIdsArraySchema,
  TeamsArraySchema,
  EspnNameMapSchema,
  PlayerSearchSchema,
  WeeklyChunkSchema,
  SeasonSummarySchema,
  validateWithWarnings,
  type Manifest,
  type Player,
  type PlayerId,
  type Team,
  type EspnNameMap,
  type PlayerSearchEntry,
  type WeeklyChunk,
  type SeasonSummary,
  type Transactions,
  type AllTime,
  type PlayerStats,
  type PlayerMetrics,
} from "../schemas/index";
import type {
  FetchJsonOptions,
  MetricsSummary,
  NflProfile,
  NflSiloMeta,
} from "../types/index";

const IS_DEV = import.meta.env.DEV;

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

const cache = new Map<string, unknown>();

function getCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, value);
  return value;
}

// =============================================================================
// PATH RESOLUTION
// =============================================================================

function resolvePath(template: string | null | undefined, params: Record<string, string | number> = {}): string | null {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

// =============================================================================
// LOGGING
// =============================================================================

function logDev(message: string, details?: unknown): void {
  if (!IS_DEV) return;
  if (details) {
    console.info(message, details);
    return;
  }
  console.info(message);
}

function logMissingKeys(context: string, payload: unknown, keys: string[]): void {
  if (!IS_DEV) return;
  const obj = payload as Record<string, unknown> | null | undefined;
  const missing = keys.filter((key) => obj?.[key] == null);
  if (missing.length) {
    console.warn("DATA_MISSING_KEYS", { context, missing });
  }
}

// =============================================================================
// MANIFEST PATH HELPERS
// =============================================================================

function requireManifestPath(manifest: Manifest | null | undefined, key: keyof Manifest["paths"]): string {
  const path = manifest?.paths?.[key];
  if (!path) {
    logDev("DATA_MISSING_KEY", { context: "manifest.paths", key });
    throw new Error(`Missing manifest path: ${key}`);
  }
  return path;
}

function optionalManifestPath(manifest: Manifest | null | undefined, key: keyof Manifest["paths"]): string | null {
  const path = manifest?.paths?.[key];
  if (!path) {
    logDev("DATA_MISSING_KEY", { context: "manifest.paths", key });
    return null;
  }
  return path;
}

// =============================================================================
// FETCH UTILITIES
// =============================================================================

async function fetchJson<T>(
  path: string,
  { optional = false, retries = 2, retryDelay = 500 }: FetchJsonOptions = {}
): Promise<T | null> {
  const url = safeUrl(path);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        if (optional && response.status === 404) {
          return null;
        }
        throw new Error(`${response.status} ${response.statusText} (${url})`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if (optional) {
          return null;
        }
        throw new Error(`Non-JSON response (${contentType || "unknown"}) (${url})`);
      }

      const payload = await response.json() as T;
      logDev("DATA_FILE_OK", { url, attempt });
      return payload;
    } catch (err) {
      lastError = err as Error;

      // Don't retry for 404s or if optional and not found
      if (optional && (lastError.message?.includes("404") || lastError.message?.includes("Non-JSON"))) {
        return null;
      }

      // If not last attempt, wait and retry
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        logDev("DATA_FETCH_RETRY", { url, attempt: attempt + 1, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  if (optional) {
    console.warn("DATA_FETCH_FAILED_OPTIONAL", { url, error: lastError?.message });
    return null;
  }

  console.error("DATA_FETCH_FAILED", { url, error: lastError?.message, retries });
  throw lastError;
}

// =============================================================================
// CORE DATA TYPES
// =============================================================================

export interface CoreDataResult {
  players: Player[];
  playerIds: PlayerId[];
  teams: Team[];
  espnNameMap: EspnNameMap;
  playerSearch: PlayerSearchEntry[];
}

// =============================================================================
// LOADER FUNCTIONS
// =============================================================================

export async function loadManifest(): Promise<Manifest> {
  try {
    const cached = getCached<Manifest>("manifest");
    if (cached) return cached;
    const manifest = await fetchJson<Manifest>("data/manifest.json");

    if (!manifest) {
      throw new Error("Failed to load manifest");
    }

    // Validate manifest structure
    validateWithWarnings(ManifestSchema, manifest, "manifest", IS_DEV);

    logMissingKeys("manifest", manifest, ["seasons", "weeksBySeason", "paths"]);
    logDev("DATA_MANIFEST_OK", {
      seasons: Array.isArray(manifest?.seasons) ? manifest.seasons.length : 0,
      pathKeys: Object.keys(manifest?.paths || {}).length,
    });
    return setCached("manifest", manifest);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: "data/manifest.json", err });
    throw err;
  }
}

export async function loadCoreData(): Promise<CoreDataResult> {
  let playersPath: string | null = null;
  let playerIdsPath: string | null = null;
  let teamsPath: string | null = null;
  let espnNameMapPath: string | null = null;
  let playerSearchPath: string | null = null;
  try {
    const cached = getCached<CoreDataResult>("core");
    if (cached) return cached;
    const manifest = await loadManifest();
    playersPath = optionalManifestPath(manifest, "players");
    playerIdsPath = optionalManifestPath(manifest, "playerIds");
    teamsPath = optionalManifestPath(manifest, "teams");
    espnNameMapPath = optionalManifestPath(manifest, "espnNameMap");
    playerSearchPath = optionalManifestPath(manifest, "playerSearch") || "data/player_search.json";
    const [players, playerIds, teams, espnNameMap, playerSearch] = await Promise.all([
      playersPath ? fetchJson<Player[]>(playersPath, { optional: true }) : Promise.resolve([]),
      playerIdsPath ? fetchJson<PlayerId[]>(playerIdsPath, { optional: true }) : Promise.resolve([]),
      teamsPath ? fetchJson<Team[]>(teamsPath, { optional: true }) : Promise.resolve([]),
      espnNameMapPath ? fetchJson<EspnNameMap>(espnNameMapPath, { optional: true }) : Promise.resolve({}),
      playerSearchPath ? fetchJson<{ rows: PlayerSearchEntry[] }>(playerSearchPath, { optional: true }) : Promise.resolve(null),
    ]);

    // Validate each data source
    if (players) {
      validateWithWarnings(PlayersArraySchema, players, "players", IS_DEV);
    }
    if (playerIds) {
      validateWithWarnings(PlayerIdsArraySchema, playerIds, "playerIds", IS_DEV);
    }
    if (teams) {
      validateWithWarnings(TeamsArraySchema, teams, "teams", IS_DEV);
    }
    if (espnNameMap && typeof espnNameMap === "object") {
      validateWithWarnings(EspnNameMapSchema, espnNameMap, "espnNameMap", IS_DEV);
    }
    if (playerSearch) {
      validateWithWarnings(PlayerSearchSchema, playerSearch, "playerSearch", IS_DEV);
    }

    if (IS_DEV) {
      if (!playerSearch?.rows?.length) {
        console.warn("DATA_OPTIONAL_MISSING", { key: "playerSearch", url: playerSearchPath });
      }
      if (!players?.length) {
        console.warn("DATA_OPTIONAL_MISSING", { key: "players", url: playersPath });
      }
      if (!playerIds?.length) {
        console.warn("DATA_OPTIONAL_MISSING", { key: "playerIds", url: playerIdsPath });
      }
    }
    return setCached("core", {
      players: players || [],
      playerIds: playerIds || [],
      teams: teams || [],
      espnNameMap: espnNameMap || {},
      playerSearch: playerSearch?.rows || [],
    });
  } catch (err) {
    console.error("DATA_LOAD_ERROR", {
      url: {
        playersPath,
        playerIdsPath,
        teamsPath,
        espnNameMapPath,
        playerSearchPath,
      },
      err,
    });
    return setCached("core", { players: [], playerIds: [], teams: [], espnNameMap: {}, playerSearch: [] });
  }
}

export async function loadSeasonSummary(season: number): Promise<SeasonSummary | null> {
  const key = `season:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<SeasonSummary>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    path = resolvePath(requireManifestPath(manifest, "seasonSummary"), { season });
    if (!path) return null;
    const payload = await fetchJson<SeasonSummary>(path);

    if (!payload) return null;

    // Validate season summary structure
    validateWithWarnings(SeasonSummarySchema, payload, `seasonSummary:${season}`, IS_DEV);

    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `seasonSummary:${season}`, err });
    throw err;
  }
}

export async function loadWeekData(season: number, week: number): Promise<WeeklyChunk | null> {
  const key = `week:${season}:${week}`;
  let path: string | null = null;
  try {
    const cached = getCached<WeeklyChunk>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    path = resolvePath(requireManifestPath(manifest, "weeklyChunk"), { season, week });
    if (!path) return null;
    const payload = await fetchJson<WeeklyChunk>(path);

    if (!payload) return null;

    // Validate weekly chunk structure
    validateWithWarnings(WeeklyChunkSchema, payload, `weeklyChunk:${season}:${week}`, IS_DEV);

    const matchups = Array.isArray(payload?.matchups) ? payload.matchups : null;
    const lineups = Array.isArray(payload?.lineups) ? payload.lineups : null;
    const rosterCount = lineups
      ? new Set(lineups.map((row) => String(row?.team ?? ""))).size
      : 0;
    logMissingKeys(`weeklyChunk:${season}:${week}`, payload, ["matchups", "lineups"]);
    logDev("DATA_WEEK_COUNTS", {
      season,
      week,
      matchups: matchups ? matchups.length : 0,
      lineups: lineups ? lineups.length : 0,
      rosters: rosterCount,
    });
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `weeklyChunk:${season}:${week}`, err });
    throw err;
  }
}

export async function loadTransactions(season: number): Promise<Transactions | null> {
  const key = `transactions:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<Transactions>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "transactions");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson<Transactions>(path, { optional: true });
    if (!payload) return null;
    if (payload && typeof payload === "object") {
      (payload as Transactions).__meta = { path };
    }
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `transactions:${season}`, err });
    return null;
  }
}

export async function loadAllTime(): Promise<AllTime | null> {
  let path: string | null = null;
  try {
    const cached = getCached<AllTime>("allTime");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = requireManifestPath(manifest, "allTime");
    if (!path) return null;
    const payload = await fetchJson<AllTime>(path);
    if (!payload) return null;
    return setCached("allTime", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "allTime", err });
    throw err;
  }
}

export async function loadPlayerMetricsBoomBust(): Promise<PlayerMetrics | null> {
  const key = "playerMetricsBoomBust";
  let path: string | null = null;
  try {
    const cached = getCached<PlayerMetrics>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerMetricsBoomBust");
    path = template ? resolvePath(template) : null;
    if (!path) return null;
    const payload = await fetchJson<PlayerMetrics>(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "playerMetricsBoomBust", err });
    return null;
  }
}

export async function loadPlayerStatsWeekly(season: number): Promise<PlayerStats | null> {
  const key = `playerStatsWeekly:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<PlayerStats>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerStatsWeekly");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson<PlayerStats>(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `playerStatsWeekly:${season}`, err });
    throw err;
  }
}

export async function loadPlayerStatsFull(season: number): Promise<PlayerStats | null> {
  const key = `playerStatsFull:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<PlayerStats>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerStatsFull") || "data/player_stats/full/{season}.json";
    path = resolvePath(template, { season });
    if (!path) return null;
    const payload = await fetchJson<PlayerStats>(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `playerStatsFull:${season}`, err });
    throw err;
  }
}

export async function loadPlayerStatsSeason(season: number): Promise<PlayerStats | null> {
  const key = `playerStatsSeason:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<PlayerStats>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerStatsSeason");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson<PlayerStats>(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `playerStatsSeason:${season}`, err });
    throw err;
  }
}

export async function loadPlayerStatsCareer(): Promise<PlayerStats | null> {
  let path: string | null = null;
  try {
    const cached = getCached<PlayerStats>("playerStatsCareer");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "playerStatsCareer");
    if (!path) return null;
    const payload = await fetchJson<PlayerStats>(path, { optional: true });
    if (!payload) return null;
    return setCached("playerStatsCareer", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "playerStatsCareer", err });
    throw err;
  }
}

export async function loadMetricsSummary(): Promise<MetricsSummary | null> {
  let path: string | null = null;
  try {
    const cached = getCached<MetricsSummary>("metricsSummary");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "metricsSummary");
    if (!path) return null;
    const payload = await fetchJson<MetricsSummary>(path, { optional: true });
    if (!payload) return null;
    return setCached("metricsSummary", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "metricsSummary", err });
    throw err;
  }
}

export async function loadWeeklyMetrics(season: number): Promise<PlayerMetrics | null> {
  const key = `weeklyMetrics:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<PlayerMetrics>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerMetricsWeekly");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson<PlayerMetrics>(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `weeklyMetrics:${season}`, err });
    throw err;
  }
}

export async function loadSeasonMetrics(season: number): Promise<PlayerMetrics | null> {
  const key = `seasonMetrics:${season}`;
  let path: string | null = null;
  try {
    const cached = getCached<PlayerMetrics>(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerMetricsSeason");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson<PlayerMetrics>(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `seasonMetrics:${season}`, err });
    throw err;
  }
}

export async function loadCareerMetrics(): Promise<PlayerMetrics | null> {
  let path: string | null = null;
  try {
    const cached = getCached<PlayerMetrics>("careerMetrics");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "playerMetricsCareer");
    if (!path) return null;
    const payload = await fetchJson<PlayerMetrics>(path, { optional: true });
    if (!payload) return null;
    return setCached("careerMetrics", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "careerMetrics", err });
    throw err;
  }
}

export async function loadBoomBustMetrics(): Promise<PlayerMetrics | null> {
  let path: string | null = null;
  try {
    const cached = getCached<PlayerMetrics>("boomBustMetrics");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "playerMetricsBoomBust");
    if (!path) return null;
    const payload = await fetchJson<PlayerMetrics>(path, { optional: true });
    if (!payload) return null;
    return setCached("boomBustMetrics", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "boomBustMetrics", err });
    throw err;
  }
}

export async function loadMegaProfile(playerId: string | null | undefined): Promise<NflProfile | null> {
  if (!playerId) return null;
  const key = `megaProfile:${playerId}`;
  const path = `data/nfl_profiles/${playerId}.json`;
  try {
    const cached = getCached<NflProfile>(key);
    if (cached) return cached;
    const payload = await fetchJson<NflProfile>(path, { optional: true });
    return setCached(key, payload);
  } catch (err) {
    console.warn("DATA_LOAD_WARN", { url: path, err: (err as Error).message });
    return null;
  }
}

export async function loadNflSiloMeta(): Promise<NflSiloMeta | null> {
  const key = "nflSiloMeta";
  const path = "data/nfl_silo_meta.json";
  try {
    const cached = getCached<NflSiloMeta>(key);
    if (cached) return cached;
    const payload = await fetchJson<NflSiloMeta>(path, { optional: true });
    return setCached(key, payload);
  } catch (err) {
    console.warn("DATA_LOAD_WARN", { url: path, err: (err as Error).message });
    return null;
  }
}
