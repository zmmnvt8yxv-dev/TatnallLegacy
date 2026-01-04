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
import { resolvePlayerDisplay, resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";

const TABS = ["Overview", "Seasons", "Weekly Log", "Full Stats", "Boom/Bust"];

const THRESHOLDS = {
  QB: 20,
  RB: 15,
  WR: 15,
  TE: 12,
  K: 10,
  DEF: 10,
  default: 15,
};

const normalizeName = (value) => {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
};

export default function PlayerPage() {
  const { playerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef(false);
  const { manifest, loading, error, playerIdLookup, playerIndex } = useDataContext();
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

  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);

  useEffect(() => {
    if (!seasons.length) return;
    const paramSeason = Number(searchParams.get("season"));
    if (Number.isFinite(paramSeason) && seasons.includes(paramSeason) && paramSeason !== Number(selectedSeason)) {
      setSelectedSeason(paramSeason);
    }
    const paramTab = searchParams.get("tab");
    if (paramTab && TABS.includes(paramTab) && paramTab !== activeTab) {
      setActiveTab(paramTab);
    }
  }, [searchParamsString, seasons, selectedSeason, activeTab]);

  useEffect(() => {
    if (!seasons.length) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const paramSeason = Number(searchParams.get("season"));
    const nextSeason = Number.isFinite(paramSeason) && seasons.includes(paramSeason) ? paramSeason : seasons[0];
    const paramTab = searchParams.get("tab");
    const nextTab = paramTab && TABS.includes(paramTab) ? paramTab : TABS[0];
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
  }, [seasons, searchParams, setSearchParams]);

  const updateSearchParams = (nextSeason, nextTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    if (nextTab) params.set("tab", nextTab);
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    updateSearchParams(selectedSeason || seasons[0], value);
  };

  const handleSeasonChange = (value) => {
    const nextSeason = Number(value);
    setSelectedSeason(nextSeason);
    updateSearchParams(nextSeason, activeTab);
  };

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
    const weeks = manifest?.weeksBySeason?.[String(selectedSeason)] || [];
    Promise.all(weeks.map((week) => loadWeekData(selectedSeason, week))).then((payloads) => {
      if (!active) return;
      const rows = [];
      for (const payload of payloads) {
        if (!payload?.lineups) continue;
        for (const row of payload.lineups) {
          if (String(row.player_id) === String(playerId)) {
            rows.push({ ...row, season: selectedSeason, week: payload.week });
          }
        }
      }
      setWeeklyRows(rows.sort((a, b) => a.week - b.week));
    });
    return () => {
      active = false;
    };
  }, [selectedSeason, playerId, manifest]);

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
    loadPlayerStatsFull(selectedSeason).then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setFullStatsRows(rows);
    });
    return () => {
      active = false;
    };
  }, [selectedSeason]);

  const playerInfo = useMemo(() => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    const info = uid ? playerIdLookup.byUid.get(uid) : null;
    return info || null;
  }, [playerIdLookup, playerId]);

  const statsNameRow = useMemo(() => {
    const targetId = String(playerId);
    const tryFind = (rows) =>
      rows.find((row) => {
        const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id].map((value) => String(value || ""));
        return ids.includes(targetId);
      }) || null;
    if (statsWeeklyRows.length) return tryFind(statsWeeklyRows);
    if (fullStatsRows.length) return tryFind(fullStatsRows);
    for (const summary of statsSeasonSummaries) {
      const rows = summary?.rows || [];
      const match = tryFind(rows);
      if (match) return match;
    }
    return null;
  }, [playerId, statsWeeklyRows, fullStatsRows, statsSeasonSummaries]);

  const playerInfoWithStats = useMemo(() => {
    if (!statsNameRow) return playerInfo || { player_id: playerId };
    return {
      player_id: playerId,
      sleeper_id: statsNameRow.sleeper_id || playerInfo?.sleeper_id || playerId,
      display_name: statsNameRow.display_name || statsNameRow.player_display_name || playerInfo?.full_name,
      position: playerInfo?.position || statsNameRow.position,
      nfl_team: playerInfo?.nfl_team || statsNameRow.team,
      ...playerInfo,
    };
  }, [statsNameRow, playerInfo, playerId]);

  const resolvedName = useMemo(() => {
    return resolvePlayerName(playerInfoWithStats, playerIndex);
  }, [playerInfoWithStats, playerIndex]);

  const playerDisplay = useMemo(() => {
    return resolvePlayerDisplay(playerId, { row: playerInfoWithStats, playerIndex });
  }, [playerId, playerInfoWithStats, playerIndex]);

  const displayName = playerDisplay.name || resolvedName;
  const displayPosition = playerDisplay.position || playerInfo?.position || "Position —";
  const displayTeam = playerDisplay.team || playerInfo?.nfl_team || "Team —";

  const seasonStats = useMemo(() => {
    const stats = [];
    const hasStats = statsSeasonSummaries.length > 0;
    const summaries = hasStats ? statsSeasonSummaries : seasonSummaries;
    for (const summary of summaries) {
      const rows = summary?.rows || summary?.playerSeasonTotals || [];
      const targetIds = String(playerId);
      const targetNames = [playerInfo?.full_name, resolvedName].map(normalizeName).filter(Boolean);
      const row = rows.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id].map((value) => String(value || ""));
        if (ids.includes(targetIds)) return true;
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
            ids: [item?.sleeper_id, item?.player_id, item?.gsis_id].map((value) => String(value || "")),
            points: safeNumber(item?.points ?? item?.fantasy_points_custom ?? item?.fantasy_points_custom_week),
          }))
          .sort((a, b) => b.points - a.points);
        const rankIndex = ranked.findIndex((item) => item.ids.includes(targetIds));
        const positionRank = rankIndex >= 0 ? rankIndex + 1 : null;
        stats.push({
          season: summary.season,
          position,
          positionRank,
          points: row.points ?? row.fantasy_points_custom ?? row.fantasy_points_custom_week,
          games: row.games ?? row.games_played,
          war: row.war_rep ?? row.war_rep_season,
          delta: row.delta_to_next ?? row.delta_to_next_season,
        });
      }
    }
    return stats.sort((a, b) => b.season - a.season);
  }, [statsSeasonSummaries, seasonSummaries, playerId, playerInfo, resolvedName]);

  const careerTotals = useMemo(() => {
    if (careerStats.length) {
      const targetIds = String(playerId);
      const targetNames = [playerInfo?.full_name, resolvedName].map(normalizeName).filter(Boolean);
      const row = careerStats.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id].map((value) => String(value || ""));
        if (ids.includes(targetIds)) return true;
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
  }, [seasonStats, careerStats, playerId]);

  const matchesPlayer = (row) => {
    const targetId = String(playerId);
    const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id].map((value) => String(value || ""));
    if (ids.includes(targetId)) return true;
    const targetNames = [playerInfo?.full_name, resolvedName].map(normalizeName).filter(Boolean);
    if (!targetNames.length) return false;
    const name = normalizeName(row?.display_name || row?.player_display_name || row?.player_name);
    return name && targetNames.includes(name);
    return false;
  };

  const findMetricsRow = (rows) => {
    if (!rows?.length) return null;
    const targetIds = String(playerId);
    const targetNames = [playerInfo?.full_name, resolvedName].map(normalizeName).filter(Boolean);
    return (
      rows.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id].map((value) => String(value || ""));
        if (ids.includes(targetIds)) return true;
        if (!targetNames.length) return false;
        const name = normalizeName(item?.display_name || item?.player_display_name || item?.player_name);
        return name && targetNames.includes(name);
      }) || null
    );
  };

  const seasonEfficiency = useMemo(() => findMetricsRow(seasonMetrics), [seasonMetrics, playerId, playerInfo, resolvedName]);
  const careerEfficiency = useMemo(() => findMetricsRow(careerMetrics), [careerMetrics, playerId, playerInfo, resolvedName]);

  const normalizedMetrics = useMemo(() => {
    if (!statsWeeklyRows.length) return [];
    const hasWar = statsWeeklyRows.some((row) => row.war_rep != null);
    const hasDelta = statsWeeklyRows.some((row) => row.delta_to_next != null);
    if (hasWar && hasDelta) return statsWeeklyRows;
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
        row.delta_to_next = row.delta_to_next ?? row.points - nextPoints;
        row.replacement_baseline = row.replacement_baseline ?? baseline;
        row.war_rep = row.war_rep ?? row.points - baseline;
      });
    }
    return rows;
  }, [statsWeeklyRows]);

  const metricsForPlayer = useMemo(() => {
    return normalizedMetrics.filter(matchesPlayer);
  }, [normalizedMetrics, playerId, playerInfo]);

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
          team: metrics?.team || lineup?.team || "—",
          started: lineup?.started,
          points: metrics?.points ?? metrics?.fantasy_points_custom_week ?? lineup?.points,
          pos_week_z: metrics?.pos_week_z,
          war_rep: metrics?.war_rep,
          delta_to_next: metrics?.delta_to_next,
        };
      });
  }, [weeklyRows, metricsForPlayer, selectedSeason]);

  const teamHistory = useMemo(() => {
    const teams = new Set();
    for (const row of weeklyDisplayRows) {
      if (row.team) teams.add(row.team);
    }
    return Array.from(teams);
  }, [weeklyDisplayRows]);

  const filteredWeeklyRows = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return weeklyDisplayRows;
    return weeklyDisplayRows.filter((row) => String(row.team || "").toLowerCase().includes(query));
  }, [weeklyDisplayRows, search]);

  const filteredFullStatsRows = useMemo(() => {
    if (!fullStatsRows.length) return [];
    return fullStatsRows.filter(matchesPlayer);
  }, [fullStatsRows, playerId, playerInfo]);

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
  }, [seasons, playerId, playerInfo, resolvedName]);

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
      const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id].map((value) => String(value || ""));
      return ids.includes(String(playerId));
    });
  }, [boomBustMetrics, playerId]);

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
          </div>
        </div>
        <div className="flex-row">
          <div className="tag">Player ID: {playerId}</div>
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
            <table className="table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Games</th>
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
                    <td>{formatPoints(row.points)}</td>
                    <td>{row.position && row.positionRank ? `${row.position}${row.positionRank}` : "—"}</td>
                    <td>{formatPoints(row.war)}</td>
                    <td>{formatPoints(row.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No season totals available for this player.</div>
          )}
        </section>
      )}

      {activeTab === "Weekly Log" && (
        <section className="section-card">
          <div className="filters">
            <div>
              <label>Season</label>
              <select value={selectedSeason} onChange={(event) => handleSeasonChange(event.target.value)}>
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
            <SearchBar value={search} onChange={setSearch} placeholder="Filter by team..." />
          </div>
          {weeklyDisplayRows.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Team</th>
                  <th>Starter</th>
                  <th>Points</th>
                  <th>Z-Score</th>
                  <th>WAR</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {filteredWeeklyRows.map((row, idx) => (
                  <tr key={`${row.week}-${idx}`}>
                    <td>{row.week}</td>
                    <td>{row.team || "—"}</td>
                    <td>{row.started ? "Yes" : "—"}</td>
                    <td>{formatPoints(row.points)}</td>
                    <td>{row.pos_week_z ? safeNumber(row.pos_week_z).toFixed(2) : "—"}</td>
                    <td>{row.war_rep != null ? formatPoints(row.war_rep) : "—"}</td>
                    <td>{row.delta_to_next != null ? formatPoints(row.delta_to_next) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No weekly data available for this season.</div>
          )}
        </section>
      )}

      {activeTab === "Full Stats" && (
        <section className="section-card">
          <div className="filters">
            <div>
              <label>Season</label>
              <select value={selectedSeason} onChange={(event) => handleSeasonChange(event.target.value)}>
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filteredFullStatsRows.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Week</th>
                  <th>Team</th>
                  <th>Opp</th>
                  <th>Pass Yds</th>
                  <th>Pass TD</th>
                  <th>INT</th>
                  <th>Rush Yds</th>
                  <th>Rush TD</th>
                  <th>Rec</th>
                  <th>Rec Yds</th>
                  <th>Rec TD</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {filteredFullStatsRows.map((row, idx) => (
                  <tr key={`${row.week}-${idx}`}>
                    <td>{row.season || selectedSeason}</td>
                    <td>{row.week}</td>
                      <td>{row.team || "—"}</td>
                      <td>{row.opponent_team || "—"}</td>
                      <td>{row.passing_yards ?? "—"}</td>
                      <td>{row.passing_tds ?? "—"}</td>
                      <td>{row.passing_interceptions ?? "—"}</td>
                      <td>{row.rushing_yards ?? "—"}</td>
                      <td>{row.rushing_tds ?? "—"}</td>
                      <td>{row.receptions ?? "—"}</td>
                      <td>{row.receiving_yards ?? "—"}</td>
                      <td>{row.receiving_tds ?? "—"}</td>
                      <td>{row.fantasy_points_custom_week_with_bonus ?? row.fantasy_points_custom_week ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
