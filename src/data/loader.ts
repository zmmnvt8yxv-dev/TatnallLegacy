import {
  SCHEMA_VERSION,
  type NflRoster,
  type NflSchedule,
  type NflTeams,
  type PowerRankings,
  type SeasonData,
  type Trade,
  type WeeklyRecaps,
} from "./schema";
const APP_ORIGIN =
  typeof window !== "undefined" && window.location
    ? window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : window.location.href
    : "http://localhost";
const APP_BASE = import.meta.env.BASE_URL || "/";

function assetUrl(path: string) {
  const base = APP_BASE.endsWith("/") ? APP_BASE : `${APP_BASE}/`;
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return new URL(`${base}${normalized}`, APP_ORIGIN).toString();
}

type RecordValue = Record<string, unknown>;

const REQUIRED_LIST_KEYS = ["teams", "matchups", "draft"];
const NON_EMPTY_LIST_KEYS = ["teams", "matchups", "draft"];
const LINEUPS_REQUIRED_FROM_YEAR = 2020;

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

function normalizeTradePlayer(value: unknown): Trade["parties"][number]["gained_players"][number] {
  const source = isRecord(value) ? value : {};
  return {
    id: toStringValue(source.id ?? source.player_id ?? source.playerId ?? "", ""),
    name: toStringValue(source.name ?? source.player_name ?? source.playerName ?? "", ""),
    pos: toStringValue(source.pos ?? source.position ?? null, null),
    nfl: toStringValue(source.nfl ?? source.team ?? source.nfl_team ?? source.nflTeam ?? null, null),
  };
}

function normalizeTradePick(value: unknown): Trade["parties"][number]["gained_picks"][number] {
  const source = isRecord(value) ? value : {};
  return {
    season: toInteger(source.season ?? source.year ?? null, null),
    round: toInteger(source.round ?? source.round_num ?? source.roundNum ?? null, null),
    original_team: toStringValue(
      source.original_team ?? source.originalTeam ?? source.team ?? source.team_name ?? null,
      null
    ),
  };
}

function normalizeTradeParty(value: unknown): Trade["parties"][number] {
  const source = isRecord(value) ? value : {};
  return {
    roster_id: toInteger(source.roster_id ?? source.rosterId ?? null, null),
    team: toStringValue(source.team ?? source.team_name ?? "", ""),
    gained_players: normalizeArray(source.gained_players ?? source.players_in, normalizeTradePlayer),
    sent_players: normalizeArray(source.sent_players ?? source.players_out, normalizeTradePlayer),
    gained_picks: normalizeArray(source.gained_picks ?? source.picks_in, normalizeTradePick),
    sent_picks: normalizeArray(source.sent_picks ?? source.picks_out, normalizeTradePick),
    net_points: toNumber(source.net_points ?? source.net_points_after ?? source.netPointsAfter, null),
    score: toNumber(source.score ?? source.score_0_to_100 ?? source.score0To100, null),
  };
}

function normalizeTrade(value: unknown): Trade {
  const source = isRecord(value) ? value : {};
  return {
    id: toStringValue(source.id ?? source.tx_id ?? "", ""),
    week: toInteger(source.week ?? source.week_id ?? source.weekId ?? null, null),
    status: toStringValue(source.status ?? source.state ?? null, null),
    created: toNumber(source.created ?? source.created_at ?? source.createdAt, null),
    executed: toNumber(source.executed ?? source.executed_at ?? source.executedAt, null),
    parties: normalizeArray(source.parties ?? source.per_roster ?? source.rosters, normalizeTradeParty),
  };
}

function buildTradeEvalLookup(tradeEvals: unknown[]): Map<string, { executed: number | null; perRoster: Map<number, { netPoints: number | null; score: number | null }> }> {
  const lookup = new Map<string, { executed: number | null; perRoster: Map<number, { netPoints: number | null; score: number | null }> }>();
  tradeEvals.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }
    const tradeId = toStringValue(entry.tx_id ?? entry.id ?? "", "");
    if (!tradeId) {
      return;
    }
    const perRoster = new Map<number, { netPoints: number | null; score: number | null }>();
    const rosterEntries = Array.isArray(entry.per_roster) ? entry.per_roster : [];
    rosterEntries.forEach((rosterEntry) => {
      if (!isRecord(rosterEntry)) {
        return;
      }
      const rosterId = toInteger(rosterEntry.roster_id ?? rosterEntry.rosterId ?? null, null);
      if (rosterId == null) {
        return;
      }
      perRoster.set(rosterId, {
        netPoints: toNumber(rosterEntry.net_points_after ?? rosterEntry.netPointsAfter, null),
        score: toNumber(rosterEntry.score_0_to_100 ?? rosterEntry.score0To100, null),
      });
    });
    lookup.set(tradeId, {
      executed: toNumber(entry.executed ?? entry.executed_at ?? entry.executedAt, null),
      perRoster,
    });
  });
  return lookup;
}

function normalizeTradesData(raw: unknown, tradeEvals: unknown[] = []): Trade[] {
  const source = isRecord(raw) ? raw : {};
  const trades = normalizeArray(source.trades ?? source.transactions ?? source.trade_map ?? source.tradeMap, normalizeTrade);
  const evalLookup = buildTradeEvalLookup(tradeEvals);
  return trades.map((trade) => {
    const evalEntry = evalLookup.get(trade.id);
    if (!evalEntry) {
      return trade;
    }
    return {
      ...trade,
      executed: trade.executed ?? evalEntry.executed,
      parties: trade.parties.map((party) => {
        const rosterId = party.roster_id ?? null;
        const evalRoster = rosterId != null ? evalEntry.perRoster.get(rosterId) : undefined;
        if (!evalRoster) {
          return party;
        }
        return {
          ...party,
          net_points: party.net_points ?? evalRoster.netPoints,
          score: party.score ?? evalRoster.score,
        };
      }),
    };
  });
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
  const baseSupplemental = isRecord(source.supplemental) ? source.supplemental : {};
  const supplemental = isRecord(source)
    ? {
        ...baseSupplemental,
        current_roster: baseSupplemental.current_roster ?? source.current_roster,
        player_index: baseSupplemental.player_index ?? source.player_index,
        draft_day_roster: baseSupplemental.draft_day_roster ?? source.draft_day_roster,
        users: baseSupplemental.users ?? source.users,
        trade_evals: baseSupplemental.trade_evals ?? source.trade_evals,
        acquisitions: baseSupplemental.acquisitions ?? source.acquisitions,
        raw_transactions: baseSupplemental.raw_transactions ?? source.raw_transactions,
        player_points: baseSupplemental.player_points ?? source.player_points,
        draft_id: baseSupplemental.draft_id ?? source.draft_id,
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
  const emptyKeys = NON_EMPTY_LIST_KEYS.filter((key) => {
    const value = normalized[key as keyof SeasonData];
    return Array.isArray(value) && value.length === 0;
  });
  if (normalized.year >= LINEUPS_REQUIRED_FROM_YEAR && normalized.lineups.length === 0) {
    emptyKeys.push("lineups");
  }
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
  datasets?: Array<{
    id: string;
    path: string;
    label?: string;
    description?: string;
    season?: number;
  }>;
};

type DataLoader = {
  loadManifest: () => Promise<ManifestData>;
  loadSeason: (year: number) => Promise<SeasonData>;
  loadPowerRankings: () => Promise<PowerRankings>;
  loadWeeklyRecaps: () => Promise<WeeklyRecaps>;
  loadNflRosters: () => Promise<NflRoster>;
  loadNflSchedule: () => Promise<NflSchedule>;
  loadNflTeams: () => Promise<NflTeams>;
  preloadSeasons: (years: number[]) => Promise<SeasonData[]>;
  loadTrades: (year: number, tradeEvals?: unknown[]) => Promise<Trade[]>;
  clearCache: () => void;
  getDiagnostics: () => LoaderDiagnostics;
};

const DEFAULT_MANIFEST_YEARS = [
  2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
];
const diagnostics: LoaderDiagnostics = {
  basePath: APP_BASE,
  manifestUrl: assetUrl("data/manifest.json"),
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
  const url = assetUrl(relPath);
  const cacheBust = version ? `?v=${encodeURIComponent(version)}` : "";
  const fetchUrl = `${url}${cacheBust}`;
  try {
    diagnostics.lastFetchUrl = fetchUrl;
    diagnostics.lastFetchStatus = undefined;
    const response = await fetch(fetchUrl, { cache: "force-cache" });
    if (!response.ok) {
      const message = `HTTP ${response.status} for ${fetchUrl}`;
      diagnostics.lastFetchUrl = fetchUrl;
      diagnostics.lastFetchStatus = response.status;
      diagnostics.lastFetchError = message;
      throw new Error(message);
    }
    diagnostics.lastFetchUrl = fetchUrl;
    diagnostics.lastFetchStatus = response.status;
    diagnostics.lastFetchError = undefined;
    return response.json() as Promise<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown error for ${fetchUrl}`;
    diagnostics.lastFetchUrl = fetchUrl;
    diagnostics.lastFetchError = message;
    throw new Error(message);
  }
}

export type LoaderDiagnostics = {
  basePath: string;
  manifestUrl: string;
  lastFetchError?: string;
  lastFetchUrl?: string;
  lastFetchStatus?: number;
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
      try {
        const trades = await loadTrades(year, normalized.supplemental?.trade_evals ?? []);
        if (trades.length > 0) {
          normalized.supplemental = {
            ...(normalized.supplemental ?? {}),
            trades,
          };
        }
      } catch (error) {
        if (import.meta.env?.DEV) {
          console.warn(
            `Trade data fetch failed for ${year}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
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

  const loadNflRosters = () =>
    memoize("nfl-rosters", async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      return fetchJson<NflRoster>("data/rosters-2025.json", version || undefined);
    });

  const loadNflSchedule = () =>
    memoize("nfl-schedule", async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      return fetchJson<NflSchedule>("data/schedules-2025.json", version || undefined);
    });

  const loadNflTeams = () =>
    memoize("nfl-teams", async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      return fetchJson<NflTeams>("data/teams.json", version || undefined);
    });

  const loadTrades = (year: number, tradeEvals: unknown[] = []) =>
    memoize(`trades:${year}`, async () => {
      if (year !== 2025) {
        return [];
      }
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      const raw = await fetchJson<unknown>("data/trades-2025.json", version || undefined);
      return normalizeTradesData(raw, tradeEvals);
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
    loadNflRosters,
    loadNflSchedule,
    loadNflTeams,
    preloadSeasons,
    loadTrades,
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
