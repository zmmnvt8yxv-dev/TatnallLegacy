import { safeUrl } from "../lib/url.js";

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

async function fetchJson(path, { optional = false } = {}) {
  const url = safeUrl(path);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (optional && response.status === 404) {
      return null;
    }
    throw new Error(`${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

export async function loadManifest() {
  try {
    const cached = getCached("manifest");
    if (cached) return cached;
    const manifest = await fetchJson("data/manifest.json");
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
  try {
    const cached = getCached("core");
    if (cached) return cached;
    const manifest = await loadManifest();
    playersPath = manifest?.paths?.players || "data/players.json";
    playerIdsPath = manifest?.paths?.playerIds || "data/player_ids.json";
    teamsPath = manifest?.paths?.teams || "data/teams.json";
    const [players, playerIds, teams] = await Promise.all([
      fetchJson(playersPath),
      fetchJson(playerIdsPath),
      fetchJson(teamsPath),
    ]);
    return setCached("core", { players, playerIds, teams });
  } catch (err) {
    console.error("DATA_LOAD_ERROR", {
      url: {
        playersPath,
        playerIdsPath,
        teamsPath,
      },
      err,
    });
    throw err;
  }
}

export async function loadSeasonSummary(season) {
  const key = `season:${season}`;
  let path;
  try {
    const cached = getCached(key);
    if (cached) return cached;
    const manifest = await loadManifest();
    path = resolvePath(manifest?.paths?.seasonSummary, { season });
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
    path = resolvePath(manifest?.paths?.weeklyChunk, { season, week });
    if (!path) return null;
    const payload = await fetchJson(path);
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
    path = resolvePath(manifest?.paths?.transactions, { season });
    if (!path) return null;
    const payload = await fetchJson(path);
    return setCached(key, payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || `transactions:${season}`, err });
    throw err;
  }
}

export async function loadAllTime() {
  let path;
  try {
    const cached = getCached("allTime");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = manifest?.paths?.allTime;
    if (!path) return null;
    const payload = await fetchJson(path);
    return setCached("allTime", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "allTime", err });
    throw err;
  }
}

export async function loadMetricsSummary() {
  let path;
  try {
    const cached = getCached("metricsSummary");
    if (cached) return cached;
    const manifest = await loadManifest();
    path = manifest?.paths?.metricsSummary || "data/player_metrics/summary.json";
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
    path =
      resolvePath(manifest?.paths?.playerMetricsWeekly, { season }) ||
      `data/player_metrics/weekly/${season}.json`;
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
    path =
      resolvePath(manifest?.paths?.playerMetricsSeason, { season }) ||
      `data/player_metrics/season/${season}.json`;
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
    path = manifest?.paths?.playerMetricsCareer || "data/player_metrics/career.json";
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
    path = manifest?.paths?.playerMetricsBoomBust || "data/player_metrics/boom_bust.json";
    const payload = await fetchJson(path, { optional: true });
    if (!payload) return null;
    return setCached("boomBustMetrics", payload);
  } catch (err) {
    console.error("DATA_LOAD_ERROR", { url: path || "boomBustMetrics", err });
    throw err;
  }
}
