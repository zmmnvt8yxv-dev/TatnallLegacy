import { createRequestCache, getOrSetCached } from "./cache";
import { extractNumericStats, getRecord, toStringValue } from "./utils";
import type { LiveStatsProviderId, PlayerTrendStats } from "./types";

const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 5;

const providerCache = createRequestCache<PlayerTrendStats | null>();

type ProviderConfig = {
  provider: LiveStatsProviderId;
  baseUrl: string;
  apiKey?: string;
  path: string;
};

function isLiveStatsEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_LIVE_STATS === "true";
}

function getProviderConfig(): ProviderConfig | null {
  if (!isLiveStatsEnabled()) {
    return null;
  }

  const provider = (import.meta.env.VITE_LIVE_STATS_PROVIDER ?? "tank01") as LiveStatsProviderId;
  const apiKey = import.meta.env.VITE_LIVE_STATS_API_KEY ?? undefined;

  if (provider === "sportsdataio") {
    return {
      provider,
      baseUrl: import.meta.env.VITE_LIVE_STATS_BASE_URL ?? "https://api.sportsdata.io/v3/nfl/stats/json",
      apiKey,
      path: import.meta.env.VITE_LIVE_STATS_PATH ?? "/PlayerSeasonStatsByPlayerID",
    };
  }

  if (provider === "custom") {
    const customBaseUrl = import.meta.env.VITE_LIVE_STATS_BASE_URL;
    if (!customBaseUrl) {
      return null;
    }
    return {
      provider,
      baseUrl: customBaseUrl,
      apiKey,
      path: import.meta.env.VITE_LIVE_STATS_PATH ?? "/player/trends",
    };
  }

  return {
    provider,
    baseUrl:
      import.meta.env.VITE_LIVE_STATS_BASE_URL ??
      "https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com",
    apiKey,
    path: import.meta.env.VITE_LIVE_STATS_PATH ?? "/getNFLPlayerTrendStats",
  };
}

function buildUrl(config: ProviderConfig, playerId: string, season: number) {
  const url = new URL(config.path, config.baseUrl);
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("season", String(season));
  return url.toString();
}

async function fetchLiveStats(
  config: ProviderConfig,
  playerId: string,
  season: number,
): Promise<PlayerTrendStats | null> {
  const url = buildUrl(config, playerId, season);
  const headers: Record<string, string> = {};

  if (config.apiKey) {
    if (config.provider === "tank01") {
      headers["X-RapidAPI-Key"] = config.apiKey;
    } else if (config.provider === "sportsdataio") {
      headers["Ocp-Apim-Subscription-Key"] = config.apiKey;
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Live stats request failed: ${response.status}`);
  }

  const payload = await response.json();
  const record = getRecord(payload);
  const statsSource = record.stats ?? record.trends ?? record.data ?? record;

  return {
    playerId,
    season,
    provider: config.provider,
    stats: extractNumericStats(statsSource),
    updatedAt: toStringValue(record.updated_at ?? record.updatedAt ?? record.last_updated, "") || null,
    source: toStringValue(record.source ?? record.provider ?? "", "") || null,
  } satisfies PlayerTrendStats;
}

export async function fetchLivePlayerTrendStats(
  playerId: string,
  season: number,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<PlayerTrendStats | null> {
  const config = getProviderConfig();
  if (!config) {
    return null;
  }

  const key = `${config.provider}:${playerId}:${season}`;
  return getOrSetCached(providerCache, key, async () => fetchLiveStats(config, playerId, season), ttlMs);
}

export function liveStatsEnabled(): boolean {
  return isLiveStatsEnabled();
}
