import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadSeasonSummary, loadWeekData } from "../data/loader.js";
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
  const [selectedSeason, setSelectedSeason] = useState("");
  const [weeklyRows, setWeeklyRows] = useState([]);
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

  const playerInfo = useMemo(() => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    const info = uid ? playerIdLookup.byUid.get(uid) : null;
    return info || null;
  }, [playerIdLookup, playerId]);

  const seasonStats = useMemo(() => {
    const stats = [];
    for (const summary of seasonSummaries) {
      const players = summary?.playerSeasonTotals || [];
      const row = players.find((item) => String(item.player_id) === String(playerId));
      if (row) {
        stats.push({
          season: summary.season,
          points: row.points,
          games: row.games,
        });
      }
    }
    return stats.sort((a, b) => b.season - a.season);
  }, [seasonSummaries, playerId]);

  const careerTotals = useMemo(() => {
    return seasonStats.reduce(
      (acc, row) => {
        acc.points += safeNumber(row.points);
        acc.games += safeNumber(row.games);
        acc.seasons += 1;
        return acc;
      },
      { points: 0, games: 0, seasons: 0 },
    );
  }, [seasonStats]);

  const teamHistory = useMemo(() => {
    const teams = new Set();
    for (const row of weeklyRows) {
      if (row.team) teams.add(row.team);
    }
    return Array.from(teams);
  }, [weeklyRows]);

  const filteredWeeklyRows = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return weeklyRows;
    return weeklyRows.filter((row) => String(row.team || "").toLowerCase().includes(query));
  }, [weeklyRows, search]);

  const boomBust = useMemo(() => {
    if (!weeklyRows.length) return null;
    const points = weeklyRows.map((row) => safeNumber(row.points));
    const mean = points.reduce((sum, value) => sum + value, 0) / points.length;
    const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / points.length;
    const stdDev = Math.sqrt(variance);
    const threshold = THRESHOLDS[playerInfo?.position] || THRESHOLDS.default;
    const above = points.filter((value) => value >= threshold).length;
    const percentAbove = (above / points.length) * 100;
    const sorted = weeklyRows.slice().sort((a, b) => safeNumber(b.points) - safeNumber(a.points));
    return {
      stdDev,
      threshold,
      percentAbove,
      topWeeks: sorted.slice(0, 5),
      bottomWeeks: sorted.slice(-5).reverse(),
    };
  }, [weeklyRows, playerInfo]);

  if (loading && !seasonSummaries.length) return <LoadingState label="Loading player profile..." />;
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
                </tr>
              </thead>
              <tbody>
                {seasonStats.map((row) => (
                  <tr key={row.season}>
                    <td>{row.season}</td>
                    <td>{row.games}</td>
                    <td>{formatPoints(row.points)}</td>
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
          {weeklyRows.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Team</th>
                  <th>Starter</th>
                  <th>Points</th>
                  <th>Z-Score</th>
                  <th>WAR</th>
                </tr>
              </thead>
              <tbody>
                {filteredWeeklyRows.map((row, idx) => (
                  <tr key={`${row.week}-${idx}`}>
                    <td>{row.week}</td>
                    <td>{row.team || "—"}</td>
                    <td>{row.started ? "Yes" : "No"}</td>
                    <td>{formatPoints(row.points)}</td>
                    <td>—</td>
                    <td>—</td>
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
          {boomBust ? (
            <>
              <div className="flex-row">
                <div className="tag">Std dev: {formatPoints(boomBust.stdDev)}</div>
                <div className="tag">
                  % weeks ≥ {boomBust.threshold} pts: {boomBust.percentAbove.toFixed(1)}%
                </div>
              </div>
              <div className="detail-grid">
                <div className="section-card">
                  <h3 className="section-title">Top 5 Weeks</h3>
                  <ul>
                    {boomBust.topWeeks.map((row, idx) => (
                      <li key={`top-${idx}`}>
                        Week {row.week} ({row.season}) — {formatPoints(row.points)} pts
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="section-card">
                  <h3 className="section-title">Bottom 5 Weeks</h3>
                  <ul>
                    {boomBust.bottomWeeks.map((row, idx) => (
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
                  position. <strong>Marginal WAR</strong> is the delta to the next best player at the same position in a
                  given week. These values will appear automatically when WAR exports are provided.
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
