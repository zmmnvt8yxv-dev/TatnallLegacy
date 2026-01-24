import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext";
import { usePlayerDetails } from "../hooks/usePlayerDetails";
import PageTransition from "../components/PageTransition.jsx";
import { getCanonicalPlayerId, resolvePlayerDisplay, resolvePlayerName } from "../lib/playerName";
import { normalizeName } from "../lib/nameUtils";
import { normalizeOwnerName } from "../lib/identity";
import { formatPoints, safeNumber } from "../utils/format";
import { useVirtualRows } from "../utils/useVirtualRows";
import { useFavorites } from "../utils/useFavorites";
import { loadPlayerStatsWeekly } from "../data/loader";
import { readStorage, writeStorage } from "../utils/persistence";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Heart, TrendingUp, TrendingDown, Activity, Target, Zap, Award, Calendar, Users, DollarSign, BarChart3, Trophy, Star, ChevronRight, ChevronDown } from "lucide-react";
import type { PlayerIndex, EspnNameMap } from "../types/index";

const PLAYER_PREF_KEY = "tatnall-pref-player";

interface PositionThresholds {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DEF: number;
  default: number;
}

const THRESHOLDS: PositionThresholds = {
  QB: 20,
  RB: 15,
  WR: 15,
  TE: 12,
  K: 10,
  DEF: 10,
  default: 15,
};

interface PlayerInfo {
  player_id?: string;
  sleeper_id?: string;
  espn_id?: string;
  gsis_id?: string;
  full_name?: string;
  display_name?: string;
  name?: string;
  position?: string;
  nfl_team?: string;
  age?: number;
  height?: string;
  weight?: number;
  college?: string;
  years_exp?: number;
  draft_year?: number;
}

interface TransactionPlayer {
  id?: string;
  source_player_id?: string;
  name?: string;
  action?: string;
}

interface TransactionEntry {
  id?: string;
  type?: string;
  amount?: number | string;
  week?: number;
  season?: number;
  created?: number;
  team?: string;
  players?: TransactionPlayer[];
  summary?: string;
}

interface SeasonSummary {
  season: number;
  rows?: StatsRow[];
  playerSeasonTotals?: StatsRow[];
}

interface StatsRow {
  sleeper_id?: string;
  player_id?: string;
  gsis_id?: string;
  espn_id?: string;
  display_name?: string;
  player_display_name?: string;
  player_name?: string;
  position?: string;
  team?: string;
  season?: number;
  week?: number;
  points?: number;
  fantasy_points_custom?: number;
  fantasy_points_custom_week?: number;
  fantasy_points_custom_week_with_bonus?: number;
  fantasy_points_ppr?: number;
  fantasy_points?: number;
  games?: number;
  games_played?: number;
  games_possible?: number;
  availability_flag?: string;
  availability_ratio?: number;
  war_rep?: number;
  war_rep_season?: number;
  delta_to_next?: number;
  delta_to_next_season?: number;
  seasons?: number;
  seasons_played?: number;
  pos_week_z?: number;
  pos_week_rank?: number;
  replacement_baseline?: number;
  started?: boolean;
  opponent_team?: string;
  attempts?: number;
  completions?: number;
  passing_yards?: number;
  passing_tds?: number;
  passing_interceptions?: number;
  passing_rating?: number;
  passing_qbr?: number;
  carries?: number;
  rushing_yards?: number;
  rushing_tds?: number;
  fumbles_lost?: number;
  rushing_fumbles_lost?: number;
  receiving_fumbles_lost?: number;
  sack_fumbles_lost?: number;
  receptions?: number;
  targets?: number;
  receiving_yards?: number;
  receiving_tds?: number;
  extra_points_attempted?: number;
  extra_points_made?: number;
  field_goals_attempted?: number;
  field_goals_made?: number;
  field_goals_made_40_49?: number;
  field_goals_made_50_plus?: number;
}

interface WeekLineup {
  week: number;
  lineups?: StatsRow[];
}

interface BoomBustMetricsRow {
  sleeper_id?: string;
  player_id?: string;
  gsis_id?: string;
  espn_id?: string;
  consistency_label?: string;
  fp_std?: number;
  boom_pct?: number;
}

interface MegaProfile {
  nfl?: {
    bio?: {
      display_name?: string;
      position?: string;
      latest_team?: string;
      height?: number;
      weight?: number;
      college_name?: string;
      years_of_experience?: number;
      draft_year?: number;
      draft_round?: number;
      draft_pick?: number;
      status?: string;
      gsis_id?: string;
      headshot?: string;
    };
    sportradar?: {
      id?: string;
      _team_alias?: string;
      status?: string;
    };
  };
  fantasy?: {
    name?: string;
    age?: number;
    height?: string;
    weight?: number;
    college?: string;
  };
}

interface NflSiloMeta {
  odds?: Record<string, {
    game?: {
      home?: { alias?: string };
      away?: { alias?: string };
    };
    consensus?: {
      moneyline?: { away_plus_minus?: string; home_plus_minus?: string };
      spread?: { away_spread_plus_minus?: string; home_spread_plus_minus?: string };
      total?: { over_under?: string };
    };
  }>;
}

interface SeasonStatsRow {
  season: number;
  position: string;
  positionRank: number | null;
  points?: number;
  games?: number;
  gamesPossible?: number;
  availabilityFlag?: string;
  availabilityRatio?: number;
  war?: number;
  delta?: number;
}

interface WeeklyDisplayRow {
  season: number;
  week: number;
  nflTeam: string;
  fantasyTeam: string;
  started?: boolean;
  points?: number;
  pos_week_z?: number;
  war_rep?: number;
  delta_to_next?: number;
  position?: string;
  pos_week_rank?: number;
}

interface BoomBust {
  stdDev: number;
  threshold: number;
  percentAbove: number;
  topWeeks: StatsRow[];
  bottomWeeks: StatsRow[];
}

interface FullStatsColumn {
  key: string;
  label: string;
  calc?: string;
}

interface Manifest {
  seasons?: number[];
}

interface PlayerIdLookup {
  byUid: Map<string, PlayerInfo>;
  bySleeper: Map<string, string>;
  byEspn: Map<string, string>;
}

const isNumericId = (value: unknown): boolean => /^\d+$/.test(String(value || "").trim());

export default function PlayerPage(): React.ReactElement {
  const { playerId } = useParams<{ playerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef<boolean>(false);
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext() as {
    manifest: Manifest;
    loading: boolean;
    error: string | null;
    playerIdLookup: PlayerIdLookup;
    playerIndex: PlayerIndex;
    espnNameMap: EspnNameMap;
  };
  const isDev = import.meta.env.DEV;
  const [selectedSeason, setSelectedSeason] = useState<number | string>("");
  const [weeklyRows, setWeeklyRows] = useState<StatsRow[]>([]);
  const [careerWeeklyRows, setCareerWeeklyRows] = useState<StatsRow[]>([]);
  const [search, setSearch] = useState<string>("");
  const [fantasyExpanded, setFantasyExpanded] = useState<boolean>(true);
  const [nflExpanded, setNflExpanded] = useState<boolean>(true);
  const { favorites, togglePlayer } = useFavorites();

  const canonicalPlayerId = useMemo(
    () => getCanonicalPlayerId(playerId, { row: { espn_id: playerId, player_id: playerId }, playerIndex }),
    [playerId, playerIndex],
  );
  const resolvedPlayerId = canonicalPlayerId || String(playerId);
  const isFavorite = favorites.players.includes(String(resolvedPlayerId));

  const formatAmount = (entry: TransactionEntry): string => {
    if (Number(selectedSeason) !== 2025) return "—";
    if (entry?.type !== "add" && entry?.type !== "trade") return "—";
    const numeric = Number(entry?.amount);
    if (!Number.isFinite(numeric)) return "—";
    return `$${numeric}`;
  };

  const formatDollarValue = (value: unknown): string => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    return `$${numeric}`;
  };

  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const paramName = searchParams.get("name") || "";

  const updateSearchParams = (nextSeason: number): void => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    setSearchParams(params, { replace: true });
    writeStorage(PLAYER_PREF_KEY, { season: nextSeason });
  };

  const handleSeasonChange = (value: string): void => {
    const nextSeason = Number(value);
    setSelectedSeason(nextSeason);
    updateSearchParams(nextSeason);
  };

  const playerInfo = useMemo((): PlayerInfo | null => {
    const candidates = [resolvedPlayerId, playerId].filter(Boolean);
    for (const id of candidates) {
      if (playerIdLookup.byUid.has(String(id))) {
        return playerIdLookup.byUid.get(String(id)) || null;
      }
      const uid =
        playerIdLookup.bySleeper.get(String(id)) ||
        playerIdLookup.byEspn.get(String(id));
      if (uid) return playerIdLookup.byUid.get(uid) || null;
    }
    return null;
  }, [playerIdLookup, resolvedPlayerId, playerId]);

  const targetIds = useMemo((): Set<string> => {
    const ids = new Set<string>();
    for (const value of [
      resolvedPlayerId,
      playerId,
      playerInfo?.sleeper_id,
      playerInfo?.player_id,
      playerInfo?.gsis_id,
      playerInfo?.espn_id,
    ]) {
      if (value) ids.add(String(value));
    }
    return ids;
  }, [resolvedPlayerId, playerId, playerInfo]);

  const {
    careerStats,
    boomBustMetrics,
    careerMetrics,
    seasonSummaries,
    statsSeasonSummaries,
    seasonMetrics,
    statsWeeklyRows,
    playerTransactions,
    fullStatsRows,
    weekLineups,
    megaProfile,
    nflSiloMeta,
    isLoading: dataLoading,
    isError: dataError
  } = usePlayerDetails({
    selectedSeason: Number(selectedSeason),
    seasons,
    playerId: resolvedPlayerId
  }) as {
    careerStats: StatsRow[];
    boomBustMetrics: BoomBustMetricsRow[];
    careerMetrics: StatsRow[];
    seasonSummaries: SeasonSummary[];
    statsSeasonSummaries: SeasonSummary[];
    seasonMetrics: StatsRow[];
    statsWeeklyRows: StatsRow[];
    playerTransactions: TransactionEntry[];
    fullStatsRows: StatsRow[];
    weekLineups: WeekLineup[];
    megaProfile: MegaProfile | null;
    nflSiloMeta: NflSiloMeta | null;
    isLoading: boolean;
    isError: boolean;
  };

  useEffect(() => {
    if (!weekLineups.length || !targetIds.size) return;
    const rows: StatsRow[] = [];
    for (const payload of weekLineups) {
      if (!payload?.lineups) continue;
      for (const row of payload.lineups) {
        const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) {
          rows.push({ ...row, season: Number(selectedSeason), week: payload.week });
        }
      }
    }
    setWeeklyRows(prev => {
      const sorted = rows.sort((a, b) => (a.week || 0) - (b.week || 0));
      return JSON.stringify(prev) === JSON.stringify(sorted) ? prev : sorted;
    });
  }, [weekLineups, targetIds, selectedSeason]);

  const targetNames = useMemo((): string[] => {
    const espnName = espnNameMap?.[String(resolvedPlayerId)];
    return [playerInfo?.full_name, playerInfo?.display_name, playerInfo?.name, paramName, espnName]
      .map(normalizeName)
      .filter((name): name is string => Boolean(name));
  }, [playerInfo, paramName, espnNameMap, resolvedPlayerId]);

  const transactionHistory = useMemo((): TransactionEntry[] => {
    if (!playerTransactions.length) return [];
    const rows: TransactionEntry[] = [];
    for (const entry of playerTransactions) {
      const players = entry?.players || [];
      if (!players.length) continue;
      const matched = players.some((player) => {
        const id = player?.id ? String(player.id) : "";
        if (id && targetIds.has(id)) return true;
        if (player?.source_player_id && targetIds.has(String(player.source_player_id))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(player?.name);
        return name ? targetNames.includes(name) : false;
      });
      if (matched) rows.push(entry);
    }
    return rows.sort((a, b) => {
      const weekA = Number(a.week) || 0;
      const weekB = Number(b.week) || 0;
      if (weekA !== weekB) return weekB - weekA;
      const createdA = Number(a.created) || 0;
      const createdB = Number(b.created) || 0;
      if (createdA !== createdB) return createdB - createdA;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }, [playerTransactions, targetIds, targetNames]);

  const keeperInfo = useMemo((): { base: number | null; value: number; note: string } => {
    if (Number(selectedSeason) !== 2025) {
      return { base: null, value: 5, note: "Keeper value is tracked for 2025 adds only" };
    }
    const addsWithAmount = transactionHistory.filter(
      (entry) => entry?.type === "add" && Number.isFinite(Number(entry?.amount)),
    );
    if (!addsWithAmount.length) {
      return { base: null, value: 5, note: "No add value on record; using $5" };
    }
    const latest = addsWithAmount[0];
    const base = Number(latest.amount);
    return { base, value: base + 5, note: `Last add ${formatDollarValue(base)} + $5` };
  }, [transactionHistory, selectedSeason]);

  const formatTransactionDetails = (entry: TransactionEntry): string => {
    if (!entry?.players?.length) return entry?.summary || "No details";
    const names = (list: TransactionPlayer[]): string =>
      list
        .map((player) => player?.name || player?.id || "Unknown")
        .filter(Boolean)
        .join(", ");
    if (entry.type === "trade") {
      const received = names(entry.players.filter((player) => player?.action === "received"));
      const sent = names(entry.players.filter((player) => player?.action === "sent"));
      return `Received: ${received || "None"} | Sent: ${sent || "None"}`;
    }
    const label = entry.type === "add" ? "Added" : entry.type === "drop" ? "Dropped" : "Updated";
    return `${label}: ${names(entry.players) || "Unknown"}`;
  };

  const statsNameRow = useMemo((): StatsRow | null => {
    const tryFind = (rows: StatsRow[]): StatsRow | null =>
      rows.find((row) => {
        const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) => String(value || ""));
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(row?.display_name || row?.player_display_name || row?.player_name);
        return name ? targetNames.includes(name) : false;
      }) || null;
    if (statsWeeklyRows.length) return tryFind(statsWeeklyRows);
    if (fullStatsRows.length) return tryFind(fullStatsRows);
    for (const summary of statsSeasonSummaries) {
      const rows = summary?.rows || [];
      const match = tryFind(rows);
      if (match) return match;
    }
    return null;
  }, [targetIds, targetNames, statsWeeklyRows, fullStatsRows, statsSeasonSummaries]);

  const playerInfoWithStats = useMemo((): PlayerInfo => {
    if (!statsNameRow) {
      if (playerInfo) return playerInfo;
      const fallback: PlayerInfo = { player_id: resolvedPlayerId };
      if (isNumericId(resolvedPlayerId)) fallback.espn_id = resolvedPlayerId;
      return fallback;
    }
    return {
      player_id: resolvedPlayerId,
      sleeper_id: statsNameRow.sleeper_id || playerInfo?.sleeper_id || resolvedPlayerId,
      display_name: statsNameRow.display_name || statsNameRow.player_display_name || playerInfo?.full_name,
      position: playerInfo?.position || statsNameRow.position,
      nfl_team: playerInfo?.nfl_team || statsNameRow.team,
      ...playerInfo,
    };
  }, [statsNameRow, playerInfo, resolvedPlayerId]);

  const resolvedName = useMemo((): string => {
    return resolvePlayerName(playerInfoWithStats, playerIndex, espnNameMap);
  }, [playerInfoWithStats, playerIndex, espnNameMap]);

  const playerDisplay = useMemo(() => {
    return resolvePlayerDisplay(resolvedPlayerId, { row: playerInfoWithStats, playerIndex, espnNameMap });
  }, [resolvedPlayerId, playerInfoWithStats, playerIndex, espnNameMap]);

  const displayName = playerDisplay.name || resolvedName;
  const displayPosition = playerDisplay.position || playerInfo?.position || "Position —";
  const displayTeam = playerDisplay.team || playerInfo?.nfl_team || "Team —";

  const matchesPlayer = (row: StatsRow): boolean => {
    const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) => String(value || ""));
    if (ids.some((value) => targetIds.has(value))) return true;
    if (!targetNames.length) return false;
    const name = normalizeName(row?.display_name || row?.player_display_name || row?.player_name);
    return name ? targetNames.includes(name) : false;
  };

  const seasonStats = useMemo((): SeasonStatsRow[] => {
    const stats: SeasonStatsRow[] = [];
    const hasStats = statsSeasonSummaries.length > 0;
    const summaries = hasStats ? statsSeasonSummaries : seasonSummaries;
    for (const summary of summaries) {
      const rows = summary?.rows || summary?.playerSeasonTotals || [];
      const row = rows.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id, item?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(item?.display_name || item?.player_display_name || item?.player_name);
        return name ? targetNames.includes(name) : false;
      });
      if (row) {
        const position = row.position || playerInfo?.position || "—";
        const positionRows = rows.filter((item) => {
          const pos = item?.position || "";
          return String(pos).toUpperCase() === String(position).toUpperCase();
        });
        const ranked = positionRows
          .map((item) => ({
            ids: [item?.sleeper_id, item?.player_id, item?.gsis_id, item?.espn_id].map((value) =>
              String(value || ""),
            ),
            points: safeNumber(item?.points ?? item?.fantasy_points_custom ?? item?.fantasy_points_custom_week),
          }))
          .sort((a, b) => b.points - a.points);
        const rankIndex = ranked.findIndex((item) => item.ids.some((value) => targetIds.has(value)));
        const positionRank = rankIndex >= 0 ? rankIndex + 1 : null;
        stats.push({
          season: summary.season,
          position,
          positionRank,
          points: row.points ?? row.fantasy_points_custom ?? row.fantasy_points_custom_week,
          games: row.games ?? row.games_played,
          gamesPossible: row.games_possible,
          availabilityFlag: row.availability_flag,
          availabilityRatio: row.availability_ratio,
          war: row.war_rep ?? row.war_rep_season,
          delta: row.delta_to_next ?? row.delta_to_next_season,
        });
      }
    }
    return stats.sort((a, b) => b.season - a.season);
  }, [statsSeasonSummaries, seasonSummaries, targetIds, targetNames, playerInfo]);

  const careerTotals = useMemo((): { points: number; games: number; seasons: number; war: number; delta: number } => {
    if (careerStats.length) {
      const row = careerStats.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id, item?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(item?.display_name || item?.player_display_name || item?.player_name);
        return name ? targetNames.includes(name) : false;
      });
      if (row) {
        return {
          points: safeNumber(row.points ?? row.fantasy_points_custom),
          games: safeNumber(row.games ?? row.games_played),
          seasons: safeNumber(row.seasons ?? row.seasons_played),
          war: safeNumber(row.war_rep),
          delta: safeNumber(row.delta_to_next),
        };
      }
    }
    return seasonStats.reduce(
      (acc, row) => {
        acc.points += safeNumber(row.points);
        acc.games += safeNumber(row.games);
        acc.seasons += 1;
        acc.war += safeNumber(row.war);
        acc.delta += safeNumber(row.delta);
        return acc;
      },
      { points: 0, games: 0, seasons: 0, war: 0, delta: 0 },
    );
  }, [seasonStats, careerStats, targetIds, targetNames]);

  const availableSeasons = useMemo((): number[] => {
    const seen = new Set<number>();
    for (const summary of statsSeasonSummaries) {
      const rows = summary?.rows || [];
      if (!rows.length) continue;
      if (!rows.some(matchesPlayer)) continue;
      const seasonValue = Number(summary?.season);
      if (Number.isFinite(seasonValue)) seen.add(seasonValue);
    }
    if (!seen.size && statsWeeklyRows.length) {
      for (const row of statsWeeklyRows) {
        if (!matchesPlayer(row)) continue;
        const seasonValue = Number(row?.season);
        if (Number.isFinite(seasonValue)) seen.add(seasonValue);
      }
    }
    if (!seen.size) return seasons;
    return Array.from(seen).sort((a, b) => b - a);
  }, [statsSeasonSummaries, statsWeeklyRows, seasons, targetIds, targetNames]);

  const seasonOptions = useMemo(
    () => (availableSeasons.length ? availableSeasons : seasons),
    [availableSeasons, seasons],
  );

  useEffect(() => {
    if (!isDev) return;
    if (!availableSeasons.length && seasons.length) {
      console.warn("PLAYER_PROFILE_WARNING: no available seasons for player", {
        playerId: resolvedPlayerId,
        name: displayName,
      });
    }
  }, [isDev, availableSeasons, seasons, resolvedPlayerId, displayName]);

  useEffect(() => {
    if (!isDev || !selectedSeason) return;
    if (!statsWeeklyRows.length && !weeklyRows.length && !fullStatsRows.length) {
      console.warn("PLAYER_PROFILE_WARNING: no stats rows for season", {
        playerId: resolvedPlayerId,
        season: selectedSeason,
        name: displayName,
      });
    }
  }, [isDev, selectedSeason, statsWeeklyRows, weeklyRows, fullStatsRows, resolvedPlayerId, displayName]);

  useEffect(() => {
    const paramSeason = Number(searchParams.get("season"));
    if (Number.isFinite(paramSeason) && seasons.includes(paramSeason)) {
      if (paramSeason !== Number(selectedSeason)) {
        setSelectedSeason(paramSeason);
      }
    } else if (seasons.length && !selectedSeason) {
      setSelectedSeason(seasons[0]);
    }
  }, [searchParamsString, seasons, selectedSeason]);

  useEffect(() => {
    if (!seasons.length) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    let changed = false;
    const paramSeason = Number(params.get("season"));
    if (!Number.isFinite(paramSeason) || !seasons.includes(paramSeason)) {
      const stored = readStorage<{ season?: number }>(PLAYER_PREF_KEY, {});
      const storedSeason = Number(stored.season);
      const defaultSeason = (Number.isFinite(storedSeason) && seasons.includes(storedSeason))
        ? storedSeason
        : seasons[0];
      if (defaultSeason) {
        params.set("season", String(defaultSeason));
        changed = true;
      }
    }
    if (changed) {
      setSearchParams(params, { replace: true });
    }
    didInitRef.current = true;
  }, [seasons, searchParamsString, setSearchParams]);

  const findMetricsRow = (rows: StatsRow[] | undefined): StatsRow | null => {
    if (!rows?.length) return null;
    return (
      rows.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id, item?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(item?.display_name || item?.player_display_name || item?.player_name);
        return name ? targetNames.includes(name) : false;
      }) || null
    );
  };

  const seasonEfficiency = useMemo(
    () => findMetricsRow(seasonMetrics),
    [seasonMetrics, targetIds, targetNames],
  );
  const careerEfficiency = useMemo(
    () => findMetricsRow(careerMetrics),
    [careerMetrics, targetIds, targetNames],
  );

  const normalizedMetrics = useMemo((): StatsRow[] => {
    if (!statsWeeklyRows.length) return [];
    const hasWar = statsWeeklyRows.some((row) => row.war_rep != null);
    const hasDelta = statsWeeklyRows.some((row) => row.delta_to_next != null);
    const cutoffs: Record<string, number> = { QB: 16, RB: 24, WR: 24, TE: 16, K: 8, DEF: 8 };
    const grouped = new Map<string, StatsRow[]>();
    const rows = statsWeeklyRows.map((row) => ({
      ...row,
      points: safeNumber(row.points ?? row.fantasy_points_custom_week ?? row.fantasy_points_custom),
      position: String(row.position || "").toUpperCase(),
    }));
    for (const row of rows) {
      const key = `${row.season}-${row.week}-${row.position}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    for (const group of grouped.values()) {
      group.sort((a, b) => safeNumber(b.points) - safeNumber(a.points));
      const cutoff = cutoffs[group[0]?.position || ""];
      const baselineIndex = cutoff ? Math.min(cutoff - 1, group.length - 1) : null;
      const baseline = baselineIndex != null ? safeNumber(group[baselineIndex].points) : 0;
      group.forEach((row, index) => {
        const nextPoints = group[index + 1] ? safeNumber(group[index + 1].points) : 0;
        if (!hasDelta) row.delta_to_next = row.delta_to_next ?? (row.points || 0) - nextPoints;
        row.replacement_baseline = row.replacement_baseline ?? baseline;
        if (!hasWar) row.war_rep = row.war_rep ?? (row.points || 0) - baseline;
        row.pos_week_rank = row.pos_week_rank ?? index + 1;
      });
    }
    return rows;
  }, [statsWeeklyRows]);

  // Update careerWeeklyRows from season summaries (moved from useMemo to useEffect to avoid setState during render)
  useEffect(() => {
    if (!statsSeasonSummaries.length) return;
    const careerRows: StatsRow[] = [];
    for (const summary of statsSeasonSummaries) {
      if (summary?.rows) careerRows.push(...summary.rows);
    }
    const finalCareerRows = careerRows.filter(matchesPlayer);
    setCareerWeeklyRows(prev => {
      if (JSON.stringify(prev) === JSON.stringify(finalCareerRows)) return prev;
      return finalCareerRows;
    });
  }, [statsSeasonSummaries, targetIds, targetNames]);

  const metricsForPlayer = useMemo((): StatsRow[] => {
    return normalizedMetrics.filter(matchesPlayer);
  }, [normalizedMetrics, targetIds, playerInfo]);

  const weeklyDisplayRows = useMemo((): WeeklyDisplayRow[] => {
    const lineupByWeek = new Map<number, StatsRow>(weeklyRows.map((row) => [Number(row.week), row]));
    const metricsByWeek = new Map<number, StatsRow>(metricsForPlayer.map((row) => [Number(row.week), row]));
    const weeks = Array.from(new Set([...lineupByWeek.keys(), ...metricsByWeek.keys()])).filter((w) => w >= 1 && w <= 18);
    return weeks
      .sort((a, b) => a - b)
      .map((week): WeeklyDisplayRow => {
        const lineup = lineupByWeek.get(week);
        const metrics = metricsByWeek.get(week);
        return {
          season: metrics?.season || lineup?.season || Number(selectedSeason),
          week,
          nflTeam: metrics?.team || "—",
          fantasyTeam: lineup?.team || "—",
          started: lineup?.started,
          points: metrics?.points ?? metrics?.fantasy_points_custom_week ?? lineup?.points,
          pos_week_z: metrics?.pos_week_z,
          war_rep: metrics?.war_rep,
          delta_to_next: metrics?.delta_to_next,
          position: metrics?.position,
          pos_week_rank: metrics?.pos_week_rank,
        };
      });
  }, [weeklyRows, metricsForPlayer, selectedSeason]);

  const filteredWeeklyRows = useMemo((): WeeklyDisplayRow[] => {
    const query = search.toLowerCase().trim();
    if (!query) return weeklyDisplayRows;
    return weeklyDisplayRows.filter((row) => String(row.nflTeam || "").toLowerCase().includes(query));
  }, [weeklyDisplayRows, search]);

  const filteredFullStatsRows = useMemo((): StatsRow[] => {
    if (!fullStatsRows.length) return [];
    return fullStatsRows.filter(matchesPlayer);
  }, [fullStatsRows, targetIds, playerInfo]);

  const fullStatsColumns = useMemo((): FullStatsColumn[] => {
    const position =
      String(playerInfo?.position || statsNameRow?.position || displayPosition || "")
        .toUpperCase()
        .trim() || "FLEX";
    const rows = filteredFullStatsRows;
    const hasCol = (key: string): boolean => rows.some((row) => (row as Record<string, unknown>)?.[key] != null);
    const columnsByPosition: Record<string, FullStatsColumn[]> = {
      QB: [
        { key: "attempts", label: "Pass Att" },
        { key: "completions", label: "Comp" },
        { key: "passing_yards", label: "Pass Yds" },
        { key: "passing_tds", label: "Pass TD" },
        { key: "passing_interceptions", label: "INT" },
        { key: "passing_rating", label: "Rating" },
        { key: "passing_qbr", label: "QBR" },
        { key: "carries", label: "Rush Att" },
        { key: "rushing_yards", label: "Rush Yds" },
        { key: "rushing_tds", label: "Rush TD" },
        { key: "fumbles_lost", label: "Fum L" },
      ],
      RB: [
        { key: "carries", label: "Rush Att" },
        { key: "rushing_yards", label: "Rush Yds" },
        { key: "rushing_tds", label: "Rush TD" },
        { key: "receptions", label: "Rec" },
        { key: "targets", label: "Targets" },
        { key: "receiving_yards", label: "Rec Yds" },
        { key: "receiving_tds", label: "Rec TD" },
        { key: "ypc", label: "YPC", calc: "ypc" },
        { key: "ypr", label: "YPR", calc: "ypr" },
        { key: "fumbles_lost", label: "Fum L" },
      ],
      WR: [
        { key: "receptions", label: "Rec" },
        { key: "targets", label: "Targets" },
        { key: "receiving_yards", label: "Rec Yds" },
        { key: "receiving_tds", label: "Rec TD" },
        { key: "ypr", label: "YPR", calc: "ypr" },
        { key: "carries", label: "Rush Att" },
        { key: "rushing_yards", label: "Rush Yds" },
        { key: "rushing_tds", label: "Rush TD" },
        { key: "fumbles_lost", label: "Fum L" },
      ],
      TE: [
        { key: "receptions", label: "Rec" },
        { key: "targets", label: "Targets" },
        { key: "receiving_yards", label: "Rec Yds" },
        { key: "receiving_tds", label: "Rec TD" },
        { key: "ypr", label: "YPR", calc: "ypr" },
        { key: "carries", label: "Rush Att" },
        { key: "rushing_yards", label: "Rush Yds" },
        { key: "rushing_tds", label: "Rush TD" },
        { key: "fumbles_lost", label: "Fum L" },
      ],
      K: [
        { key: "extra_points_attempted", label: "XP Att" },
        { key: "extra_points_made", label: "XP Made" },
        { key: "field_goals_attempted", label: "FG Att" },
        { key: "field_goals_made", label: "FG Made" },
        { key: "field_goals_made_40_49", label: "FG 40-49" },
        { key: "field_goals_made_50_plus", label: "FG 50+" },
      ],
      DEF: [
        { key: "points", label: "Points", calc: "points" },
      ],
      FLEX: [
        { key: "attempts", label: "Pass Att" },
        { key: "completions", label: "Comp" },
        { key: "passing_yards", label: "Pass Yds" },
        { key: "passing_tds", label: "Pass TD" },
        { key: "passing_interceptions", label: "INT" },
        { key: "carries", label: "Rush Att" },
        { key: "rushing_yards", label: "Rush Yds" },
        { key: "rushing_tds", label: "Rush TD" },
        { key: "receptions", label: "Rec" },
        { key: "receiving_yards", label: "Rec Yds" },
        { key: "receiving_tds", label: "Rec TD" },
        { key: "fumbles_lost", label: "Fum L" },
      ],
    };
    const columns = columnsByPosition[position] || columnsByPosition.FLEX;
    return columns.filter((col) => col.calc || hasCol(col.key));
  }, [filteredFullStatsRows, playerInfo, statsNameRow, displayPosition]);

  const resolveFullStatValue = (row: StatsRow, column: FullStatsColumn): string | number => {
    const get = (key: string): number => safeNumber((row as Record<string, unknown>)?.[key]);
    if (column.calc === "ypc") {
      const carries = get("carries");
      if (!carries) return "—";
      return (get("rushing_yards") / carries).toFixed(2);
    }
    if (column.calc === "ypr") {
      const rec = get("receptions");
      if (!rec) return "—";
      return (get("receiving_yards") / rec).toFixed(2);
    }
    if (column.calc === "points") {
      return (
        row.fantasy_points_custom_week_with_bonus ??
        row.fantasy_points_custom_week ??
        row.fantasy_points_ppr ??
        row.fantasy_points ??
        "—"
      );
    }
    if (column.key === "fumbles_lost") {
      const total =
        get("rushing_fumbles_lost") +
        get("receiving_fumbles_lost") +
        get("sack_fumbles_lost");
      return total ? total : "—";
    }
    const value = (row as Record<string, unknown>)?.[column.key];
    return value == null || value === "" ? "—" : value as string | number;
  };

  const weeklyVirtual = useVirtualRows({ itemCount: filteredWeeklyRows.length, rowHeight: 46 });
  const visibleWeeklyRows = filteredWeeklyRows.slice(weeklyVirtual.start, weeklyVirtual.end);
  const fullStatsVirtual = useVirtualRows({ itemCount: filteredFullStatsRows.length, rowHeight: 46 });
  const visibleFullStatsRows = filteredFullStatsRows.slice(fullStatsVirtual.start, fullStatsVirtual.end);

  useEffect(() => {
    let active = true;
    if (!seasons.length) return undefined;
    Promise.all(seasons.map((season) => loadPlayerStatsWeekly(season))).then((payloads) => {
      if (!active) return;
      const rows: StatsRow[] = [];
      for (const payload of payloads) {
        const seasonRows = (payload as { rows?: StatsRow[] })?.rows || payload || [];
        for (const row of seasonRows as StatsRow[]) {
          const week = Number(row?.week);
          if (!Number.isFinite(week) || week < 1 || week > 18) continue;
          if (!matchesPlayer(row)) continue;
          rows.push({
            ...row,
            points: safeNumber(row.points ?? row.fantasy_points_custom_week ?? row.fantasy_points_custom),
          });
        }
      }
      setCareerWeeklyRows(prev => {
        if (JSON.stringify(prev) === JSON.stringify(rows)) return prev;
        return rows;
      });
    });
    return () => {
      active = false;
    };
  }, [seasons, targetIds, playerInfo, resolvedName]);

  const boomBust = useMemo((): BoomBust | null => {
    const rows = careerWeeklyRows.length ? careerWeeklyRows : weeklyDisplayRows;
    if (!rows.length) return null;
    const points = rows.map((row) => safeNumber(row.points));
    const mean = points.reduce((sum, value) => sum + value, 0) / points.length;
    const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / points.length;
    const stdDev = Math.sqrt(variance);
    const threshold = THRESHOLDS[playerInfo?.position as keyof PositionThresholds] || THRESHOLDS.default;
    const above = points.filter((value) => value >= threshold).length;
    const percentAbove = (above / points.length) * 100;
    const sorted = [...rows].sort((a, b) => safeNumber(b.points) - safeNumber(a.points));
    return {
      stdDev,
      threshold,
      percentAbove,
      topWeeks: sorted.slice(0, 5) as StatsRow[],
      bottomWeeks: sorted.slice(-5).reverse() as StatsRow[],
    };
  }, [careerWeeklyRows, weeklyDisplayRows, playerInfo]);

  const boomBustFromMetrics = useMemo((): BoomBustMetricsRow | null => {
    if (!boomBustMetrics.length) return null;
    return boomBustMetrics.find((row) => {
      const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) => String(value || ""));
      return ids.some((value) => targetIds.has(value));
    }) || null;
  }, [boomBustMetrics, targetIds]);

  const boomBustWeeks = useMemo((): { top: StatsRow[]; bottom: StatsRow[] } => {
    if (!boomBust) return { top: [], bottom: [] };
    return { top: boomBust.topWeeks || [], bottom: boomBust.bottomWeeks || [] };
  }, [boomBust]);

  const consistencyLabel = useMemo((): string | null => {
    if (boomBustFromMetrics?.consistency_label) return boomBustFromMetrics.consistency_label;
    const stdDev = boomBust?.stdDev;
    if (stdDev == null) return null;
    if (stdDev <= 6) return "High";
    if (stdDev <= 10) return "Medium";
    return "Low";
  }, [boomBustFromMetrics, boomBust]);

  if ((loading || dataLoading) && !seasonSummaries.length && !statsSeasonSummaries.length)
    return <LoadingState label="Loading player profile..." />;
  if (error || dataError) return <ErrorState message={error || "Error loading player data"} />;

  return (
    <PageTransition>
      {/* Hero Section - Futuristic Design */}
      <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-8 p-6 md:p-10 isolate shadow-2xl border border-accent-500/20">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[60px] -translate-x-1/2 -translate-y-1/2 -z-10" />

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />

        {/* Accent lines */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-500/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-500/30 to-transparent" />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 items-center relative z-10">
          <div className="flex flex-col gap-6 text-center lg:text-left">
            <div>
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-3">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-accent-300 bg-clip-text text-transparent drop-shadow-lg">
                  {megaProfile?.nfl?.bio?.display_name || megaProfile?.fantasy?.name || displayName}
                  <span className="text-accent-400 text-6xl leading-none drop-shadow-[0_0_20px_rgba(31,147,134,0.5)]">.</span>
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-white/10 text-white/50 hover:text-red-400 transition-all duration-300 hover:scale-110"
                  onClick={() => togglePlayer(resolvedPlayerId)}
                >
                  <Heart className={isFavorite ? "fill-red-500 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" : ""} size={28} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-lg font-medium text-ink-300">
                <span className="text-accent-400 font-bold px-3 py-1 bg-accent-500/10 rounded-full border border-accent-500/30 shadow-[0_0_15px_rgba(31,147,134,0.2)]">{megaProfile?.nfl?.bio?.position || displayPosition}</span>
                <span className="text-ink-500">|</span>
                <span className="text-white/80">{megaProfile?.nfl?.bio?.latest_team || displayTeam}</span>
                {(megaProfile?.fantasy?.age || playerInfo?.age) && (
                  <>
                    <span className="text-ink-500">|</span>
                    <span className="text-ink-400">{megaProfile?.fantasy?.age || playerInfo?.age} Years Old</span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-y-5 gap-x-8 max-w-lg mx-auto lg:mx-0 pt-5 border-t border-white/10">
              <div className="group">
                <div className="text-[10px] font-bold text-accent-500/70 uppercase tracking-[0.2em] mb-1">Height</div>
                <div className="text-xl font-display font-bold text-white group-hover:text-accent-400 transition-colors">
                  {megaProfile?.nfl?.bio?.height
                    ? `${Math.floor(megaProfile.nfl.bio.height / 12)}'${megaProfile.nfl.bio.height % 12}"`
                    : megaProfile?.fantasy?.height || playerInfo?.height || "—"}
                </div>
              </div>
              <div className="group">
                <div className="text-[10px] font-bold text-accent-500/70 uppercase tracking-[0.2em] mb-1">Weight</div>
                <div className="text-xl font-display font-bold text-white group-hover:text-accent-400 transition-colors">
                  {megaProfile?.nfl?.bio?.weight
                    ? `${megaProfile.nfl.bio.weight} lbs`
                    : (megaProfile?.fantasy?.weight || playerInfo?.weight ? `${megaProfile?.fantasy?.weight || playerInfo?.weight} lbs` : "—")}
                </div>
              </div>
              <div className="col-span-2 group">
                <div className="text-[10px] font-bold text-accent-500/70 uppercase tracking-[0.2em] mb-1">College</div>
                <div className="text-xl font-display font-bold truncate text-white group-hover:text-accent-400 transition-colors">
                  {megaProfile?.nfl?.bio?.college_name || megaProfile?.fantasy?.college || playerInfo?.college || "—"}
                </div>
              </div>
              <div className="group">
                <div className="text-[10px] font-bold text-accent-500/70 uppercase tracking-[0.2em] mb-1">Experience</div>
                <div className="text-xl font-display font-bold text-white group-hover:text-accent-400 transition-colors">
                  {megaProfile?.nfl?.bio?.years_of_experience != null
                    ? `${megaProfile.nfl.bio.years_of_experience} Years`
                    : (playerInfo?.years_exp != null ? `${playerInfo.years_exp} Years` : "Rookie")}
                </div>
              </div>
              <div className="group">
                <div className="text-[10px] font-bold text-accent-500/70 uppercase tracking-[0.2em] mb-1">Draft</div>
                <div className="text-xl font-display font-bold text-white/80 group-hover:text-accent-400 transition-colors">
                  {megaProfile?.nfl?.bio?.draft_year
                    ? `${megaProfile.nfl.bio.draft_year} R${megaProfile.nfl.bio.draft_round} P${megaProfile.nfl.bio.draft_pick}`
                    : (playerInfo?.draft_year ? `${playerInfo.draft_year}` : "Undrafted")}
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center order-first lg:order-none mb-4 lg:mb-0">
            {/* Glowing ring effect */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-56 h-56 md:w-72 md:h-72 lg:w-80 lg:h-80 rounded-full border-2 border-accent-500/30 animate-pulse" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 md:w-80 md:h-80 lg:w-[22rem] lg:h-[22rem] rounded-full border border-accent-500/10" />
            </div>
            <div className="w-48 h-48 md:w-64 md:h-64 lg:w-72 lg:h-72 rounded-full border-4 border-accent-500/40 shadow-[0_0_40px_rgba(31,147,134,0.3)] overflow-hidden bg-ink-800 relative group">
              {(megaProfile?.nfl?.bio?.headshot || playerDisplay.headshotUrl) ? (
                <img
                  src={megaProfile?.nfl?.bio?.headshot || playerDisplay.headshotUrl}
                  alt={displayName}
                  className="w-full h-full object-cover scale-110 group-hover:scale-105 transition-transform duration-700"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-ink-800 to-ink-900">
                  <Heart size={64} className="text-accent-500/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-tr from-accent-500/10 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink-900/50 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-6 justify-center">
            <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] rounded-2xl p-6 border border-white/10 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <div className="text-[10px] font-bold text-accent-400 uppercase tracking-[0.2em] mb-5 flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Zap size={14} className="text-accent-400" />
                  Season Performance
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSeason}
                    onChange={(e) => handleSeasonChange(e.target.value)}
                    className="bg-ink-900/80 border border-accent-500/30 text-white text-xs rounded-lg px-3 py-1.5 font-bold focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all cursor-pointer hover:border-accent-500/50"
                  >
                    {seasonOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(() => {
                const currentStats = seasonStats.find(s => Number(s.season) === Number(selectedSeason)) || {} as SeasonStatsRow;
                return (
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-end mb-3">
                        <span className="text-sm font-medium text-ink-400">Total Points</span>
                        <span className="text-3xl font-display font-black text-accent-400 drop-shadow-[0_0_10px_rgba(31,147,134,0.3)]">{formatPoints(currentStats.points) || "—"}</span>
                      </div>
                      <div className="h-3 w-full bg-ink-800/80 rounded-full overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-accent-600 to-accent-400 rounded-full shadow-[0_0_15px_rgba(31,147,134,0.5)] transition-all duration-500"
                          style={{ width: `${Math.min((safeNumber(currentStats.points) / 300) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-end mb-3">
                        <span className="text-sm font-medium text-ink-400">Avg Points / Game</span>
                        <span className="text-3xl font-display font-black text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                          {currentStats.games ? (safeNumber(currentStats.points) / currentStats.games).toFixed(1) : "—"}
                        </span>
                      </div>
                      <div className="h-3 w-full bg-ink-800/80 rounded-full overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-500"
                          style={{ width: `${Math.min(((safeNumber(currentStats.points) / (currentStats.games || 1)) / 25) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3">
                      <div className="bg-gradient-to-br from-ink-800/80 to-ink-900/80 rounded-xl p-4 text-center border border-white/5 hover:border-accent-500/30 transition-all group">
                        <div className="text-[9px] uppercase tracking-[0.15em] text-ink-500 font-bold mb-2">Games Played</div>
                        <div className="text-2xl font-black font-mono text-white group-hover:text-accent-400 transition-colors">{currentStats.games || 0}</div>
                      </div>
                      <div className="bg-gradient-to-br from-ink-800/80 to-ink-900/80 rounded-xl p-4 text-center border border-white/5 hover:border-accent-500/30 transition-all group">
                        <div className="text-[9px] uppercase tracking-[0.15em] text-ink-500 font-bold mb-2">Pos Rank</div>
                        <div className="text-2xl font-black font-mono text-accent-400 group-hover:text-white transition-colors">#{currentStats.positionRank || "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* FANTASY DATA SECTION - Futuristic Card */}
      <Card className="mb-8 shadow-[0_20px_60px_rgba(31,147,134,0.15)] border border-accent-500/30 bg-gradient-to-br from-white via-accent-50/20 to-white overflow-hidden relative">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <CardHeader
          className="cursor-pointer hover:bg-accent-50/80 transition-all duration-300 rounded-t-lg relative z-10 border-b border-accent-200/50"
          onClick={() => setFantasyExpanded(!fantasyExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl shadow-lg shadow-accent-500/30">
                <Trophy className="text-white drop-shadow-md" size={28} />
              </div>
              <div>
                <CardTitle className="text-2xl font-display font-black bg-gradient-to-r from-accent-700 to-accent-500 bg-clip-text text-transparent">Fantasy Data</CardTitle>
                <CardDescription className="text-sm text-ink-500 font-medium">Performance, Transactions, and Analytics</CardDescription>
              </div>
            </div>
            <div className={`p-2 rounded-full bg-accent-100 text-accent-600 transition-transform duration-300 ${fantasyExpanded ? 'rotate-180' : ''}`}>
              <ChevronDown size={24} />
            </div>
          </div>
        </CardHeader>

        {fantasyExpanded && (
          <CardContent className="space-y-8 pt-8 relative z-10">
            {/* Career Stats Grid - Futuristic Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="group relative bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl p-5 text-white shadow-lg shadow-accent-500/25 hover:shadow-xl hover:shadow-accent-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="text-accent-200" size={18} />
                    <span className="text-[10px] font-bold text-accent-200 uppercase tracking-[0.15em]">Career Points</span>
                  </div>
                  <div className="text-4xl font-display font-black mb-1">{formatPoints(careerTotals.points)}</div>
                  <p className="text-xs text-accent-200/80">{careerTotals.games} games · {careerTotals.seasons} seasons</p>
                </div>
              </div>

              <div className="group relative bg-white rounded-2xl p-5 border-2 border-ink-100 hover:border-blue-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="text-blue-500" size={18} />
                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Avg Points</span>
                  </div>
                  <div className="text-4xl font-display font-black text-ink-900 group-hover:text-blue-600 transition-colors">
                    {careerTotals.games > 0 ? (careerTotals.points / careerTotals.games).toFixed(1) : "0.0"}
                  </div>
                  <p className="text-xs text-ink-400">Points per game</p>
                </div>
              </div>

              <div className="group relative bg-white rounded-2xl p-5 border-2 border-ink-100 hover:border-purple-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="text-purple-500" size={18} />
                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Consistency</span>
                  </div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="text-4xl font-display font-black text-ink-900 group-hover:text-purple-600 transition-colors">{consistencyLabel || "—"}</div>
                    {consistencyLabel && (
                      <Badge variant={consistencyLabel === "High" ? "success" : consistencyLabel === "Medium" ? "accent" : "destructive"} className="text-[10px] px-2 py-1 shadow-sm">
                        {consistencyLabel === "High" ? "TOP" : consistencyLabel === "Medium" ? "STABLE" : "VOLATILE"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-400">{boomBust?.stdDev ? `Std Dev: ${boomBust.stdDev.toFixed(1)}` : "No data"}</p>
                </div>
              </div>

              <div className="group relative bg-gradient-to-br from-ink-900 to-ink-800 rounded-2xl p-5 text-white shadow-lg shadow-ink-900/25 hover:shadow-xl hover:shadow-ink-900/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-accent-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-accent-500/10 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="text-accent-400" size={18} />
                    <span className="text-[10px] font-bold text-ink-400 uppercase tracking-[0.15em]">Career WAR</span>
                  </div>
                  <div className="text-4xl font-display font-black text-accent-400 drop-shadow-[0_0_10px_rgba(31,147,134,0.3)]">{formatPoints(careerTotals.war)}</div>
                  <p className="text-xs text-ink-500">Value over replacement</p>
                </div>
              </div>
            </div>

            {/* Season by Season Table - Futuristic */}
            <Card className="shadow-lg border border-ink-200/50 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-100 rounded-lg">
                    <Calendar className="text-accent-600" size={20} />
                  </div>
                  <CardTitle className="font-display">Season-by-Season Totals</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {seasonStats.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Season</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Games</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Total Points</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Pos Rank</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">WAR</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {seasonStats.map((row, idx) => (
                          <tr key={row.season} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                            <td className="py-4 px-5 font-display font-black text-ink-900 text-lg">{row.season}</td>
                            <td className="py-4 px-5 text-ink-600 font-medium">{row.games}</td>
                            <td className="py-4 px-5">
                              <span className="font-mono font-black text-lg text-accent-600">{formatPoints(row.points)}</span>
                            </td>
                            <td className="py-4 px-5">
                              {row.position && row.positionRank ? (
                                <span className="inline-flex items-center px-3 py-1 bg-ink-100 rounded-full text-sm font-bold text-ink-800">{row.position}{row.positionRank}</span>
                              ) : "—"}
                            </td>
                            <td className="py-4 px-5 font-mono font-bold text-ink-600">{formatPoints(row.war)}</td>
                            <td className="py-4 px-5 font-mono text-ink-400">{formatPoints(row.delta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-ink-400 italic">No season totals available</div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Log - Futuristic */}
            <Card className="shadow-lg border border-ink-200/50 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent-100 rounded-lg">
                      <Target className="text-accent-600" size={20} />
                    </div>
                    <CardTitle className="font-display">Weekly Performance Log</CardTitle>
                  </div>
                  <SearchBar value={search} onChange={setSearch} placeholder="Filter by team..." />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {weeklyDisplayRows.length ? (
                  <div className="overflow-x-auto" ref={weeklyVirtual.containerRef}>
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Week</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">NFL Team</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Fantasy Team</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Starter</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Points</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">WAR</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Pos Rank</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {weeklyVirtual.topPadding ? (
                          <tr aria-hidden="true">
                            <td colSpan={7} style={{ height: weeklyVirtual.topPadding }} />
                          </tr>
                        ) : null}
                        {visibleWeeklyRows.map((row, idx) => (
                          <tr key={`${row.week}-${idx}`} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                            <td className="py-4 px-5">
                              <span className="inline-flex items-center justify-center w-10 h-10 bg-ink-900 text-white font-display font-black rounded-lg shadow-sm">
                                {row.week}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-sm font-medium text-ink-600 uppercase">{row.nflTeam || "—"}</td>
                            <td className="py-4 px-5 text-sm font-bold text-ink-800">{row.fantasyTeam || "—"}</td>
                            <td className="py-4 px-5">
                              {row.started ? (
                                <Badge variant="success" className="text-[10px] shadow-sm shadow-green-500/20">Starter</Badge>
                              ) : (
                                <span className="text-xs text-ink-400">Bench</span>
                              )}
                            </td>
                            <td className="py-4 px-5">
                              <span className="font-mono font-black text-lg text-accent-600">{formatPoints(row.points)}</span>
                            </td>
                            <td className="py-4 px-5 font-mono font-bold text-ink-500">{row.war_rep != null ? formatPoints(row.war_rep) : "—"}</td>
                            <td className="py-4 px-5">
                              {row.position && row.pos_week_rank ? (
                                <span className="inline-flex items-center px-2 py-1 bg-ink-100 rounded-full text-xs font-bold text-ink-700">{row.position}{row.pos_week_rank}</span>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                        {weeklyVirtual.bottomPadding ? (
                          <tr aria-hidden="true">
                            <td colSpan={7} style={{ height: weeklyVirtual.bottomPadding }} />
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-ink-400 italic">No weekly data available for this season</div>
                )}
              </CardContent>
            </Card>

            {/* Boom/Bust Analysis - Futuristic */}
            <Card className="shadow-lg border-2 border-purple-200/50 bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/30 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
              <CardHeader className="relative z-10 border-b border-purple-200/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg shadow-lg shadow-purple-500/20">
                    <TrendingUp className="text-white" size={20} />
                  </div>
                  <CardTitle className="font-display bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Boom/Bust Analysis</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10 pt-6">
                {boomBustFromMetrics || boomBust ? (
                  <>
                    <div className="flex flex-wrap gap-3 mb-8">
                      <Badge variant="outline" className="px-4 py-2 bg-white/80 border-ink-300 shadow-sm text-sm">
                        Std dev: <span className="font-bold text-ink-900 ml-1">{formatPoints(boomBustFromMetrics?.fp_std ?? boomBust?.stdDev)}</span>
                      </Badge>
                      {consistencyLabel && (
                        <Badge variant="secondary" className="px-4 py-2 shadow-sm text-sm">
                          Consistency: <span className="font-bold ml-1">{consistencyLabel}</span>
                        </Badge>
                      )}
                      <Badge variant="accent" className="px-4 py-2 shadow-sm shadow-accent-500/20 text-sm">
                        Boom Rate: <span className="font-bold ml-1">{(boomBustFromMetrics?.boom_pct
                          ? boomBustFromMetrics.boom_pct * 100
                          : boomBust?.percentAbove || 0
                        ).toFixed(1)}%</span>
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-green-500/25 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                        <div className="flex items-center gap-2 mb-4 relative z-10">
                          <TrendingUp size={20} className="text-green-200" />
                          <h4 className="text-sm font-bold text-green-100 uppercase tracking-wider">Top 5 Weeks</h4>
                        </div>
                        <ul className="space-y-3 relative z-10">
                          {boomBustWeeks.top.map((row, idx) => (
                            <li key={`top-${idx}`} className="flex justify-between items-center bg-white/10 rounded-lg px-3 py-2">
                              <span className="text-green-100">Week {row.week} ({row.season || selectedSeason})</span>
                              <span className="font-display font-black text-lg">{formatPoints(row.points)} pts</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-red-500/25 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                        <div className="flex items-center gap-2 mb-4 relative z-10">
                          <TrendingDown size={20} className="text-red-200" />
                          <h4 className="text-sm font-bold text-red-100 uppercase tracking-wider">Bottom 5 Weeks</h4>
                        </div>
                        <ul className="space-y-3 relative z-10">
                          {boomBustWeeks.bottom.map((row, idx) => (
                            <li key={`bottom-${idx}`} className="flex justify-between items-center bg-white/10 rounded-lg px-3 py-2">
                              <span className="text-red-100">Week {row.week} ({row.season || selectedSeason})</span>
                              <span className="font-display font-black text-lg">{formatPoints(row.points)} pts</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-ink-400 italic">
                    No weekly data available to compute boom/bust metrics
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transactions & Keeper - Futuristic */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-lg border border-ink-200/50 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent-100 rounded-lg">
                      <Users className="text-accent-600" size={20} />
                    </div>
                    <CardTitle className="font-display">Transaction History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  {transactionHistory.length ? (
                    <div className="space-y-4">
                      {transactionHistory.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="flex items-start gap-4 p-4 rounded-xl border border-ink-100 bg-gradient-to-r from-white to-ink-50/50 hover:shadow-md transition-all duration-300 group">
                          <div className="flex flex-col items-center justify-center min-w-[70px] bg-ink-900 text-white rounded-xl p-3 shadow-md group-hover:bg-accent-600 transition-colors">
                            <span className="text-[9px] font-bold text-ink-400 uppercase group-hover:text-accent-200 transition-colors">{entry.season}</span>
                            <span className="text-2xl font-display font-black">W{entry.week}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Badge
                                variant={entry.type === "trade" ? "secondary" : entry.type === "add" ? "success" : "destructive"}
                                className="shadow-sm text-[10px] px-3 py-1"
                              >
                                {(entry.type || "").toUpperCase()}
                              </Badge>
                              <span className="text-sm font-bold text-ink-800">{normalizeOwnerName(entry.team)}</span>
                            </div>
                            <p className="text-sm text-ink-600 leading-relaxed">{formatTransactionDetails(entry)}</p>
                          </div>
                          {entry.amount != null && (
                            <div className="font-mono text-lg font-black text-accent-600 bg-accent-50 px-3 py-1 rounded-lg">
                              {formatAmount(entry)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-ink-400 italic py-8 text-center border-2 border-dashed rounded-xl border-ink-200 bg-ink-50/30">
                      No transactions recorded
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="relative bg-gradient-to-br from-accent-500 via-accent-600 to-accent-700 rounded-2xl p-6 text-white shadow-xl shadow-accent-500/30 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <DollarSign className="text-accent-200" size={24} />
                    <h3 className="text-lg font-display font-bold text-accent-100">Keeper Value (2025)</h3>
                  </div>
                  <div className="mb-6">
                    <div className="text-[10px] font-bold text-accent-200/70 uppercase tracking-[0.15em] mb-2">Projected Value</div>
                    <div className="text-5xl font-display font-black drop-shadow-lg">{formatDollarValue(keeperInfo.value)}</div>
                    <p className="text-sm text-accent-100/80 mt-3 leading-relaxed">{keeperInfo.note}</p>
                  </div>
                  <div className="p-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-sm text-accent-100 italic">
                    Keeper values: <strong className="text-white">Added Value + $5 Inflation</strong>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* NFL DATA SECTION - Futuristic */}
      <Card className="mb-8 shadow-[0_20px_60px_rgba(59,130,246,0.15)] border border-blue-500/30 bg-gradient-to-br from-white via-blue-50/20 to-white overflow-hidden relative">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <CardHeader
          className="cursor-pointer hover:bg-blue-50/80 transition-all duration-300 rounded-t-lg relative z-10 border-b border-blue-200/50"
          onClick={() => setNflExpanded(!nflExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg shadow-blue-500/30">
                <Award className="text-white drop-shadow-md" size={28} />
              </div>
              <div>
                <CardTitle className="text-2xl font-display font-black bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent">NFL Data</CardTitle>
                <CardDescription className="text-sm text-ink-500 font-medium">Biography, Draft Info, and Game Stats</CardDescription>
              </div>
            </div>
            <div className={`p-2 rounded-full bg-blue-100 text-blue-600 transition-transform duration-300 ${nflExpanded ? 'rotate-180' : ''}`}>
              <ChevronDown size={24} />
            </div>
          </div>
        </CardHeader>

        {nflExpanded && (
          <CardContent className="space-y-8 pt-8 relative z-10">
            {/* Bio & Draft Grid - Futuristic */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-lg border border-ink-200/50 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  <CardTitle className="font-display">NFL Bio & Draft</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="group">
                      <label className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.15em] mb-1 block">Full Name</label>
                      <div className="text-lg font-bold text-ink-900 group-hover:text-blue-600 transition-colors">{megaProfile?.nfl?.bio?.display_name || displayName}</div>
                    </div>
                    <div className="group">
                      <label className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.15em] mb-1 block">Status</label>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-lg font-bold text-ink-900">{megaProfile?.nfl?.bio?.status || "Active"}</span>
                      </div>
                    </div>
                    <div className="group">
                      <label className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.15em] mb-1 block">Draft Year</label>
                      <div className="text-lg font-bold text-ink-900 group-hover:text-blue-600 transition-colors">{megaProfile?.nfl?.bio?.draft_year || "Undrafted"}</div>
                    </div>
                    <div className="group">
                      <label className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.15em] mb-1 block">Draft Position</label>
                      <div className="text-lg font-bold text-ink-900 group-hover:text-blue-600 transition-colors">
                        {megaProfile?.nfl?.bio?.draft_round ? `Round ${megaProfile.nfl.bio.draft_round}, Pick ${megaProfile.nfl.bio.draft_pick}` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="group pt-2 border-t border-ink-100">
                    <label className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.15em] mb-1 block">College</label>
                    <div className="text-lg font-bold text-ink-900 group-hover:text-blue-600 transition-colors">{megaProfile?.nfl?.bio?.college_name || playerInfo?.college || "—"}</div>
                  </div>
                  {megaProfile?.nfl?.bio?.gsis_id && (
                    <div className="pt-2 border-t border-ink-100">
                      <label className="text-[9px] uppercase font-bold text-blue-500 tracking-[0.15em] mb-1 block">GSIS ID</label>
                      <div className="font-mono text-sm text-ink-500 bg-ink-50 px-3 py-1.5 rounded-lg inline-block">{megaProfile.nfl.bio.gsis_id}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg border border-ink-200/50 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                  <CardTitle className="font-display">Sportradar Context</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {megaProfile?.nfl?.sportradar?.id ? (
                    <div className="space-y-5">
                      <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-ink-900 to-ink-800 rounded-xl text-white shadow-lg">
                        <div className="p-4 bg-white rounded-xl font-display font-black text-xl text-ink-900">
                          {megaProfile.nfl.sportradar._team_alias}
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-ink-400 uppercase tracking-[0.15em]">Current Team</div>
                          <div className="text-xl font-bold">{megaProfile.nfl.sportradar._team_alias} Roster</div>
                        </div>
                      </div>
                      <div className="group">
                        <label className="text-[9px] uppercase font-bold text-indigo-500 tracking-[0.15em] mb-1 block">Sportradar Status</label>
                        <div className="text-lg font-bold text-ink-900">{megaProfile.nfl.sportradar.status || "Active"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-ink-400 italic bg-ink-50/50 rounded-xl">
                      Sportradar mapping not found
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Full Stats Table - Futuristic */}
            <Card className="shadow-lg border border-ink-200/50 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <BarChart3 className="text-blue-600" size={20} />
                  </div>
                  <CardTitle className="font-display">Complete Game Stats ({selectedSeason})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredFullStatsRows.length ? (
                  <div className="overflow-x-auto" ref={fullStatsVirtual.containerRef}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Week</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team</th>
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Opp</th>
                          {fullStatsColumns.map((column) => (
                            <th key={column.label} className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">{column.label}</th>
                          ))}
                          <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-accent-400">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {fullStatsVirtual.topPadding ? (
                          <tr aria-hidden="true">
                            <td colSpan={4 + fullStatsColumns.length} style={{ height: fullStatsVirtual.topPadding }} />
                          </tr>
                        ) : null}
                        {visibleFullStatsRows.map((row, idx) => (
                          <tr key={`${row.week}-${idx}`} className={`hover:bg-blue-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                            <td className="py-4 px-5">
                              <span className="inline-flex items-center justify-center w-9 h-9 bg-ink-900 text-white font-display font-bold rounded-lg shadow-sm text-sm">
                                {row.week}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-xs font-bold text-ink-600 uppercase">{row.team || "—"}</td>
                            <td className="py-4 px-5 text-xs text-ink-400">vs {row.opponent_team || "—"}</td>
                            {fullStatsColumns.map((column) => (
                              <td key={`${column.key}-${idx}`} className="py-4 px-5 font-mono text-sm text-ink-700 font-medium">{resolveFullStatValue(row, column)}</td>
                            ))}
                            <td className="py-4 px-5">
                              <span className="font-mono font-black text-lg text-accent-600">
                                {row.fantasy_points_custom_week_with_bonus ??
                                  row.fantasy_points_custom_week ??
                                  row.fantasy_points_ppr ??
                                  row.fantasy_points ??
                                  "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {fullStatsVirtual.bottomPadding ? (
                          <tr aria-hidden="true">
                            <td colSpan={13} style={{ height: fullStatsVirtual.bottomPadding }} />
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-ink-400 italic">No full stats available for this season</div>
                )}
              </CardContent>
            </Card>

            {/* Vegas Odds - Futuristic */}
            <Card className="shadow-lg border border-amber-200/50 bg-gradient-to-br from-amber-50/30 to-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <CardHeader className="relative z-10 border-b border-amber-200/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-md shadow-amber-500/20">
                    <DollarSign className="text-white" size={20} />
                  </div>
                  <CardTitle className="font-display bg-gradient-to-r from-amber-700 to-amber-500 bg-clip-text text-transparent">Vegas Odds (2025 Market)</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10 pt-6">
                {(() => {
                  const team = megaProfile?.nfl?.bio?.latest_team;
                  if (!team || !nflSiloMeta?.odds) return <div className="text-center py-8 text-ink-400 italic bg-ink-50/50 rounded-xl">No market data available for 2025</div>;

                  const gameId = Object.keys(nflSiloMeta.odds).find(gid => {
                    const game = nflSiloMeta.odds![gid]?.game;
                    return game?.home?.alias === team || game?.away?.alias === team;
                  });

                  const odds = gameId ? nflSiloMeta.odds[gameId] : undefined;
                  if (!odds) return <div className="text-center py-8 text-ink-400 italic bg-ink-50/50 rounded-xl">No 2025 odds found for {team}</div>;

                  const game = odds.game;
                  const consensus = odds.consensus;

                  return (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-ink-900 via-ink-800 to-ink-900 text-white rounded-2xl shadow-xl relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px'}} />
                        <div className="text-center px-6 relative z-10">
                          <div className="text-[9px] font-bold text-ink-400 uppercase tracking-[0.15em] mb-2">Away</div>
                          <div className="text-3xl font-display font-black">{game?.away?.alias}</div>
                        </div>
                        <div className="px-6 py-3 bg-accent-500/20 rounded-full border border-accent-500/30 relative z-10">
                          <span className="text-accent-400 font-display font-black text-xl">@</span>
                        </div>
                        <div className="text-center px-6 relative z-10">
                          <div className="text-[9px] font-bold text-ink-400 uppercase tracking-[0.15em] mb-2">Home</div>
                          <div className="text-3xl font-display font-black">{game?.home?.alias}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="p-5 rounded-xl bg-gradient-to-br from-white to-amber-50/50 border-2 border-amber-200/50 text-center hover:shadow-lg hover:border-amber-300 transition-all duration-300 group">
                          <div className="text-[9px] font-bold text-amber-600 uppercase tracking-[0.15em] mb-3">Moneyline</div>
                          <div className="flex justify-around">
                            <div className="font-mono font-black text-xl text-ink-800 group-hover:text-amber-600 transition-colors">{consensus?.moneyline?.away_plus_minus || "—"}</div>
                            <div className="font-mono font-black text-xl text-ink-800 group-hover:text-amber-600 transition-colors">{consensus?.moneyline?.home_plus_minus || "—"}</div>
                          </div>
                        </div>
                        <div className="p-5 rounded-xl bg-gradient-to-br from-white to-blue-50/50 border-2 border-blue-200/50 text-center hover:shadow-lg hover:border-blue-300 transition-all duration-300 group">
                          <div className="text-[9px] font-bold text-blue-600 uppercase tracking-[0.15em] mb-3">Spread</div>
                          <div className="flex justify-around">
                            <div className="font-mono font-black text-xl text-ink-800 group-hover:text-blue-600 transition-colors">{consensus?.spread?.away_spread_plus_minus || "—"}</div>
                            <div className="font-mono font-black text-xl text-ink-800 group-hover:text-blue-600 transition-colors">{consensus?.spread?.home_spread_plus_minus || "—"}</div>
                          </div>
                        </div>
                        <div className="p-5 rounded-xl bg-gradient-to-br from-white to-purple-50/50 border-2 border-purple-200/50 text-center hover:shadow-lg hover:border-purple-300 transition-all duration-300 group">
                          <div className="text-[9px] font-bold text-purple-600 uppercase tracking-[0.15em] mb-3">Total (O/U)</div>
                          <div className="font-mono font-black text-2xl text-ink-800 group-hover:text-purple-600 transition-colors">{consensus?.total?.over_under || "—"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </CardContent>
        )}
      </Card>

      {/* WAR Definitions Footer - Futuristic */}
      <Card className="mt-12 bg-gradient-to-br from-ink-900 to-ink-800 text-white border-none shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px'}} />

        <CardHeader className="relative z-10 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-500/20 rounded-lg border border-accent-500/30">
              <Activity className="text-accent-400" size={20} />
            </div>
            <CardTitle className="text-lg font-display text-white">WAR Definitions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-ink-300 space-y-5 relative z-10 pt-6">
          <p className="leading-relaxed">
            <strong className="text-accent-400 font-display">Replacement-level WAR</strong> is your weekly points minus a replacement baseline for your position.
            In this league, baselines assume 8 teams (2QB, 3RB, 3WR, 2TE).
          </p>
          <p className="leading-relaxed">
            <strong className="text-accent-400 font-display">Delta to next guy</strong> is the margin to the next best player at the same position in a given week.
          </p>
          <div className="p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <span className="font-bold text-white block mb-3 font-display">Baseline examples (8-team league):</span>
            <p className="text-ink-300 leading-relaxed">
              The baseline is the points scored by the last starter in the league at each position:
              <span className="font-mono text-accent-400 ml-2 bg-accent-500/10 px-3 py-1 rounded-lg inline-block mt-2">QB16 · RB24 · WR24 · TE16 · K8 · DEF8</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
