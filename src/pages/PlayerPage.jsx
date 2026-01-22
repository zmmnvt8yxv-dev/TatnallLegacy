import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { usePlayerDetails } from "../hooks/usePlayerDetails.js";
import PageTransition from "../components/PageTransition.jsx";
import { getCanonicalPlayerId, resolvePlayerDisplay, resolvePlayerName } from "../lib/playerName.js";
import { normalizeName } from "../lib/nameUtils.js";
import { normalizeOwnerName } from "../lib/identity.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { useVirtualRows } from "../utils/useVirtualRows.js";
import { useFavorites } from "../utils/useFavorites.js";
import { loadPlayerStatsWeekly } from "../data/loader.js";
import { readStorage, writeStorage } from "../utils/persistence.js";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Heart, TrendingUp, TrendingDown, Activity, Target, Zap, Award, Calendar, Users, DollarSign, BarChart3, Trophy, Star, ChevronRight, ChevronDown } from "lucide-react";

const PLAYER_PREF_KEY = "tatnall-pref-player";

const THRESHOLDS = {
  QB: 20,
  RB: 15,
  WR: 15,
  TE: 12,
  K: 10,
  DEF: 10,
  default: 15,
};

const isNumericId = (value) => /^\d+$/.test(String(value || "").trim());

export default function PlayerPage() {
  const { playerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef(false);
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext();
  const isDev = import.meta.env.DEV;
  const [selectedSeason, setSelectedSeason] = useState("");
  const [weeklyRows, setWeeklyRows] = useState([]);
  const [careerWeeklyRows, setCareerWeeklyRows] = useState([]);
  const [search, setSearch] = useState("");
  const [fantasyExpanded, setFantasyExpanded] = useState(true);
  const [nflExpanded, setNflExpanded] = useState(true);
  const { favorites, togglePlayer } = useFavorites();

  const canonicalPlayerId = useMemo(
    () => getCanonicalPlayerId(playerId, { row: { espn_id: playerId, player_id: playerId }, playerIndex }),
    [playerId, playerIndex],
  );
  const resolvedPlayerId = canonicalPlayerId || String(playerId);
  const isFavorite = favorites.players.includes(String(resolvedPlayerId));

  const formatAmount = (entry) => {
    if (Number(selectedSeason) !== 2025) return "—";
    if (entry?.type !== "add" && entry?.type !== "trade") return "—";
    const numeric = Number(entry?.amount);
    if (!Number.isFinite(numeric)) return "—";
    return `$${numeric}`;
  };

  const formatDollarValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    return `$${numeric}`;
  };

  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const paramName = searchParams.get("name") || "";

  const updateSearchParams = (nextSeason) => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    setSearchParams(params, { replace: true });
    writeStorage(PLAYER_PREF_KEY, { season: nextSeason });
  };

  const handleSeasonChange = (value) => {
    const nextSeason = Number(value);
    setSelectedSeason(nextSeason);
    updateSearchParams(nextSeason);
  };

  const playerInfo = useMemo(() => {
    const candidates = [resolvedPlayerId, playerId].filter(Boolean);
    for (const id of candidates) {
      if (playerIdLookup.byUid.has(String(id))) {
        return playerIdLookup.byUid.get(String(id));
      }
      const uid =
        playerIdLookup.bySleeper.get(String(id)) ||
        playerIdLookup.byEspn.get(String(id));
      if (uid) return playerIdLookup.byUid.get(uid) || null;
    }
    return null;
  }, [playerIdLookup, resolvedPlayerId, playerId]);

  const targetIds = useMemo(() => {
    const ids = new Set();
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
  });

  useEffect(() => {
    if (!weekLineups.length || !targetIds.size) return;
    const rows = [];
    for (const payload of weekLineups) {
      if (!payload?.lineups) continue;
      for (const row of payload.lineups) {
        const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) {
          rows.push({ ...row, season: selectedSeason, week: payload.week });
        }
      }
    }
    setWeeklyRows(prev => {
      const sorted = rows.sort((a, b) => a.week - b.week);
      return JSON.stringify(prev) === JSON.stringify(sorted) ? prev : sorted;
    });
  }, [weekLineups, targetIds, selectedSeason]);

  const targetNames = useMemo(() => {
    const espnName = espnNameMap?.[String(resolvedPlayerId)];
    return [playerInfo?.full_name, playerInfo?.display_name, playerInfo?.name, paramName, espnName]
      .map(normalizeName)
      .filter(Boolean);
  }, [playerInfo, paramName, espnNameMap, resolvedPlayerId]);

  const transactionHistory = useMemo(() => {
    if (!playerTransactions.length) return [];
    const rows = [];
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

  const keeperInfo = useMemo(() => {
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
  }, [transactionHistory]);

  const formatTransactionDetails = (entry) => {
    if (!entry?.players?.length) return entry?.summary || "No details";
    const names = (list) =>
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

  const statsNameRow = useMemo(() => {
    const tryFind = (rows) =>
      rows.find((row) => {
        const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) => String(value || ""));
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(row?.display_name || row?.player_display_name || row?.player_name);
        return name && targetNames.includes(name);
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

  const playerInfoWithStats = useMemo(() => {
    if (!statsNameRow) {
      if (playerInfo) return playerInfo;
      const fallback = { player_id: resolvedPlayerId };
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

  const resolvedName = useMemo(() => {
    return resolvePlayerName(playerInfoWithStats, playerIndex, espnNameMap);
  }, [playerInfoWithStats, playerIndex, espnNameMap]);

  const playerDisplay = useMemo(() => {
    return resolvePlayerDisplay(resolvedPlayerId, { row: playerInfoWithStats, playerIndex, espnNameMap });
  }, [resolvedPlayerId, playerInfoWithStats, playerIndex, espnNameMap]);

  const displayName = playerDisplay.name || resolvedName;
  const displayPosition = playerDisplay.position || playerInfo?.position || "Position —";
  const displayTeam = playerDisplay.team || playerInfo?.nfl_team || "Team —";

  const seasonStats = useMemo(() => {
    const stats = [];
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
        return name && targetNames.includes(name);
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
  }, [statsSeasonSummaries, seasonSummaries, targetIds, targetNames, playerInfo, resolvedName]);

  const careerTotals = useMemo(() => {
    if (careerStats.length) {
      const row = careerStats.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id, item?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(item?.display_name || item?.player_display_name || item?.player_name);
        return name && targetNames.includes(name);
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

  const matchesPlayer = (row) => {
    const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) => String(value || ""));
    if (ids.some((value) => targetIds.has(value))) return true;
    if (!targetNames.length) return false;
    const name = normalizeName(row?.display_name || row?.player_display_name || row?.player_name);
    return name && targetNames.includes(name);
  };

  const availableSeasons = useMemo(() => {
    const seen = new Set();
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
  }, [statsSeasonSummaries, careerWeeklyRows, statsWeeklyRows, seasons, targetIds, targetNames]);

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
      const stored = readStorage(PLAYER_PREF_KEY, {});
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

  const findMetricsRow = (rows) => {
    if (!rows?.length) return null;
    return (
      rows.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id, item?.espn_id].map((value) =>
          String(value || ""),
        );
        if (ids.some((value) => targetIds.has(value))) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(item?.display_name || item?.player_display_name || item?.player_name);
        return name && targetNames.includes(name);
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

  const normalizedMetrics = useMemo(() => {
    if (!statsWeeklyRows.length) return [];
    const hasWar = statsWeeklyRows.some((row) => row.war_rep != null);
    const hasDelta = statsWeeklyRows.some((row) => row.delta_to_next != null);
    const cutoffs = { QB: 16, RB: 24, WR: 24, TE: 16, K: 8, DEF: 8 };
    const grouped = new Map();
    const rows = statsWeeklyRows.map((row) => ({
      ...row,
      points: safeNumber(row.points ?? row.fantasy_points_custom_week ?? row.fantasy_points_custom),
      position: String(row.position || "").toUpperCase(),
    }));
    for (const row of rows) {
      const key = `${row.season}-${row.week}-${row.position}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    const careerRows = [];
    for (const summary of statsSeasonSummaries) {
      if (summary?.rows) careerRows.push(...summary.rows);
    }
    const finalCareerRows = careerRows.filter(matchesPlayer);
    setCareerWeeklyRows(finalCareerRows);

    for (const group of grouped.values()) {
      group.sort((a, b) => safeNumber(b.points) - safeNumber(a.points));
      const cutoff = cutoffs[group[0]?.position];
      const baselineIndex = cutoff ? Math.min(cutoff - 1, group.length - 1) : null;
      const baseline = baselineIndex != null ? safeNumber(group[baselineIndex].points) : 0;
      group.forEach((row, index) => {
        const nextPoints = group[index + 1] ? safeNumber(group[index + 1].points) : 0;
        if (!hasDelta) row.delta_to_next = row.delta_to_next ?? row.points - nextPoints;
        row.replacement_baseline = row.replacement_baseline ?? baseline;
        if (!hasWar) row.war_rep = row.war_rep ?? row.points - baseline;
        row.pos_week_rank = row.pos_week_rank ?? index + 1;
      });
    }
    return rows;
  }, [statsWeeklyRows]);

  const metricsForPlayer = useMemo(() => {
    return normalizedMetrics.filter(matchesPlayer);
  }, [normalizedMetrics, targetIds, playerInfo]);

  const weeklyDisplayRows = useMemo(() => {
    const lineupByWeek = new Map(weeklyRows.map((row) => [Number(row.week), row]));
    const metricsByWeek = new Map(metricsForPlayer.map((row) => [Number(row.week), row]));
    const weeks = Array.from(new Set([...lineupByWeek.keys(), ...metricsByWeek.keys()])).filter((w) => w >= 1 && w <= 18);
    return weeks
      .sort((a, b) => a - b)
      .map((week) => {
        const lineup = lineupByWeek.get(week);
        const metrics = metricsByWeek.get(week);
        return {
          season: metrics?.season || lineup?.season || selectedSeason,
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

  const filteredWeeklyRows = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return weeklyDisplayRows;
    return weeklyDisplayRows.filter((row) => String(row.nflTeam || "").toLowerCase().includes(query));
  }, [weeklyDisplayRows, search]);

  const filteredFullStatsRows = useMemo(() => {
    if (!fullStatsRows.length) return [];
    return fullStatsRows.filter(matchesPlayer);
  }, [fullStatsRows, targetIds, playerInfo]);

  const fullStatsColumns = useMemo(() => {
    const position =
      String(playerInfo?.position || statsNameRow?.position || displayPosition || "")
        .toUpperCase()
        .trim() || "FLEX";
    const rows = filteredFullStatsRows;
    const hasCol = (key) => rows.some((row) => row?.[key] != null);
    const columnsByPosition = {
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

  const resolveFullStatValue = (row, column) => {
    const get = (key) => safeNumber(row?.[key]);
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
    const value = row?.[column.key];
    return value == null || value === "" ? "—" : value;
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
      const rows = [];
      for (const payload of payloads) {
        const seasonRows = payload?.rows || payload || [];
        for (const row of seasonRows) {
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

  const boomBust = useMemo(() => {
    const rows = careerWeeklyRows.length ? careerWeeklyRows : weeklyDisplayRows;
    if (!rows.length) return null;
    const points = rows.map((row) => safeNumber(row.points));
    const mean = points.reduce((sum, value) => sum + value, 0) / points.length;
    const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / points.length;
    const stdDev = Math.sqrt(variance);
    const threshold = THRESHOLDS[playerInfo?.position] || THRESHOLDS.default;
    const above = points.filter((value) => value >= threshold).length;
    const percentAbove = (above / points.length) * 100;
    const sorted = rows.slice().sort((a, b) => safeNumber(b.points) - safeNumber(a.points));
    return {
      stdDev,
      threshold,
      percentAbove,
      topWeeks: sorted.slice(0, 5),
      bottomWeeks: sorted.slice(-5).reverse(),
    };
  }, [careerWeeklyRows, weeklyDisplayRows, playerInfo]);

  const boomBustFromMetrics = useMemo(() => {
    if (!boomBustMetrics.length) return null;
    return boomBustMetrics.find((row) => {
      const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id, row?.espn_id].map((value) => String(value || ""));
      return ids.some((value) => targetIds.has(value));
    });
  }, [boomBustMetrics, targetIds]);

  const boomBustWeeks = useMemo(() => {
    if (!boomBust) return { top: [], bottom: [] };
    return { top: boomBust.topWeeks || [], bottom: boomBust.bottomWeeks || [] };
  }, [boomBust]);

  const consistencyLabel = useMemo(() => {
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
      {/* Hero Section */}
      <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-8 p-6 md:p-8 isolate shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-700/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 -z-10" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 -z-10" />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 items-center relative z-10">
          <div className="flex flex-col gap-6 text-center lg:text-left">
            <div>
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-tighter leading-none">
                  {megaProfile?.nfl?.bio?.display_name || megaProfile?.fantasy?.name || displayName}
                  <span className="text-accent-500 text-6xl leading-none">.</span>
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full hover:bg-white/10 text-white/50 hover:text-white"
                  onClick={() => togglePlayer(resolvedPlayerId)}
                >
                  <Heart className={isFavorite ? "fill-red-500 text-red-500" : ""} size={28} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-lg font-medium text-ink-300">
                <span className="text-white font-bold">{megaProfile?.nfl?.bio?.position || displayPosition}</span>
                <span>•</span>
                <span>{megaProfile?.nfl?.bio?.latest_team || displayTeam}</span>
                {(megaProfile?.fantasy?.age || playerInfo?.age) && (
                  <>
                    <span>•</span>
                    <span>{megaProfile?.fantasy?.age || playerInfo.age} Years Old</span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-y-4 gap-x-8 max-w-lg mx-auto lg:mx-0 pt-4 border-t border-white/10">
              <div>
                <div className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-1 text-ink-300">Height</div>
                <div className="text-xl font-display font-bold">
                  {megaProfile?.nfl?.bio?.height
                    ? `${Math.floor(megaProfile.nfl.bio.height / 12)}'${megaProfile.nfl.bio.height % 12}"`
                    : megaProfile?.fantasy?.height || playerInfo?.height || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-1 text-ink-300">Weight</div>
                <div className="text-xl font-display font-bold">
                  {megaProfile?.nfl?.bio?.weight
                    ? `${megaProfile.nfl.bio.weight} lbs`
                    : (megaProfile?.fantasy?.weight || playerInfo?.weight ? `${megaProfile?.fantasy?.weight || playerInfo.weight} lbs` : "—")}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-1 text-ink-300">College</div>
                <div className="text-xl font-display font-bold truncate">
                  {megaProfile?.nfl?.bio?.college_name || megaProfile?.fantasy?.college || playerInfo?.college || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-1 text-ink-300">Experience</div>
                <div className="text-xl font-display font-bold">
                  {megaProfile?.nfl?.bio?.years_of_experience != null
                    ? `${megaProfile.nfl.bio.years_of_experience} Years`
                    : (playerInfo?.years_exp != null ? `${playerInfo.years_exp} Years` : "Rookie")}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-1 text-ink-300">Draft</div>
                <div className="text-xl font-display font-bold text-white/80">
                  {megaProfile?.nfl?.bio?.draft_year
                    ? `${megaProfile.nfl.bio.draft_year} R${megaProfile.nfl.bio.draft_round} P${megaProfile.nfl.bio.draft_pick}`
                    : (playerInfo?.draft_year ? `${playerInfo.draft_year}` : "Undrafted")}
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center order-first lg:order-none mb-4 lg:mb-0">
            <div className="w-48 h-48 md:w-64 md:h-64 lg:w-72 lg:h-72 rounded-full border-4 border-white/10 shadow-2xl overflow-hidden bg-ink-800 relative group">
              {(megaProfile?.nfl?.bio?.headshot || playerDisplay.headshotUrl) ? (
                <img
                  src={megaProfile?.nfl?.bio?.headshot || playerDisplay.headshotUrl}
                  alt={displayName}
                  className="w-full h-full object-cover scale-110 group-hover:scale-105 transition-transform duration-700"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-700">
                  <Heart size={64} className="opacity-20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-6 justify-center">
            <div className="bg-white/5 rounded-2xl p-5 border border-white/5 backdrop-blur-sm">
              <div className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                <span>Season Performance</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSeason}
                    onChange={(e) => handleSeasonChange(e.target.value)}
                    className="bg-ink-900 border border-white/10 text-white text-xs rounded px-2 py-1 font-bold focus:outline-none focus:ring-1 focus:ring-accent-500"
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
                const currentStats = seasonStats.find(s => Number(s.season) === Number(selectedSeason)) || {};
                return (
                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-medium text-ink-300">Total Points</span>
                        <span className="text-2xl font-display font-bold text-accent-400">{formatPoints(currentStats.points) || "—"}</span>
                      </div>
                      <div className="h-2 w-full bg-ink-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-500 rounded-full"
                          style={{ width: `${Math.min((safeNumber(currentStats.points) / 300) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-medium text-ink-300">Avg Points / Game</span>
                        <span className="text-2xl font-display font-bold text-blue-400">
                          {currentStats.games ? (safeNumber(currentStats.points) / currentStats.games).toFixed(1) : "—"}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-ink-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(((safeNumber(currentStats.points) / (currentStats.games || 1)) / 25) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="bg-ink-900/50 rounded-lg p-3 text-center border border-white/5">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-1">Games Played</div>
                        <div className="text-xl font-bold font-mono">{currentStats.games || 0}</div>
                      </div>
                      <div className="bg-ink-900/50 rounded-lg p-3 text-center border border-white/5">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-1">Pos Rank</div>
                        <div className="text-xl font-bold font-mono text-ink-300">#{currentStats.positionRank || "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* FANTASY DATA SECTION */}
      <Card className="mb-8 shadow-xl border-2 border-accent-200 bg-gradient-to-br from-accent-50/30 to-white">
        <CardHeader
          className="cursor-pointer hover:bg-accent-50/50 transition-colors rounded-t-lg"
          onClick={() => setFantasyExpanded(!fantasyExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-accent-500 rounded-xl">
                <Trophy className="text-white" size={28} />
              </div>
              <div>
                <CardTitle className="text-2xl font-display">Fantasy Data</CardTitle>
                <CardDescription className="text-sm">Performance, Transactions, and Analytics</CardDescription>
              </div>
            </div>
            {fantasyExpanded ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
          </div>
        </CardHeader>

        {fantasyExpanded && (
          <CardContent className="space-y-8 pt-6">
            {/* Career Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-soft bg-accent-50/20 border-accent-100">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Star className="text-accent-600" size={16} />
                    <span className="text-xs font-bold text-accent-700 uppercase tracking-wider">Career Points</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display text-accent-900">{formatPoints(careerTotals.points)}</div>
                  <p className="text-xs text-accent-600 mt-1">{careerTotals.games} games · {careerTotals.seasons} seasons</p>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="text-ink-500" size={16} />
                    <span className="text-xs font-bold text-ink-500 uppercase tracking-wider">Avg Points</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display text-ink-900">
                    {careerTotals.games > 0 ? (careerTotals.points / careerTotals.games).toFixed(1) : "0.0"}
                  </div>
                  <p className="text-xs text-ink-400 mt-1">Points per game</p>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="text-ink-500" size={16} />
                    <span className="text-xs font-bold text-ink-500 uppercase tracking-wider">Consistency</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className="text-3xl font-display text-ink-900">{consistencyLabel || "—"}</div>
                    {consistencyLabel && (
                      <Badge variant={consistencyLabel === "High" ? "success" : consistencyLabel === "Medium" ? "accent" : "destructive"}>
                        {consistencyLabel === "High" ? "TOP" : consistencyLabel === "Medium" ? "STABLE" : "VOLATILE"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-400 mt-1">{boomBust?.stdDev ? `Std Dev: ${boomBust.stdDev.toFixed(1)}` : "No data"}</p>
                </CardContent>
              </Card>

              <Card className="shadow-soft bg-ink-900 text-white border-none">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="text-accent-400" size={16} />
                    <span className="text-xs font-bold text-ink-300 uppercase tracking-wider">Career WAR</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display text-accent-400">{formatPoints(careerTotals.war)}</div>
                  <p className="text-xs text-ink-400 mt-1">Value over replacement</p>
                </CardContent>
              </Card>
            </div>

            {/* Season by Season Table */}
            <Card className="shadow-soft">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="text-accent-600" size={20} />
                  <CardTitle>Season-by-Season Totals</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {seasonStats.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-ink-100">
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Season</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Games</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Total Points</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Pos Rank</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">WAR</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {seasonStats.map((row) => (
                          <tr key={row.season} className="hover:bg-ink-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-ink-900">{row.season}</td>
                            <td className="py-3 px-4 text-ink-600">{row.games}</td>
                            <td className="py-3 px-4 font-mono font-bold text-accent-700">{formatPoints(row.points)}</td>
                            <td className="py-3 px-4">
                              {row.position && row.positionRank ? (
                                <span className="text-sm font-bold text-ink-800">{row.position}{row.positionRank}</span>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-4 font-mono text-ink-600">{formatPoints(row.war)}</td>
                            <td className="py-3 px-4 font-mono text-ink-400">{formatPoints(row.delta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-ink-500 italic">No season totals available</div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Log */}
            <Card className="shadow-soft">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="text-accent-600" size={20} />
                    <CardTitle>Weekly Performance Log</CardTitle>
                  </div>
                  <SearchBar value={search} onChange={setSearch} placeholder="Filter by team..." />
                </div>
              </CardHeader>
              <CardContent>
                {weeklyDisplayRows.length ? (
                  <div className="overflow-x-auto" ref={weeklyVirtual.containerRef}>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-ink-100">
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Week</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">NFL Team</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Fantasy Team</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Starter</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Points</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">WAR</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Pos Rank</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {weeklyVirtual.topPadding ? (
                          <tr aria-hidden="true">
                            <td colSpan={7} style={{ height: weeklyVirtual.topPadding }} />
                          </tr>
                        ) : null}
                        {visibleWeeklyRows.map((row, idx) => (
                          <tr key={`${row.week}-${idx}`} className="hover:bg-ink-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-ink-900">W{row.week}</td>
                            <td className="py-3 px-4 text-sm text-ink-600">{row.nflTeam || "—"}</td>
                            <td className="py-3 px-4 text-sm font-medium text-ink-800">{row.fantasyTeam || "—"}</td>
                            <td className="py-3 px-4">
                              {row.started ? (
                                <Badge variant="success" className="text-[10px]">Starter</Badge>
                              ) : (
                                <span className="text-xs text-ink-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-accent-700">{formatPoints(row.points)}</td>
                            <td className="py-3 px-4 font-mono text-xs text-ink-600">{row.war_rep != null ? formatPoints(row.war_rep) : "—"}</td>
                            <td className="py-3 px-4">
                              {row.position && row.pos_week_rank ? (
                                <span className="text-xs font-bold text-ink-700">{row.position}{row.pos_week_rank}</span>
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
                  <div className="text-center py-8 text-ink-500 italic">No weekly data available for this season</div>
                )}
              </CardContent>
            </Card>

            {/* Boom/Bust Analysis */}
            <Card className="shadow-soft bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-blue-600" size={20} />
                  <CardTitle>Boom/Bust Analysis</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {boomBustFromMetrics || boomBust ? (
                  <>
                    <div className="flex flex-wrap gap-2 mb-6">
                      <Badge variant="outline">
                        Std dev: {formatPoints(boomBustFromMetrics?.fp_std ?? boomBust?.stdDev)}
                      </Badge>
                      {consistencyLabel && <Badge variant="secondary">Consistency: {consistencyLabel}</Badge>}
                      <Badge variant="accent">
                        % weeks ≥ {boomBust?.threshold ?? THRESHOLDS.default} pts:{" "}
                        {(boomBustFromMetrics?.boom_pct
                          ? boomBustFromMetrics.boom_pct * 100
                          : boomBust?.percentAbove || 0
                        ).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp size={16} className="text-green-600" />
                            Top 5 Weeks
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {boomBustWeeks.top.map((row, idx) => (
                              <li key={`top-${idx}`} className="text-sm flex justify-between">
                                <span>Week {row.week} ({row.season || selectedSeason})</span>
                                <span className="font-bold text-accent-700">{formatPoints(row.points)} pts</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingDown size={16} className="text-red-600" />
                            Bottom 5 Weeks
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {boomBustWeeks.bottom.map((row, idx) => (
                              <li key={`bottom-${idx}`} className="text-sm flex justify-between text-ink-500">
                                <span>Week {row.week} ({row.season || selectedSeason})</span>
                                <span className="font-bold">{formatPoints(row.points)} pts</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-ink-500 italic">
                    No weekly data available to compute boom/bust metrics
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transactions & Keeper */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-soft">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="text-accent-600" size={20} />
                    <CardTitle>Transaction History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {transactionHistory.length ? (
                    <div className="space-y-4">
                      {transactionHistory.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="flex items-start gap-4 p-3 rounded-lg border border-ink-100 bg-ink-50/30">
                          <div className="flex flex-col items-center min-w-[60px]">
                            <span className="text-[10px] font-bold text-ink-400 uppercase">{entry.season}</span>
                            <span className="text-xl font-display text-ink-900">W{entry.week}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={entry.type === "trade" ? "secondary" : entry.type === "add" ? "success" : "destructive"}>
                                {entry.type.toUpperCase()}
                              </Badge>
                              <span className="text-sm font-bold text-ink-800">{normalizeOwnerName(entry.team)}</span>
                            </div>
                            <p className="text-sm text-ink-600">{formatTransactionDetails(entry)}</p>
                          </div>
                          {entry.amount != null && (
                            <div className="font-mono text-sm font-bold text-accent-700">
                              {formatAmount(entry)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-ink-500 italic py-4 text-center border-2 border-dashed rounded-lg border-ink-100">
                      No transactions recorded
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-soft bg-accent-50/10 border-accent-100/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <DollarSign className="text-accent-600" size={20} />
                    <CardTitle className="text-lg">Keeper Value (2025)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Projected Value</div>
                      <div className="text-4xl font-display text-accent-700">{formatDollarValue(keeperInfo.value)}</div>
                      <p className="text-xs text-ink-500 mt-2 leading-relaxed">{keeperInfo.note}</p>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded text-[11px] text-amber-800 italic">
                      Keeper values: <strong>Added Value + $5 Inflation</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        )}
      </Card>

      {/* NFL DATA SECTION */}
      <Card className="mb-8 shadow-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/30 to-white">
        <CardHeader
          className="cursor-pointer hover:bg-blue-50/50 transition-colors rounded-t-lg"
          onClick={() => setNflExpanded(!nflExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 rounded-xl">
                <Award className="text-white" size={28} />
              </div>
              <div>
                <CardTitle className="text-2xl font-display">NFL Data</CardTitle>
                <CardDescription className="text-sm">Biography, Draft Info, and Game Stats</CardDescription>
              </div>
            </div>
            {nflExpanded ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
          </div>
        </CardHeader>

        {nflExpanded && (
          <CardContent className="space-y-8 pt-6">
            {/* Bio & Draft Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle>NFL Bio & Draft</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-ink-400">Full Name</label>
                      <div className="text-lg font-medium">{megaProfile?.nfl?.bio?.display_name || displayName}</div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-ink-400">Status</label>
                      <div className="text-lg font-medium">{megaProfile?.nfl?.bio?.status || "Active"}</div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-ink-400">Draft Year</label>
                      <div className="text-lg font-medium">{megaProfile?.nfl?.bio?.draft_year || "Undrafted"}</div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-ink-400">Draft Position</label>
                      <div className="text-lg font-medium">
                        {megaProfile?.nfl?.bio?.draft_round ? `Round ${megaProfile.nfl.bio.draft_round}, Pick ${megaProfile.nfl.bio.draft_pick}` : "—"}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-ink-400">College</label>
                    <div className="text-lg font-medium">{megaProfile?.nfl?.bio?.college_name || playerInfo?.college || "—"}</div>
                  </div>
                  {megaProfile?.nfl?.bio?.gsis_id && (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-ink-400">GSIS ID</label>
                      <div className="font-mono text-sm text-ink-500">{megaProfile.nfl.bio.gsis_id}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle>Sportradar Context</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {megaProfile?.nfl?.sportradar?.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-ink-50 rounded-lg border border-ink-100">
                        <div className="p-3 bg-white rounded-full border border-ink-200 font-bold text-ink-700">
                          {megaProfile.nfl.sportradar._team_alias}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-ink-400 uppercase">Current Team</div>
                          <div className="text-lg font-bold">{megaProfile.nfl.sportradar._team_alias} Roster</div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-ink-400">Sportradar Status</label>
                        <div className="text-sm">{megaProfile.nfl.sportradar.status || "Active"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-ink-400 italic">
                      Sportradar mapping not found
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Full Stats Table */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Complete Game Stats ({selectedSeason})</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredFullStatsRows.length ? (
                  <div className="overflow-x-auto" ref={fullStatsVirtual.containerRef}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink-100">
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase">Week</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase">Team</th>
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase">Opp</th>
                          {fullStatsColumns.map((column) => (
                            <th key={column.label} className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase">{column.label}</th>
                          ))}
                          <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {fullStatsVirtual.topPadding ? (
                          <tr aria-hidden="true">
                            <td colSpan={4 + fullStatsColumns.length} style={{ height: fullStatsVirtual.topPadding }} />
                          </tr>
                        ) : null}
                        {visibleFullStatsRows.map((row, idx) => (
                          <tr key={`${row.week}-${idx}`} className="hover:bg-ink-50/30 transition-colors">
                            <td className="py-3 px-4 font-bold text-ink-900">W{row.week}</td>
                            <td className="py-3 px-4 text-xs font-medium text-ink-600 uppercase">{row.team || "—"}</td>
                            <td className="py-3 px-4 text-xs text-ink-400">vs {row.opponent_team || "—"}</td>
                            {fullStatsColumns.map((column) => (
                              <td key={`${column.key}-${idx}`} className="py-3 px-4 font-mono text-sm text-ink-700">{resolveFullStatValue(row, column)}</td>
                            ))}
                            <td className="py-3 px-4 font-mono font-bold text-accent-700">
                              {row.fantasy_points_custom_week_with_bonus ??
                                row.fantasy_points_custom_week ??
                                row.fantasy_points_ppr ??
                                row.fantasy_points ??
                                "—"}
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
                  <div className="text-center py-8 text-ink-500 italic">No full stats available for this season</div>
                )}
              </CardContent>
            </Card>

            {/* Vegas Odds */}
            <Card className="shadow-soft border-accent-100 bg-accent-50/5">
              <CardHeader>
                <CardTitle>Vegas Odds (2025 Market)</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const team = megaProfile?.nfl?.bio?.latest_team;
                  if (!team || !nflSiloMeta?.odds) return <div className="text-center py-4 text-ink-500 italic">No market data available for 2025</div>;

                  const gameId = Object.keys(nflSiloMeta.odds).find(gid => {
                    const game = nflSiloMeta.odds[gid]?.game;
                    return game?.home?.alias === team || game?.away?.alias === team;
                  });

                  const odds = nflSiloMeta.odds[gameId];
                  if (!odds) return <div className="text-center py-4 text-ink-500 italic">No 2025 odds found for {team}</div>;

                  const game = odds.game;
                  const consensus = odds.consensus;

                  return (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-ink-900 text-white rounded-xl">
                        <div className="text-center px-4">
                          <div className="text-xs font-bold text-ink-400 uppercase mb-1">Away</div>
                          <div className="text-2xl font-black">{game.away.alias}</div>
                        </div>
                        <div className="text-accent-500 font-display font-black text-2xl">AT</div>
                        <div className="text-center px-4">
                          <div className="text-xs font-bold text-ink-400 uppercase mb-1">Home</div>
                          <div className="text-2xl font-black">{game.home.alias}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg bg-white border border-ink-100 text-center">
                          <div className="text-xs font-bold text-ink-400 uppercase mb-2">Moneyline</div>
                          <div className="flex justify-around">
                            <div className="font-mono font-bold text-accent-700">{consensus?.moneyline?.away_plus_minus || "—"}</div>
                            <div className="font-mono font-bold text-accent-700">{consensus?.moneyline?.home_plus_minus || "—"}</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-lg bg-white border border-ink-100 text-center">
                          <div className="text-xs font-bold text-ink-400 uppercase mb-2">Spread</div>
                          <div className="flex justify-around">
                            <div className="font-mono font-bold text-blue-600">{consensus?.spread?.away_spread_plus_minus || "—"}</div>
                            <div className="font-mono font-bold text-blue-600">{consensus?.spread?.home_spread_plus_minus || "—"}</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-lg bg-white border border-ink-100 text-center">
                          <div className="text-xs font-bold text-ink-400 uppercase mb-2">Total (O/U)</div>
                          <div className="font-mono font-bold text-ink-900">{consensus?.total?.over_under || "—"}</div>
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

      {/* WAR Definitions Footer */}
      <Card className="mt-12 bg-ink-50/20 border-ink-100">
        <CardHeader>
          <CardTitle className="text-lg">WAR Definitions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ink-600 space-y-4">
          <p>
            <strong className="text-ink-900">Replacement-level WAR</strong> is your weekly points minus a replacement baseline for your position.
            In this league, baselines assume 8 teams (2QB, 3RB, 3WR, 2TE).
          </p>
          <p>
            <strong className="text-ink-900">Delta to next guy</strong> is the margin to the next best player at the same position in a given week.
          </p>
          <div className="p-4 bg-white rounded-lg border border-ink-100">
            <span className="font-bold text-ink-900 block mb-2">Baseline examples (8-team league):</span>
            <p>
              The baseline is the points scored by the last starter in the league at each position:
              <span className="font-mono text-accent-700 ml-2">QB16 · RB24 · WR24 · TE16 · K8 · DEF8</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
