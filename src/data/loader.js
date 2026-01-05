import { safeUrl } from "../lib/url.js";

const IS_DEV = import.meta.env.DEV;

const cache = new Map();

function getCached(key) {
  return cache.get(key);
}

function setCached(key, value) {
  cache.set(key, value);
  return value;
}

function resolvePath(template, params = {}) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

function logDev(message, details) {
  if (!IS_DEV) return;
  if (details) {
    console.info(message, details);
    return;
  }
  console.info(message);
}

function logMissingKeys(context, payload, keys) {
  if (!IS_DEV) return;
  const missing = keys.filter((key) => payload?.[key] == null);
  if (missing.length) {
    console.warn("DATA_MISSING_KEYS", { context, missing });
  }
}

function requireManifestPath(manifest, key) {
  const path = manifest?.paths?.[key];
  if (!path) {
    logDev("DATA_MISSING_KEY", { context: "manifest.paths", key });
    throw new Error(`Missing manifest path: ${key}`);
  }
  return path;
}

function optionalManifestPath(manifest, key) {
  const path = manifest?.paths?.[key];
  if (!path) {
    logDev("DATA_MISSING_KEY", { context: "manifest.paths", key });
    return null;
  }
  return path;
}

async function fetchJson(path, { optional = false } = {}) {
  const url = safeUrl(path);
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
  try {
    const payload = await response.json();
    logDev("DATA_FILE_OK", { url });
    return payload;
  } catch (err) {
    if (optional) {
      return null;
    }
    throw err;
  }
}

export async function loadManifest() {
  try {
    const cached = getCached("manifest");
    if (cached) return cached;
    const manifest = await fetchJson("data/manifest.json");
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

export async function loadCoreData() {
  let playersPath;
  let playerIdsPath;
  let teamsPath;
  let espnNameMapPath;
  let playerSearchPath;
  try {
    const cached = getCached("core");
    if (cached) return cached;
    const manifest = await loadManifest();
    playersPath = optionalManifestPath(manifest, "players");
    playerIdsPath = optionalManifestPath(manifest, "playerIds");
    teamsPath = optionalManifestPath(manifest, "teams");
    espnNameMapPath = optionalManifestPath(manifest, "espnNameMap");
    playerSearchPath = optionalManifestPath(manifest, "playerSearch") || "data/player_search.json";
    const [players, playerIds, teams, espnNameMap, playerSearch] = await Promise.all([
      playersPath ? fetchJson(playersPath, { optional: true }) : Promise.resolve([]),
      playerIdsPath ? fetchJson(playerIdsPath, { optional: true }) : Promise.resolve([]),
      teamsPath ? fetchJson(teamsPath, { optional: true }) : Promise.resolve([]),
      espnNameMapPath ? fetchJson(espnNameMapPath, { optional: true }) : Promise.resolve({}),
      playerSearchPath ? fetchJson(playerSearchPath, { optional: true }) : Promise.resolve(null),
    ]);
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

export async function loadSeasonSummary(season) {
  const key = `season:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    path = resolvePath(requireManifestPath(manifest, "seasonSummary"), { season });
    if (!path) return null;
    const payload = await fetchJson(path);
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `seasonSummary:${season}`, err });
    throw err;
  }
}

export async function loadWeekData(season, week) {
  const key = `week:${season}:${week}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    path = resolvePath(requireManifestPath(manifest, "weeklyChunk"), { season, week });
    if (!path) return null;
    const payload = await fetchJson(path);
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

export async function loadTransactions(season) {
  const key = `transactions:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "transactions");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    if (payload && typeof payload === "object") {
      payload.__meta = { path };
    }
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `transactions:${season}`, err });
    return null;
  }
}

export async function loadAllTime() {
  let path;
  try {
    const cached = getCached("allTime");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = requireManifestPath(manifest, "allTime");
    if (!path) return null;
    const payload = await fetchJson(path);
    return setCached("allTime", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "allTime", err });
    throw err;
  }
}

export async function loadPlayerMetricsBoomBust() {
  const key = "playerMetricsBoomBust";
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerMetricsBoomBust");
    path = template ? resolvePath(template) : null;
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "playerMetricsBoomBust", err });
    return null;
  }
}

export async function loadPlayerStatsWeekly(season) {
  const key = `playerStatsWeekly:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerStatsWeekly");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `playerStatsWeekly:${season}`, err });
    throw err;
  }
}

export async function loadPlayerStatsFull(season) {
  const key = `playerStatsFull:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerStatsFull") || "data/player_stats/full/{season}.json";
    path = resolvePath(template, { season });
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `playerStatsFull:${season}`, err });
    throw err;
  }
}

export async function loadPlayerStatsSeason(season) {
  const key = `playerStatsSeason:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerStatsSeason");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `playerStatsSeason:${season}`, err });
    throw err;
  }
}

export async function loadPlayerStatsCareer() {
  let path;
  try {
    const cached = getCached("playerStatsCareer");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "playerStatsCareer");
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached("playerStatsCareer", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "playerStatsCareer", err });
    throw err;
  }
}

export async function loadMetricsSummary() {
  let path;
  try {
    const cached = getCached("metricsSummary");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "metricsSummary");
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached("metricsSummary", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "metricsSummary", err });
    throw err;
  }
}

export async function loadWeeklyMetrics(season) {
  const key = `weeklyMetrics:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerMetricsWeekly");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `weeklyMetrics:${season}`, err });
    throw err;
  }
}

export async function loadSeasonMetrics(season) {
  const key = `seasonMetrics:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    const template = optionalManifestPath(manifest, "playerMetricsSeason");
    path = template ? resolvePath(template, { season }) : null;
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `seasonMetrics:${season}`, err });
    throw err;
  }
}

export async function loadCareerMetrics() {
  let path;
  try {
    const cached = getCached("careerMetrics");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "playerMetricsCareer");
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached("careerMetrics", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "careerMetrics", err });
    throw err;
  }
}

export async function loadBoomBustMetrics() {
  let path;
  try {
    const cached = getCached("boomBustMetrics");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = optionalManifestPath(manifest, "playerMetricsBoomBust");
    if (!path) return null;
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached("boomBustMetrics", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "boomBustMetrics", err });
    throw err;
  }
}
