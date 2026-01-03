const BASE_URL = import.meta.env.BASE_URL || "/";

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
  const url = new URL(path.replace(/^\//, ""), new URL(BASE_URL, window.location.href));
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    if (optional && response.status === 404) {
      return null;
    }
    throw new Error(`${response.status} ${response.statusText} (${url.pathname})`);
  }
  return response.json();
}

export async function loadManifest() {
  const cached = getCached("manifest");
  if (cached) return cached;
  const manifest = await fetchJson("data/manifest.json");
  return setCached("manifest", manifest);
}

export async function loadCoreData() {
  const cached = getCached("core");
  if (cached) return cached;
  const manifest = await loadManifest();
  const playersPath = manifest?.paths?.players || "data/players.json";
  const playerIdsPath = manifest?.paths?.playerIds || "data/player_ids.json";
  const teamsPath = manifest?.paths?.teams || "data/teams.json";
  const [players, playerIds, teams] = await Promise.all([
    fetchJson(playersPath),
    fetchJson(playerIdsPath),
    fetchJson(teamsPath),
  ]);
  return setCached("core", { players, playerIds, teams });
}

export async function loadSeasonSummary(season) {
  const key = `season:${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = resolvePath(manifest?.paths?.seasonSummary, { season });
  if (!path) return null;
  const payload = await fetchJson(path);
  return setCached(key, payload);
}

export async function loadWeekData(season, week) {
  const key = `week:${season}:${week}`;
  const cached = getCached(key);
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = resolvePath(manifest?.paths?.weeklyChunk, { season, week });
  if (!path) return null;
  const payload = await fetchJson(path);
  return setCached(key, payload);
}

export async function loadTransactions(season) {
  const key = `transactions:${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = resolvePath(manifest?.paths?.transactions, { season });
  if (!path) return null;
  const payload = await fetchJson(path);
  return setCached(key, payload);
}

export async function loadAllTime() {
  const cached = getCached("allTime");
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = manifest?.paths?.allTime;
  if (!path) return null;
  const payload = await fetchJson(path);
  return setCached("allTime", payload);
}

export async function loadMetricsSummary() {
  const cached = getCached("metricsSummary");
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = manifest?.paths?.metricsSummary || "data/player_metrics/summary.json";
  const payload = await fetchJson(path, { optional: true });
  if (!payload) return null;
  return setCached("metricsSummary", payload);
}

export async function loadWeeklyMetrics(season) {
  const key = `weeklyMetrics:${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  const manifest = await loadManifest();
  const path =
    resolvePath(manifest?.paths?.playerMetricsWeekly, { season }) ||
    `data/player_metrics/weekly/${season}.json`;
  if (!path) return null;
  const payload = await fetchJson(path, { optional: true });
  if (!payload) return null;
  return setCached(key, payload);
}

export async function loadSeasonMetrics(season) {
  const key = `seasonMetrics:${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  const manifest = await loadManifest();
  const path =
    resolvePath(manifest?.paths?.playerMetricsSeason, { season }) ||
    `data/player_metrics/season/${season}.json`;
  if (!path) return null;
  const payload = await fetchJson(path, { optional: true });
  if (!payload) return null;
  return setCached(key, payload);
}

export async function loadCareerMetrics() {
  const cached = getCached("careerMetrics");
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = manifest?.paths?.playerMetricsCareer || "data/player_metrics/career.json";
  const payload = await fetchJson(path, { optional: true });
  if (!payload) return null;
  return setCached("careerMetrics", payload);
}

export async function loadBoomBustMetrics() {
  const cached = getCached("boomBustMetrics");
  if (cached) return cached;
  const manifest = await loadManifest();
  const path = manifest?.paths?.playerMetricsBoomBust || "data/player_metrics/boom_bust.json";
  const payload = await fetchJson(path, { optional: true });
  if (!payload) return null;
  return setCached("boomBustMetrics", payload);
}
