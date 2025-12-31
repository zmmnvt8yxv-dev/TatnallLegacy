import { SCHEMA_VERSION, type PowerRankings, type SeasonData, type WeeklyRecaps } from "./schema";
const APP_ORIGIN = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";
const APP_BASE = import.meta.env.BASE_URL || "/";

function assetUrl(path: string) {
  const base = APP_BASE.endsWith("/") ? APP_BASE : `${APP_BASE}/`;
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return new URL(`${base}${normalized}`, APP_ORIGIN).toString();
}

type RecordValue = Record<string, unknown>;

const REQUIRED_LIST_KEYS = ["teams", "matchups", "transactions", "draft", "awards"];

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number | null = null): number | null {
  const num = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(num) ? num : fallback;
}

function toInteger(value: unknown, fallback: number | null = null): number | null {
  const num = toNumber(value, null);
  return num === null ? fallback : Math.trunc(num);
}

function toStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeArray<T>(value: unknown, mapper: (item: unknown, key?: string) => T): T[] {
  if (Array.isArray(value)) {
    return value.map((item) => mapper(item));
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, item]) => mapper(item, key));
  }
  return [];
}

function normalizeTeam(value: unknown, key?: string): SeasonData["teams"][number] {
  const source = isRecord(value) ? value : {};
  const records = isRecord(source.records) ? source.records : {};
  const owners = Array.isArray(source.owners)
    ? source.owners
        .map((owner) => {
          if (typeof owner === "string") return owner;
          if (isRecord(owner)) {
            const name = toStringValue(owner.displayName ?? owner.name ?? null, "").trim();
            if (name) return name;
            const firstName = toStringValue(owner.firstName ?? null, "").trim();
            const lastName = toStringValue(owner.lastName ?? null, "").trim();
            return [firstName, lastName].filter(Boolean).join(" ").trim();
          }
          return "";
        })
        .filter(Boolean)
    : [];
  const teamName =
    toStringValue(source.team_name || source.name || source.team, "") || (key ? `Team ${key}` : "");
  const ownerFallback = owners.length ? owners.join(", ") : null;
  return {
    team_id: toInteger(source.team_id ?? source.teamId ?? key, null),
    team_name: teamName,
    owner: toStringValue(
      source.owner ?? source.manager ?? records.owner ?? ownerFallback ?? null,
      null
    ),
    record: toStringValue(source.record ?? records.record ?? null, null),
    points_for: toNumber(source.points_for ?? records.points_for ?? records.pointsFor, null),
    points_against: toNumber(source.points_against ?? records.points_against ?? records.pointsAgainst, null),
    regular_season_rank: toInteger(
      source.regular_season_rank ?? records.regular_season_rank ?? records.regularSeasonRank,
      null
    ),
    final_rank: toInteger(source.final_rank ?? records.final_rank ?? records.finalRank, null),
  };
}

function normalizeMatchup(value: unknown): SeasonData["matchups"][number] {
  const source = isRecord(value) ? value : {};
  return {
    week: toInteger(source.week ?? source.week_id ?? source.weekId ?? source.weekNumber, null),
    home_team: toStringValue(source.home_team ?? source.homeTeam ?? null, null),
    home_score: toNumber(source.home_score ?? source.homeScore, null),
    away_team: toStringValue(source.away_team ?? source.awayTeam ?? null, null),
    away_score: toNumber(source.away_score ?? source.awayScore, null),
    is_playoff:
      typeof source.is_playoff === "boolean"
        ? source.is_playoff
        : typeof source.isPlayoff === "boolean"
          ? source.isPlayoff
          : null,
  };
}

function normalizeTransactionEntry(value: unknown): SeasonData["transactions"][number]["entries"][number] {
  const source = isRecord(value) ? value : {};
  return {
    type: toStringValue(source.type, ""),
    team: toStringValue(source.team ?? source.team_name ?? null, null),
    player: toStringValue(source.player ?? source.player_name ?? null, null),
    faab: toNumber(source.faab ?? source.fab, null),
  };
}

function normalizeTransaction(value: unknown): SeasonData["transactions"][number] {
  const source = isRecord(value) ? value : {};
  return {
    date: toStringValue(source.date, ""),
    entries: normalizeArray(source.entries, normalizeTransactionEntry),
  };
}

function normalizeDraftPick(value: unknown): SeasonData["draft"][number] {
  const source = isRecord(value) ? value : {};
  return {
    round: toInteger(source.round ?? source.round_num ?? source.roundNum, null),
    overall: toInteger(source.overall ?? source.pick ?? source.pickOverall, null),
    team: toStringValue(source.team ?? source.team_name ?? null, null),
    player: toStringValue(source.player ?? source.player_name ?? null, null),
    player_nfl: toStringValue(source.player_nfl ?? source.nfl_team ?? source.playerTeam ?? null, null),
    keeper: typeof source.keeper === "boolean" ? source.keeper : null,
  };
}

function normalizeAward(value: unknown): SeasonData["awards"][number] {
  const source = isRecord(value) ? value : {};
  return {
    id: toStringValue(source.id, ""),
    title: toStringValue(source.title, ""),
    description: toStringValue(source.description ?? null, null),
    team: toStringValue(source.team ?? source.team_name ?? null, null),
    owner: toStringValue(source.owner ?? null, null),
    value: toNumber(source.value ?? source.amount, null),
  };
}

function normalizeLineup(value: unknown): SeasonData["lineups"][number] {
  const source = isRecord(value) ? value : {};
  return {
    week: toInteger(source.week ?? source.week_id ?? source.weekId, null),
    team: toStringValue(source.team ?? source.team_name ?? null, null),
    player_id: toStringValue(source.player_id ?? source.playerId ?? null, null),
    player: toStringValue(source.player ?? source.player_name ?? null, null),
    started: typeof source.started === "boolean" ? source.started : null,
    points: toNumber(source.points ?? source.score, null),
  };
}

function normalizeMatchups(value: unknown): SeasonData["matchups"] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMatchup(item));
  }
  if (isRecord(value)) {
    const flattened: unknown[] = [];
    for (const entry of Object.values(value)) {
      if (Array.isArray(entry)) {
        flattened.push(...entry);
      } else if (entry !== null && entry !== undefined) {
        flattened.push(entry);
      }
    }
    return flattened.map((item) => normalizeMatchup(item));
  }
  return [];
}

function normalizeSeasonData(raw: unknown): SeasonData {
  const source = isRecord(raw) ? raw : {};
  const lineups = normalizeArray(source.lineups ?? source.lineup_map ?? source.lineupMap, normalizeLineup);
  const supplemental = isRecord(source.supplemental)
    ? source.supplemental
    : isRecord(source)
      ? {
          current_roster: source.current_roster,
          player_index: source.player_index,
          draft_day_roster: source.draft_day_roster,
          users: source.users,
          trade_evals: source.trade_evals,
          acquisitions: source.acquisitions,
        }
      : undefined;
  return {
    schemaVersion:
      typeof source.schemaVersion === "string"
        ? source.schemaVersion
        : typeof source.schema_version === "string"
          ? source.schema_version
          : SCHEMA_VERSION,
    year: toInteger(source.year ?? source.season, 0) ?? 0,
    league_id: toStringValue(source.league_id ?? source.leagueId ?? null, null),
    generated_at: toStringValue(source.generated_at ?? source.generatedAt ?? null, null),
    teams: normalizeArray(source.teams ?? source.team_map ?? source.teamMap, normalizeTeam),
    matchups: normalizeMatchups(source.matchups ?? source.matchups_map ?? source.matchupsMap),
    transactions: normalizeArray(
      source.transactions ?? source.transaction_map ?? source.transactionMap,
      normalizeTransaction
    ),
    draft: normalizeArray(source.draft ?? source.draft_map ?? source.draftMap, normalizeDraftPick),
    awards: normalizeArray(source.awards ?? source.award_map ?? source.awardMap, normalizeAward),
    lineups,
    supplemental:
      supplemental && Object.values(supplemental).some((value) => value !== undefined) ? supplemental : undefined,
  };
}

function validateSeasonData(raw: unknown, normalized: SeasonData): void {
  const source = isRecord(raw) ? raw : {};
  const missingKeys = REQUIRED_LIST_KEYS.filter((key) => !(key in source));
  const emptyKeys = REQUIRED_LIST_KEYS.filter((key) => {
    const value = normalized[key as keyof SeasonData];
    return Array.isArray(value) && value.length === 0;
  });
  if (missingKeys.length || emptyKeys.length) {
    console.warn(
      "Season data missing or empty keys",
      { year: normalized.year, missingKeys, emptyKeys }
    );
  }
}

export type ManifestData = {
  years: number[];
  schemaVersion?: string;
  generatedAt?: string;
};

type DataLoader = {
  loadManifest: () => Promise<ManifestData>;
  loadSeason: (year: number) => Promise<SeasonData>;
  loadPowerRankings: () => Promise<PowerRankings>;
  loadWeeklyRecaps: () => Promise<WeeklyRecaps>;
  preloadSeasons: (years: number[]) => Promise<SeasonData[]>;
  clearCache: () => void;
  getDiagnostics: () => LoaderDiagnostics;
};

const ROOT = new URL(".", APP_ORIGIN + APP_BASE).pathname.replace(/\/+$/, "") + "/";
const DEFAULT_MANIFEST_YEARS = [
  2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
];
const diagnostics: LoaderDiagnostics = {
  basePath: ROOT,
  manifestUrl: `${ROOT}data/manifest.json`,
  lastFetchError: undefined,
};
const memo = new Map<string, Promise<unknown>>();

function memoize<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!memo.has(key)) {
    memo.set(key, loader());
  }
  return memo.get(key) as Promise<T>;
}

async function fetchJson<T>(relPath: string, version?: string): Promise<T> {
  const url = ROOT + relPath.replace(/^\/+/, "");
  const cacheBust = version ? `?v=${encodeURIComponent(version)}` : "";
  try {
    const response = await fetch(`${url}${cacheBust}`, { cache: "force-cache" });
    if (!response.ok) {
      const message = `HTTP ${response.status} for ${url}`;
      diagnostics.lastFetchError = message;
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown error for ${url}`;
    diagnostics.lastFetchError = message;
    throw new Error(message);
  }
}

export type LoaderDiagnostics = {
  basePath: string;
  manifestUrl: string;
  lastFetchError?: string;
  manifestError?: string;
};

function createDataLoader(): DataLoader {
  const loadManifest = () =>
    memoize("manifest", async () => {
      try {
        const manifest = await fetchJson<ManifestData>("data/manifest.json");
        diagnostics.manifestError = undefined;
        return manifest;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown manifest error";
        diagnostics.manifestError = message;
        const manifestMessage = `Manifest fetch failed (${diagnostics.manifestUrl}): ${message}`;
        if (import.meta.env?.DEV) {
          console.warn(manifestMessage);
          return {
            years: DEFAULT_MANIFEST_YEARS,
            schemaVersion: "fallback",
            generatedAt: new Date().toISOString(),
          };
        }
        throw new Error(manifestMessage);
      }
    });

  const loadSeason = (year: number) =>
    memoize(`season:${year}`, async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      const raw = await fetchJson<SeasonData>(`data/${year}.json`, version || undefined);
      const normalized = normalizeSeasonData(raw);
      validateSeasonData(raw, normalized);
      return normalized;
    });

  const loadPowerRankings = () =>
    memoize("power-rankings", async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      return fetchJson<PowerRankings>("data/power-rankings.json", version || undefined);
    });

  const loadWeeklyRecaps = () =>
    memoize("weekly-recaps", async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      return fetchJson<WeeklyRecaps>("data/weekly-recaps.json", version || undefined);
    });

  const preloadSeasons = async (years: number[]) => {
    const unique = Array.from(new Set(years));
    return Promise.all(unique.map((year) => loadSeason(year)));
  };

  const clearCache = () => {
    memo.clear();
  };

  const getDiagnostics = () => ({ ...diagnostics });

  return {
    loadManifest,
    loadSeason,
    loadPowerRankings,
    loadWeeklyRecaps,
    preloadSeasons,
    clearCache,
    getDiagnostics,
  };
}

export const dataLoader = createDataLoader();

declare global {
  interface Window {
    TatnallDataLoader?: DataLoader;
  }
}

if (typeof window !== "undefined") {
  window.TatnallDataLoader = dataLoader;
}
