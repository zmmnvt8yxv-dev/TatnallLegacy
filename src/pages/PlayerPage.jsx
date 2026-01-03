import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import {
  loadBoomBustMetrics,
  loadCareerMetrics,
  loadSeasonMetrics,
  loadSeasonSummary,
  loadWeekData,
  loadWeeklyMetrics,
} from "../data/loader.js";
import { formatPoints, safeNumber } from "../utils/format.js";

const TABS = ["Overview", "Seasons", "Weekly Log", "Boom/Bust"];

const THRESHOLDS = {
  QB: 20,
  RB: 15,
  WR: 15,
  TE: 12,
  K: 10,
  DEF: 10,
  default: 15,
};

export default function PlayerPage() {
  const { playerId } = useParams();
  const { manifest, loading, error, playerIdLookup } = useDataContext();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [seasonSummaries, setSeasonSummaries] = useState([]);
  const [metricsSeasonSummaries, setMetricsSeasonSummaries] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [weeklyRows, setWeeklyRows] = useState([]);
  const [metricsWeeklyRows, setMetricsWeeklyRows] = useState([]);
  const [careerMetrics, setCareerMetrics] = useState([]);
  const [boomBustMetrics, setBoomBustMetrics] = useState([]);
  const [search, setSearch] = useState("");

  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);

  useEffect(() => {
    if (!selectedSeason && seasons.length) setSelectedSeason(seasons[0]);
  }, [seasons, selectedSeason]);

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
    Promise.all(seasons.map((season) => loadSeasonMetrics(season))).then((payloads) => {
      if (active) setMetricsSeasonSummaries(payloads.filter(Boolean));
    });
    return () => {
      active = false;
    };
  }, [seasons]);

  useEffect(() => {
    let active = true;
    loadCareerMetrics().then((payload) => {
      if (active && payload?.rows) setCareerMetrics(payload.rows);
      if (active && Array.isArray(payload)) setCareerMetrics(payload);
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
    loadWeeklyMetrics(selectedSeason).then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setMetricsWeeklyRows(rows);
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

  const seasonStats = useMemo(() => {
    const stats = [];
    const hasMetrics = metricsSeasonSummaries.length > 0;
    const summaries = hasMetrics ? metricsSeasonSummaries : seasonSummaries;
    for (const summary of summaries) {
      const rows = summary?.rows || summary?.playerSeasonTotals || [];
      const row = rows.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id].map((value) => String(value || ""));
        return ids.includes(String(playerId));
      });
      if (row) {
        stats.push({
          season: summary.season,
          points: row.points ?? row.fantasy_points_custom ?? row.fantasy_points_custom_week,
          games: row.games ?? row.games_played,
          war: row.war_rep ?? row.war_rep_season,
          delta: row.delta_to_next ?? row.delta_to_next_season,
        });
      }
    }
    return stats.sort((a, b) => b.season - a.season);
  }, [metricsSeasonSummaries, seasonSummaries, playerId]);

  const careerTotals = useMemo(() => {
    if (careerMetrics.length) {
      const row = careerMetrics.find((item) => {
        const ids = [item?.sleeper_id, item?.player_id, item?.gsis_id].map((value) => String(value || ""));
        return ids.includes(String(playerId));
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
  }, [seasonStats, careerMetrics, playerId]);

  const matchesPlayer = (row) => {
    const targetId = String(playerId);
    const ids = [row?.sleeper_id, row?.player_id, row?.gsis_id].map((value) => String(value || ""));
    if (ids.includes(targetId)) return true;
    if (playerInfo?.full_name && row?.display_name) {
      return String(row.display_name).toLowerCase() === String(playerInfo.full_name).toLowerCase();
    }
    return false;
  };

  const normalizedMetrics = useMemo(() => {
    if (!metricsWeeklyRows.length) return [];
    const hasWar = metricsWeeklyRows.some((row) => row.war_rep != null);
    const hasDelta = metricsWeeklyRows.some((row) => row.delta_to_next != null);
    if (hasWar && hasDelta) return metricsWeeklyRows;
    const cutoffs = { QB: 16, RB: 24, WR: 24, TE: 16, K: 8, DEF: 8 };
    const grouped = new Map();
    const rows = metricsWeeklyRows.map((row) => ({
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
  }, [metricsWeeklyRows]);

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
          week,
          team: metrics?.team || lineup?.team || "—",
          started: lineup?.started,
          points: metrics?.points ?? metrics?.fantasy_points_custom_week ?? lineup?.points,
          pos_week_z: metrics?.pos_week_z,
          war_rep: metrics?.war_rep,
          delta_to_next: metrics?.delta_to_next,
        };
      });
  }, [weeklyRows, metricsForPlayer]);

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

  const boomBust = useMemo(() => {
    const rows = weeklyDisplayRows;
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
  }, [weeklyDisplayRows, playerInfo]);

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

  if (loading && !seasonSummaries.length && !metricsSeasonSummaries.length)
    return <LoadingState label="Loading player profile..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <section>
        <h1 className="page-title">{playerInfo?.full_name || `Player ${playerId}`}</h1>
        <p className="page-subtitle">
          {playerInfo?.position || "Position —"} · {playerInfo?.nfl_team || "Team —"}
        </p>
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
            onClick={() => setActiveTab(tab)}
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
            <h3 className="section-title">Efficiency</h3>
            <p>No efficiency data available for this player in the current exports.</p>
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
              <select value={selectedSeason} onChange={(event) => setSelectedSeason(Number(event.target.value))}>
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
                        Week {row.week} ({row.season}) — {formatPoints(row.points)} pts
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="section-card">
                  <h3 className="section-title">Bottom 5 Weeks</h3>
                  <ul>
                    {boomBustWeeks.bottom.map((row, idx) => (
                      <li key={`bottom-${idx}`}>
                        Week {row.week} ({row.season}) — {formatPoints(row.points)} pts
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="section-card">
                <h3 className="section-title">WAR Definitions</h3>
                <p>
                  <strong>Replacement-level WAR</strong> is your weekly points minus a replacement baseline for your
                  position. In this league, baselines assume 8 teams (2QB, 3RB, 3WR, 2TE).{" "}
                  <strong>Delta to next guy</strong> is the margin to the next best player at the same position in a
                  given week. These values appear when weekly metrics exports are provided.
                </p>
              </div>
            </>
          ) : (
            <div>No weekly data available to compute boom/bust metrics.</div>
          )}
        </section>
      )}
    </>
  );
}
