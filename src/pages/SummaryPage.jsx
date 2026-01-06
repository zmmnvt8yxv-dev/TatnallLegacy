import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import DeferredSection from "../components/DeferredSection.jsx";
import NavigationCard from "../components/NavigationCard.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { useFavorites } from "../utils/useFavorites.js";
import {
  loadAllTime,
  loadMetricsSummary,
  loadPlayerMetricsBoomBust,
  loadSeasonSummary,
  loadTransactions,
} from "../data/loader.js";
import LocalStatAssistant from "../components/LocalStatAssistant.jsx";
import { resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";

function getLatestSeason(manifest) {
  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  if (!seasons.length) return null;
  return Math.max(...seasons);
}

export default function SummaryPage() {
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext();
  const [seasonSummary, setSeasonSummary] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [boomBust, setBoomBust] = useState(null);
  const [loadHistory, setLoadHistory] = useState(false);
  const [loadMetrics, setLoadMetrics] = useState(false);
  const [loadBoomBust, setLoadBoomBust] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weeklySearch, setWeeklySearch] = useState("");
  const { favorites } = useFavorites();
  const [allSummaries, setAllSummaries] = useState([]);

  const latestSeason = getLatestSeason(manifest);
  const seasonWeeks = latestSeason ? manifest?.weeksBySeason?.[String(latestSeason)] || [] : [];
  const inSeason = seasonWeeks.length > 0;

  const seasons = useMemo(() => {
    return (manifest?.seasons || manifest?.years || [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
  }, [manifest]);
  useEffect(() => {
    let active = true;
    if (!seasons.length) return undefined;

    Promise.all(seasons.map((year) => loadSeasonSummary(year))).then((payloads) => {
      if (!active) return;
      setAllSummaries(payloads.filter(Boolean));
    });

    return () => {
      active = false;
    };
  }, [seasons]);

  const ownersBySeason = useMemo(() => {
    const bySeason = new Map();
    for (const summary of allSummaries) {
      const ownerByTeam = new Map();
      for (const team of summary?.teams || []) {
        const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
        if (ownerName) {
          ownerByTeam.set(team.team_name, ownerName);
        }
      }
      bySeason.set(Number(summary?.season), ownerByTeam);
    }
    return bySeason;
  }, [allSummaries]);

  useEffect(() => {
    let active = true;
    if (!latestSeason) return undefined;
    loadSeasonSummary(latestSeason).then((payload) => {
      if (active) setSeasonSummary(payload);
    });
    loadTransactions(latestSeason).then((payload) => {
      if (active) setTransactions(payload);
    });
    return () => {
      active = false;
    };
  }, [latestSeason]);

  useEffect(() => {
    let active = true;
    if (!loadHistory) return undefined;

    const seasons = (manifest?.seasons || manifest?.years || [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const tryLoad = async () => {
      try {
        // Preferred: loader supports a seasons filter so the backend can aggregate 2015-2025.
        return await loadAllTime({ seasons });
      } catch (e) {
        // Back-compat: older loader takes no args.
        return await loadAllTime();
      }
    };

    tryLoad().then((payload) => {
      if (active) setAllTime(payload);
    });

    return () => {
      active = false;
    };
  }, [loadHistory, manifest]);

  useEffect(() => {
    let active = true;
    if (!loadMetrics) return undefined;
    loadMetricsSummary().then((payload) => {
      if (active) setMetricsSummary(payload);
    });
    return () => {
      active = false;
    };
  }, [loadMetrics]);

  useEffect(() => {
    let active = true;
    if (!loadBoomBust) return undefined;
    loadPlayerMetricsBoomBust()
      .then((payload) => {
        if (active) setBoomBust(payload);
      })
      .catch(() => {
        if (active) setBoomBust(null);
      });
    return () => {
      active = false;
    };
  }, [loadBoomBust]);

  const champion = useMemo(() => {
    const standings = seasonSummary?.standings || [];
    if (!standings.length) return null;
    return standings.reduce((best, team) => {
      if (!best) return team;
      if (team.wins > best.wins) return team;
      if (team.wins === best.wins && team.points_for > best.points_for) return team;
      return best;
    }, null);
  }, [seasonSummary]);

  const transactionTotals = useMemo(() => {
    const entries = transactions?.entries || [];
    if (!entries.length) return null;
    const totalsByTeam = new Map();
    let totalTrades = 0;
    for (const entry of entries) {
      const team = entry?.team || "Unknown";
      const cur = totalsByTeam.get(team) || { team, adds: 0, drops: 0, trades: 0 };
      if (entry?.type === "trade") {
        cur.trades += 1;
        totalTrades += 1;
      } else if (entry?.type === "add") {
        cur.adds += 1;
      } else if (entry?.type === "drop") {
        cur.drops += 1;
      }
      totalsByTeam.set(team, cur);
    }
    const totals = Array.from(totalsByTeam.values());
    const mostAdds = totals.sort((a, b) => b.adds - a.adds)[0];
    const mostDrops = totals.sort((a, b) => b.drops - a.drops)[0];
    return { totalTrades, mostAdds, mostDrops, total: entries.length };
  }, [transactions]);

  const topWeekly = useMemo(() => {
    const entries = allTime?.topWeekly || [];
    if (!entries.length) return [];
    const query = weeklySearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return resolvePlayerName(row, playerIndex, espnNameMap).toLowerCase().includes(query);
    });
  }, [allTime, weeklySearch, playerIndex]);

  const careerLeaders = useMemo(() => {
    const entries = allTime?.careerLeaders || [];
    if (!entries.length) return [];
    const query = playerSearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return resolvePlayerName(row, playerIndex, espnNameMap).toLowerCase().includes(query);
    });
  }, [allTime, playerSearch, playerIndex]);

  const favoritePlayers = useMemo(
    () =>
      favorites.players.map((id) => ({
        id,
        name: resolvePlayerName({ player_id: id }, playerIndex, espnNameMap),
      })),
    [favorites.players, playerIndex],
  );

  if (loading) return <LoadingState label="Loading league snapshot..." />;
  if (error) return <ErrorState message={error} />;

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;
  const statusLabel = inSeason ? "In Season" : `Offseason (last season: ${latestSeason ?? "—"})`;
  const championLabel = champion
    ? `${ownerLabel(champion.team, champion.team)} (${champion.wins}-${champion.losses})`
    : "Champion not available";
  const championNote = champion
    ? "Regular-season leader based on available standings."
    : "Standings or playoff data missing for this season.";
  const allTimePending = loadHistory && !allTime;
  const metricsPending = loadMetrics && !metricsSummary;

  const playerFromSleeper = (playerId) => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    if (!uid) return null;
    return playerIdLookup.byUid.get(uid);
  };

  const getPlayerName = (row) => resolvePlayerName(row, playerIndex, espnNameMap);

  return (
    <>
      <section>
        <h1 className="page-title">League Summary</h1>
        <p className="page-subtitle">
          Snapshot of the latest season plus all-time records from available league exports.
        </p>
      </section>

      <section className="card-grid">
        <StatCard label="Current Season" value={latestSeason ?? "—"} subtext={statusLabel} />
        <StatCard label="Current Champion" value={championLabel} subtext={championNote} />
        <StatCard
          label="Total Transactions"
          value={transactionTotals ? transactionTotals.total : "No data"}
          subtext="Trades + adds + drops (latest season)"
        />
        <StatCard
          label="Total Trades"
          value={transactionTotals ? transactionTotals.totalTrades : "No data"}
          subtext="Latest season trades"
        />
      </section>

      <section className="section-card">
        <h2 className="section-title">Your Favorites</h2>
        {favoritePlayers.length || favorites.teams.length ? (
          <>
            {favoritePlayers.length ? (
              <>
                <div className="stat-label">Players</div>
                <div className="favorite-list">
                  {favoritePlayers.map((player) => (
                    <Link key={player.id} to={`/players/${player.id}`} className="tag">
                      {player.name}
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
            {favorites.teams.length ? (
              <>
                <div className="stat-label" style={{ marginTop: 12 }}>
                  Teams
                </div>
                <div className="favorite-list">
                  {favorites.teams.map((team) => (
                    <span key={team} className="tag">
                      {ownerLabel(team, team)}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div>No favorites yet. Add a player or team to see them here.</div>
        )}
      </section>

      <section className="card-grid">
        <NavigationCard
          to="/matchups"
          title="Weekly Matchups"
          description="Browse matchups by season and week, then dive into roster details."
        />
        <NavigationCard
          to="/transactions"
          title="Transactions"
          description="Track trades, adds, drops, and season totals by team."
        />
        <NavigationCard
          to="/standings"
          title="Standings"
          description="Season standings plus all-time franchise summaries."
        />
      </section>

      <section className="detail-grid">
        <div className="section-card">
          <h2 className="section-title">Season Highlights</h2>
          {transactionTotals ? (
            <div className="flex-row">
              <div className="tag">
                Most adds: {ownerLabel(transactionTotals.mostAdds?.team, transactionTotals.mostAdds?.team || "—")} (
                {transactionTotals.mostAdds?.adds || 0})
              </div>
              <div className="tag">
                Most drops: {ownerLabel(transactionTotals.mostDrops?.team, transactionTotals.mostDrops?.team || "—")} (
                {transactionTotals.mostDrops?.drops || 0})
              </div>
              <div className="tag">Trades logged: {transactionTotals.totalTrades}</div>
            </div>
          ) : (
            <div>No transaction data available for this season.</div>
          )}
        </div>
        <DeferredSection
          onVisible={() => setLoadHistory(true)}
          placeholder={<div className="section-card">Loading all-time records…</div>}
        >
          <div className="section-card">
            <h2 className="section-title">All-Time Records</h2>
            <div className="flex-row">
              <div className="tag">Weekly points leaderboard (custom points)</div>
              <div className="tag">Career fantasy totals</div>
            </div>
            {allTimePending ? (
              <div>Loading all-time data…</div>
            ) : !allTime ? (
              <div>No all-time data available.</div>
            ) : (
              <div className="flex-row">
                <Link to="/matchups" className="tag">
                  Explore weekly matchups →
                </Link>
                <Link to="/standings" className="tag">
                  View franchise history →
                </Link>
              </div>
            )}
          </div>
        </DeferredSection>
      </section>

      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<div className="section-card">Loading weekly leaders…</div>}
      >
        <section className="section-card">
          <h2 className="section-title">Weekly 45+ Point Games (2015–2025)</h2>
          <SearchBar value={weeklySearch} onChange={setWeeklySearch} placeholder="Search weekly leaders..." />
          {allTimePending ? (
            <div>Loading weekly leaders…</div>
          ) : topWeekly.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Season</th>
                    <th>Week</th>
                    <th>Team</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {topWeekly.map((row) => {
                    const player = playerFromSleeper(row.player_id);
                    const playerName = getPlayerName(row) || player?.full_name;
                    return (
                      <tr key={`${row.player_id}-${row.season}-${row.week}`}>
                        <td>
                          <Link to={`/players/${row.player_id}`}>{playerName}</Link>
                        </td>
                        <td>{row.season}</td>
                        <td>{row.week}</td>
                        <td>
                          {(() => {
                            const ownerByTeam = ownersBySeason.get(Number(row.season));
                            const owner = ownerByTeam?.get(row.team);
                            return owner ? `${row.team} - ${owner}` : row.team;
                          })()}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span>{formatPoints(row.points)}</span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                lineHeight: 1.4,
                                border: "1px solid rgba(0,0,0,0.15)",
                                background:
                                  row.started == null
                                    ? "rgba(107,114,128,0.15)"
                                    : row.started
                                      ? "rgba(34,197,94,0.18)"
                                      : "rgba(239,68,68,0.18)",
                                color:
                                  row.started == null
                                    ? "rgba(107,114,128,1)"
                                    : row.started
                                      ? "rgba(21,128,61,1)"
                                      : "rgba(185,28,28,1)",
                              }}
                              title={row.started == null ? "Starter status unknown" : row.started ? "Starter" : "Bench"}
                            >
                              {row.started == null ? "—" : row.started ? "STARTER" : "BENCH"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No weekly performance data available.</div>
          )}
        </section>
      </DeferredSection>

      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<div className="section-card">Loading career leaders…</div>}
      >
        <section className="section-card">
          <h2 className="section-title">Career Fantasy Leaders</h2>
          <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search career leaders..." />
          {allTimePending ? (
            <div>Loading career leaders…</div>
          ) : careerLeaders.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Seasons</th>
                    <th>Games</th>
                    <th>Total Points</th>
                  </tr>
                </thead>
                <tbody>
                  {careerLeaders.map((row) => {
                    const player = playerFromSleeper(row.player_id);
                    const playerName = getPlayerName(row) || player?.full_name;
                    return (
                      <tr key={row.player_id}>
                        <td>
                          <Link to={`/players/${row.player_id}`}>{playerName}</Link>
                        </td>
                        <td>{row.seasons}</td>
                        <td>{row.games}</td>
                        <td>{formatPoints(row.points)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No career leaderboard data available.</div>
          )}
        </section>
      </DeferredSection>

      <DeferredSection
        onVisible={() => setLoadMetrics(true)}
        placeholder={<div className="section-card">Loading advanced metrics…</div>}
      >
        <section className="section-card">
          <h2 className="section-title">Advanced Metrics Highlights</h2>
          {metricsPending ? (
            <div>Loading advanced metrics…</div>
          ) : !metricsSummary ? (
            <div>
              No advanced metrics available. Run <code>npm run build:data</code> to generate WAR and z-score stats.
            </div>
          ) : (
            <div className="detail-grid">
              <div className="section-card">
                <h3 className="section-title">Top Weekly WAR</h3>
                {metricsSummary.topWeeklyWar?.length ? (
                  <ul>
                    {metricsSummary.topWeeklyWar.map((row) => (
                      <li
                        key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}-${row.week}`}
                      >
                        {getPlayerName(row)} — Week {row.week} {row.season} ({formatPoints(row.war_rep)})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>No weekly WAR data available.</div>
                )}
              </div>
              <div className="section-card">
                <h3 className="section-title">Best Weekly Z-Scores</h3>
                {metricsSummary.topWeeklyZ?.length ? (
                  <ul>
                    {metricsSummary.topWeeklyZ.map((row) => (
                      <li
                        key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}-${row.week}`}
                      >
                        {getPlayerName(row)} — Week {row.week} {row.season} ({safeNumber(row.pos_week_z).toFixed(2)})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>No weekly z-score data available.</div>
                )}
              </div>
              <div className="section-card">
                <h3 className="section-title">Top WAR Seasons</h3>
                {metricsSummary.topSeasonWar?.length ? (
                  <ul>
                    {metricsSummary.topSeasonWar.map((row) => (
                      <li
                        key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}`}
                      >
                        {getPlayerName(row)} — {row.season} ({formatPoints(row.war_rep)})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>No season WAR data available.</div>
                )}
              </div>
            </div>
          )}
        </section>
      </DeferredSection>
      <DeferredSection
        onVisible={() => {
          setLoadHistory(true);
          setLoadBoomBust(true);
        }}
        placeholder={<div className="section-card">Loading stat assistant…</div>}
      >
        <LocalStatAssistant
          allTime={allTime}
          boomBust={boomBust}
          playerIndex={playerIndex}
          espnNameMap={espnNameMap}
        />
      </DeferredSection>

      <section className="section-card">
        <h2 className="section-title">Data Coverage Notes</h2>
        <ul>
          <li>
            Advanced metrics (z-scores, WAR, efficiency) are displayed when present in the data exports. Missing
            files are shown as “No data available.”
          </li>
          <li>Only regular-season weeks 1–18 are included in leaderboards and matchups.</li>
        </ul>
      </section>
    </>
  );
}
