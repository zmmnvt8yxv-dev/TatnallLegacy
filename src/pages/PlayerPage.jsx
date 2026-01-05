import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import {
  loadBoomBustMetrics,
  loadPlayerStatsCareer,
  loadPlayerStatsFull,
  loadPlayerStatsSeason,
  loadPlayerStatsWeekly,
  loadCareerMetrics,
  loadSeasonMetrics,
  loadSeasonSummary,
  loadWeekData,
} from "../data/loader.js";
import { getCanonicalPlayerId, resolvePlayerDisplay, resolvePlayerName } from "../lib/playerName.js";
import { normalizeName } from "../lib/nameUtils.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { useVirtualRows } from "../utils/useVirtualRows.js";
import { useFavorites } from "../utils/useFavorites.js";
import { readStorage, writeStorage } from "../utils/persistence.js";

const TABS = ["Overview", "Seasons", "Weekly Log", "Full Stats", "Boom/Bust"];
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

const isNumericId = (value) => /^\\d+$/.test(String(value || "").trim());

export default function PlayerPage() {
  const { playerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef(false);
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [seasonSummaries, setSeasonSummaries] = useState([]);
  const [statsSeasonSummaries, setStatsSeasonSummaries] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [weeklyRows, setWeeklyRows] = useState([]);
  const [statsWeeklyRows, setStatsWeeklyRows] = useState([]);
  const [careerWeeklyRows, setCareerWeeklyRows] = useState([]);
  const [fullStatsRows, setFullStatsRows] = useState([]);
  const [careerStats, setCareerStats] = useState([]);
  const [boomBustMetrics, setBoomBustMetrics] = useState([]);
  const [seasonMetrics, setSeasonMetrics] = useState([]);
  const [careerMetrics, setCareerMetrics] = useState([]);
  const [search, setSearch] = useState("");
  const { favorites, togglePlayer } = useFavorites();
  const canonicalPlayerId = useMemo(
    () => getCanonicalPlayerId(playerId, { row: { espn_id: playerId, player_id: playerId }, playerIndex }),
    [playerId, playerIndex],
  );
  const resolvedPlayerId = canonicalPlayerId || String(playerId);
  const isFavorite = favorites.players.includes(String(resolvedPlayerId));

  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const paramName = searchParams.get("name") || "";

  const updateSearchParams = (nextSeason, nextTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    if (nextTab) params.set("tab", nextTab);
    else params.delete("tab");
    setSearchParams(params, { replace: true });
    writeStorage(PLAYER_PREF_KEY, { season: nextSeason, tab: nextTab });
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    updateSearchParams(selectedSeason || seasonOptions[0], value);
  };

  const handleSeasonChange = (value) => {
    const nextSeason = Number(value);
    setSelectedSeason(nextSeason);
    updateSearchParams(nextSeason, activeTab);
  };

  const playerInfo = useMemo(() => {
    const candidates = [resolvedPlayerId, playerId].filter(Boolean);
    for (const id of candidates) {
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

  useEffect(() => {
    let active = true;
    if (!seasons.length) return undefined;
    Promise.all(seasons.map((season) => loadSeasonSummary(season))).then((payloads) => {
      if (active) setSeasonSummaries(payloads.filter(Boolean));
    });
    return () => {
      active = false;
    };
  }, [seasons]);

  useEffect(() => {
    let active = true;
    if (!seasons.length) return undefined;
    Promise.all(seasons.map((season) => loadPlayerStatsSeason(season))).then((payloads) => {
      if (active) setStatsSeasonSummaries(payloads.filter(Boolean));
    });
    return () => {
      active = false;
    };
  }, [seasons]);

  useEffect(() => {
    let active = true;
    loadPlayerStatsCareer().then((payload) => {
      if (active && payload?.rows) setCareerStats(payload.rows);
      if (active && Array.isArray(payload)) setCareerStats(payload);
    });
    loadBoomBustMetrics().then((payload) => {
      if (active && payload?.rows) setBoomBustMetrics(payload.rows);
      if (active && Array.isArray(payload)) setBoomBustMetrics(payload);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedSeason) return undefined;
    loadSeasonMetrics(selectedSeason).then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setSeasonMetrics(rows);
    });
    return () => {
      active = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    let active = true;
    loadCareerMetrics().then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setCareerMetrics(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedSeason) return undefined;
    loadPlayerStatsWeekly(selectedSeason).then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setStatsWeeklyRows(rows);
    });
    return () => {
      active = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    let active = true;
    if (!selectedSeason) return undefined;
    const weeks = manifest?.weeksBySeason?.[String(selectedSeason)] || [];
    Promise.all(weeks.map((week) => loadWeekData(selectedSeason, week))).then((payloads) => {
      if (!active) return;
      const rows = [];
      for (const payload of payloads) {
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
      setWeeklyRows(rows.sort((a, b) => a.week - b.week));
    });
    return () => {
      active = false;
    };
  }, [selectedSeason, targetIds, manifest]);

  useEffect(() => {
    let active = true;
    if (!selectedSeason) return undefined;
    loadPlayerStatsFull(selectedSeason).then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setFullStatsRows(rows);
    });
    return () => {
      active = false;
    };
  }, [selectedSeason]);

  const targetNames = useMemo(() => {
    const espnName = espnNameMap?.[String(resolvedPlayerId)];
    return [playerInfo?.full_name, playerInfo?.display_name, playerInfo?.name, paramName, espnName]
      .map(normalizeName)
      .filter(Boolean);
  }, [playerInfo, paramName, espnNameMap, resolvedPlayerId]);

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
    if (!statsSeasonSummaries.length) return seasons;
    const seen = new Set();
    for (const summary of statsSeasonSummaries) {
      const rows = summary?.rows || [];
      if (!rows.length) continue;
      if (rows.some(matchesPlayer)) {
        const seasonValue = Number(summary?.season);
        if (Number.isFinite(seasonValue)) seen.add(seasonValue);
      }
    }
    return Array.from(seen).sort((a, b) => b - a) || seasons;
  }, [statsSeasonSummaries, seasons, targetIds, targetNames]);

  const seasonOptions = useMemo(
    () => (availableSeasons.length ? availableSeasons : seasons),
    [availableSeasons, seasons],
  );

  useEffect(() => {
    if (!seasonOptions.length) return;
    const nextSeason = seasonOptions[0];
    if (Number(selectedSeason) !== nextSeason) {
      setSelectedSeason(nextSeason);
      updateSearchParams(nextSeason, activeTab);
    }
  }, [seasonOptions]);

  useEffect(() => {
    if (!seasons.length) return;
    const options = availableSeasons.length ? availableSeasons : seasons;
    const paramSeason = Number(searchParams.get("season"));
    if (Number.isFinite(paramSeason) && options.includes(paramSeason) && paramSeason !== Number(selectedSeason)) {
      setSelectedSeason(paramSeason);
    }
    const paramTab = searchParams.get("tab");
    if (paramTab && TABS.includes(paramTab) && paramTab !== activeTab) {
      setActiveTab(paramTab);
    }
  }, [searchParamsString, seasons, selectedSeason, activeTab, availableSeasons]);

  useEffect(() => {
    if (!seasons.length) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const stored = readStorage(PLAYER_PREF_KEY, {});
    const storedSeason = Number(stored?.season);
    const storedTab = stored?.tab;
    const paramSeason = Number(searchParams.get("season"));
    const options = availableSeasons.length ? availableSeasons : seasons;
    let nextSeason = Number.isFinite(paramSeason) && options.includes(paramSeason) ? paramSeason : options[0];
    if (!searchParams.get("season") && Number.isFinite(storedSeason) && options.includes(storedSeason)) {
      nextSeason = storedSeason;
    }
    const paramTab = searchParams.get("tab");
    let nextTab = paramTab && TABS.includes(paramTab) ? paramTab : TABS[0];
    if (!searchParams.get("tab") && storedTab && TABS.includes(storedTab)) {
      nextTab = storedTab;
    }
    setSelectedSeason(nextSeason);
    setActiveTab(nextTab);
    let changed = false;
    if (!searchParams.get("season") && nextSeason) {
      params.set("season", String(nextSeason));
      changed = true;
    }
    if (!searchParams.get("tab") && nextTab) {
      params.set("tab", nextTab);
      changed = true;
    }
    if (changed) setSearchParams(params, { replace: true });
    didInitRef.current = true;
  }, [seasons, searchParams, setSearchParams, availableSeasons]);

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

  const teamHistory = useMemo(() => {
    const teams = new Set();
    const addTeam = (value) => {
      const cleaned = String(value || "").trim();
      if (cleaned && cleaned !== "—") teams.add(cleaned);
    };
    for (const summary of statsSeasonSummaries) {
      const rows = summary?.rows || [];
      for (const row of rows) {
        if (!matchesPlayer(row)) continue;
        addTeam(row.team);
        addTeam(row.nfl_team);
        addTeam(row.team_abbr);
        addTeam(row.team_abbrev);
        addTeam(row.club);
      }
    }
    for (const row of weeklyDisplayRows) {
      addTeam(row.nflTeam);
    }
    return Array.from(teams).sort((a, b) => a.localeCompare(b));
  }, [statsSeasonSummaries, weeklyDisplayRows, targetIds, targetNames]);

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
      setCareerWeeklyRows(rows);
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

  const boomBustBySeason = useMemo(() => {
    if (!careerWeeklyRows.length) return [];
    const grouped = new Map();
    for (const row of careerWeeklyRows) {
      const season = row?.season;
      if (!season) continue;
      if (!grouped.has(season)) grouped.set(season, []);
      grouped.get(season).push(row);
    }
    return Array.from(grouped.entries())
      .map(([season, rows]) => {
        const sorted = rows.slice().sort((a, b) => safeNumber(b.points) - safeNumber(a.points));
        return {
          season,
          top: sorted.slice(0, 3),
          bottom: sorted.slice(-3).reverse(),
        };
      })
      .sort((a, b) => b.season - a.season);
  }, [careerWeeklyRows]);

  const consistencyLabel = useMemo(() => {
    if (boomBustFromMetrics?.consistency_label) return boomBustFromMetrics.consistency_label;
    const stdDev = boomBust?.stdDev;
    if (stdDev == null) return null;
    if (stdDev <= 6) return "High";
    if (stdDev <= 10) return "Medium";
    return "Low";
  }, [boomBustFromMetrics, boomBust]);

  const warDefinitions = (
    <div className="section-card">
      <h3 className="section-title">WAR Definitions</h3>
      <p>
        <strong>Replacement-level WAR</strong> is your weekly points minus a replacement baseline for your position.
        In this league, baselines assume 8 teams (2QB, 3RB, 3WR, 2TE).{" "}
        <strong>Delta to next guy</strong> is the margin to the next best player at the same position in a given week.
        These values appear when weekly metrics exports are provided.
      </p>
      <p>
        <strong>Baseline examples (weekly):</strong> The baseline is the points scored by the last starter in the
        league at each position. With 8 teams, that means QB16, RB24, WR24, TE16, K8, and DEF8. Example: if the QB16
        scored 14.2 points in Week 6, then every QB’s replacement baseline that week is 14.2, so a QB scoring 22.5 has
        WAR of 8.3.
      </p>
    </div>
  );

  if (loading && !seasonSummaries.length && !statsSeasonSummaries.length)
    return <LoadingState label="Loading player profile..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <section>
        <div className="flex-row">
          {playerDisplay?.headshotUrl ? (
            <img
              className="player-headshot"
              src={playerDisplay.headshotUrl}
              alt={`${displayName} headshot`}
              loading="lazy"
            />
          ) : null}
          <div>
            <h1 className="page-title">{displayName}</h1>
            <p className="page-subtitle">
              {displayPosition} · {displayTeam}
            </p>
            <button
              type="button"
              className={`favorite-button ${isFavorite ? "active" : ""}`}
              onClick={() => togglePlayer(resolvedPlayerId)}
            >
              {isFavorite ? "Favorited" : "Add Favorite"}
            </button>
          </div>
        </div>
        <div className="flex-row">
          <div className="tag">Player ID: {resolvedPlayerId}</div>
          <div className="tag">Teams played for: {teamHistory.join(", ") || "No data"}</div>
        </div>
      </section>

      <section className="section-card flex-row">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tag ${activeTab === tab ? "active" : ""}`}
            onClick={() => handleTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </section>

      {activeTab === "Overview" && (
        <section className="section-card">
          <h2 className="section-title">Career Overview</h2>
          {seasonStats.length ? (
            <div className="card-grid">
              <div className="stat-card">
                <div className="stat-label">Seasons</div>
                <div className="stat-value">{careerTotals.seasons}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Games Logged</div>
                <div className="stat-value">{careerTotals.games}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Points</div>
                <div className="stat-value">{formatPoints(careerTotals.points)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Replacement WAR</div>
                <div className="stat-value">{formatPoints(careerTotals.war)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Delta to Next</div>
                <div className="stat-value">{formatPoints(careerTotals.delta)}</div>
              </div>
            </div>
          ) : (
            <div>No season totals available for this player.</div>
          )}
          <div className="section-card">
            <h3 className="section-title">Efficiency (Per Game)</h3>
            {seasonEfficiency || careerEfficiency ? (
              <div className="card-grid">
                {seasonEfficiency ? (
                  <div className="stat-card">
                    <div className="stat-label">Season {selectedSeason}</div>
                    <div className="stat-value">{formatPoints(seasonEfficiency.points_pg)}</div>
                    <div className="stat-subtext">
                      WAR/pg {formatPoints(seasonEfficiency.war_rep_pg)} · Delta/pg{" "}
                      {formatPoints(seasonEfficiency.delta_to_next_pg)}
                    </div>
                  </div>
                ) : null}
                {careerEfficiency ? (
                  <div className="stat-card">
                    <div className="stat-label">Career</div>
                    <div className="stat-value">{formatPoints(careerEfficiency.points_pg)}</div>
                    <div className="stat-subtext">
                      WAR/pg {formatPoints(careerEfficiency.war_rep_pg)} · Delta/pg{" "}
                      {formatPoints(careerEfficiency.delta_to_next_pg)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p>No efficiency data available for this player in the current exports.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "Seasons" && (
        <section className="section-card">
          <h2 className="section-title">Season-by-Season Totals</h2>
          {seasonStats.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Season</th>
                  <th>Games</th>
                  <th>Avail</th>
                  <th>Total Points</th>
                  <th>Pos Rank</th>
                  <th>WAR</th>
                  <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonStats.map((row) => (
                    <tr key={row.season}>
                    <td>{row.season}</td>
                    <td>{row.games}</td>
                    <td>
                      {row.gamesPossible
                        ? `${row.availabilityFlag === "limited" ? "Limited" : "Full"} (${row.games}/${row.gamesPossible})`
                        : "—"}
                    </td>
                    <td>{formatPoints(row.points)}</td>
                      <td>{row.position && row.positionRank ? `${row.position}${row.positionRank}` : "—"}</td>
                      <td>{formatPoints(row.war)}</td>
                      <td>{formatPoints(row.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No season totals available for this player.</div>
          )}
        </section>
      )}

      {activeTab === "Weekly Log" && (
        <section className="section-card">
          <div className="filters filters--sticky">
            <div>
              <label>Season</label>
              <select value={selectedSeason} onChange={(event) => handleSeasonChange(event.target.value)}>
                {seasonOptions.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
            <SearchBar value={search} onChange={setSearch} placeholder="Filter by team..." />
          </div>
          {weeklyDisplayRows.length ? (
            <div className="table-wrap virtual-table" ref={weeklyVirtual.containerRef}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>NFL Team</th>
                    <th>Fantasy Team</th>
                    <th>Starter</th>
                    <th>Points</th>
                    <th>Z-Score</th>
                    <th>WAR</th>
                    <th>Delta</th>
                    <th>Pos Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyVirtual.topPadding ? (
                    <tr className="table-virtual-spacer" aria-hidden="true">
                      <td colSpan={9} style={{ height: weeklyVirtual.topPadding }} />
                    </tr>
                  ) : null}
                  {visibleWeeklyRows.map((row, idx) => (
                    <tr key={`${row.week}-${idx}`}>
                      <td>{row.week}</td>
                      <td>{row.nflTeam || "—"}</td>
                      <td>{row.fantasyTeam || "—"}</td>
                      <td>{row.started ? "Yes" : "—"}</td>
                      <td>{formatPoints(row.points)}</td>
                      <td>{row.pos_week_z ? safeNumber(row.pos_week_z).toFixed(2) : "—"}</td>
                      <td>{row.war_rep != null ? formatPoints(row.war_rep) : "—"}</td>
                      <td>{row.delta_to_next != null ? formatPoints(row.delta_to_next) : "—"}</td>
                      <td>{row.position && row.pos_week_rank ? `${row.position}${row.pos_week_rank}` : "—"}</td>
                    </tr>
                  ))}
                  {weeklyVirtual.bottomPadding ? (
                    <tr className="table-virtual-spacer" aria-hidden="true">
                      <td colSpan={9} style={{ height: weeklyVirtual.bottomPadding }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No weekly data available for this season.</div>
          )}
        </section>
      )}

      {activeTab === "Full Stats" && (
        <section className="section-card">
          <div className="filters filters--sticky">
            <div>
              <label>Season</label>
              <select value={selectedSeason} onChange={(event) => handleSeasonChange(event.target.value)}>
                {seasonOptions.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filteredFullStatsRows.length ? (
            <div className="table-wrap virtual-table" ref={fullStatsVirtual.containerRef}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Week</th>
                    <th>Team</th>
                    <th>Opp</th>
                    {fullStatsColumns.map((column) => (
                      <th key={column.label}>{column.label}</th>
                    ))}
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {fullStatsVirtual.topPadding ? (
                    <tr className="table-virtual-spacer" aria-hidden="true">
                      <td colSpan={5 + fullStatsColumns.length} style={{ height: fullStatsVirtual.topPadding }} />
                    </tr>
                  ) : null}
                  {visibleFullStatsRows.map((row, idx) => (
                    <tr key={`${row.week}-${idx}`}>
                      <td>{row.season || selectedSeason}</td>
                      <td>{row.week}</td>
                      <td>{row.team || "—"}</td>
                      <td>{row.opponent_team || "—"}</td>
                      {fullStatsColumns.map((column) => (
                        <td key={`${column.key}-${idx}`}>{resolveFullStatValue(row, column)}</td>
                      ))}
                      <td>
                        {row.fantasy_points_custom_week_with_bonus ??
                          row.fantasy_points_custom_week ??
                          row.fantasy_points_ppr ??
                          row.fantasy_points ??
                          "—"}
                      </td>
                    </tr>
                  ))}
                  {fullStatsVirtual.bottomPadding ? (
                    <tr className="table-virtual-spacer" aria-hidden="true">
                      <td colSpan={13} style={{ height: fullStatsVirtual.bottomPadding }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No full stat rows available for this player in the selected season.</div>
          )}
        </section>
      )}

      {activeTab === "Boom/Bust" && (
        <section className="section-card">
          <h2 className="section-title">Boom / Bust Summary</h2>
          {boomBustFromMetrics || boomBust ? (
            <>
              <div className="flex-row">
                <div className="tag">
                  Std dev: {formatPoints(boomBustFromMetrics?.fp_std ?? boomBust?.stdDev)}
                </div>
                {consistencyLabel ? <div className="tag">Consistency: {consistencyLabel}</div> : null}
                <div className="tag">
                  % weeks ≥ {boomBust?.threshold ?? THRESHOLDS.default} pts:{" "}
                  {(boomBustFromMetrics?.boom_pct
                    ? boomBustFromMetrics.boom_pct * 100
                    : boomBust?.percentAbove || 0
                  ).toFixed(1)}
                  %
                </div>
              </div>
              <div className="detail-grid">
                <div className="section-card">
                  <h3 className="section-title">Top 5 Weeks</h3>
                  <ul>
                    {boomBustWeeks.top.map((row, idx) => (
                      <li key={`top-${idx}`}>
                        Week {row.week} ({row.season || selectedSeason}) — {formatPoints(row.points)} pts
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="section-card">
                  <h3 className="section-title">Bottom 5 Weeks</h3>
                  <ul>
                    {boomBustWeeks.bottom.map((row, idx) => (
                      <li key={`bottom-${idx}`}>
                        Week {row.week} ({row.season || selectedSeason}) — {formatPoints(row.points)} pts
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {boomBustBySeason.length ? (
                <div className="section-card">
                  <h3 className="section-title">Season Breakouts</h3>
                  {boomBustBySeason.map((season) => (
                    <div key={season.season} className="subtle-text" style={{ marginBottom: "12px" }}>
                      <strong>{season.season}</strong>
                      <div>
                        Top weeks:{" "}
                        {season.top.map((row, idx) => (
                          <span key={`season-top-${season.season}-${idx}`}>
                            Week {row.week} ({formatPoints(row.points)} pts)
                            {idx < season.top.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                      <div>
                        Bottom weeks:{" "}
                        {season.bottom.map((row, idx) => (
                          <span key={`season-bottom-${season.season}-${idx}`}>
                            Week {row.week} ({formatPoints(row.points)} pts)
                            {idx < season.bottom.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div>No weekly data available to compute boom/bust metrics.</div>
          )}
        </section>
      )}

      {warDefinitions}
    </>
  );
}
