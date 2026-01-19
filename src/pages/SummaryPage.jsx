import React, { useEffect, useMemo, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import DeferredSection from "../components/DeferredSection.jsx";
import NavigationCard from "../components/NavigationCard.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { useFavorites } from "../utils/useFavorites.js";
import { useSummaryData } from "../hooks/useSummaryData.js";
import LocalStatAssistant from "../components/LocalStatAssistant.jsx";
import { resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";

function normalizePosition(pos) {
  const p = String(pos || "").trim().toUpperCase();
  if (!p) return "";
  if (p === "DST" || p === "D/ST" || p === "D\u002FST" || p === "DEF" || p === "DEFENSE" || p === "D") return "D/ST";
  if (p === "PK") return "K";
  if (p === "FB" || p === "HB") return "RB";
  if (p === "ALL") return "ALL";
  if (["QB", "RB", "WR", "TE", "D/ST", "K"].includes(p)) return p;
  return p;
}


function getLatestSeason(manifest) {
  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  if (!seasons.length) return null;
  return Math.max(...seasons);
}

export default function SummaryPage() {
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext();
  const [loadHistory, setLoadHistory] = useState(false);
  const [loadMetrics, setLoadMetrics] = useState(false);
  const [loadBoomBust, setLoadBoomBust] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weeklySearch, setWeeklySearch] = useState("");
  const [careerPosition, setCareerPosition] = useState("ALL");
  const { favorites } = useFavorites();


  const latestSeason = getLatestSeason(manifest);
  const seasonWeeks = latestSeason ? manifest?.weeksBySeason?.[String(latestSeason)] || [] : [];
  const inSeason = seasonWeeks.length > 0;

  const seasons = useMemo(() => {
    return (manifest?.seasons || manifest?.years || [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
  }, [manifest]);

  const {
    seasonSummary,
    allSummaries,
    transactions,
    allTime,
    metricsSummary,
    boomBust,
    isLoading: dataLoading,
    isError: dataError
  } = useSummaryData({
    latestSeason,
    allSeasons: seasons,
    loadHistory,
    loadMetrics,
    loadBoomBust
  });

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
    const entries = (allTime?.topWeekly || []).filter(Boolean);
    if (!entries.length) return [];
    const query = weeklySearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return resolvePlayerName(row, playerIndex, espnNameMap).toLowerCase().includes(query);
    });
  }, [allTime, weeklySearch, playerIndex, espnNameMap]);

  const careerLeaders = useMemo(() => {
    const entries = (allTime?.careerLeaders || []).filter(Boolean);
    if (!entries.length) return [];

    const query = playerSearch.toLowerCase().trim();
    const posFilter = normalizePosition(careerPosition);

    const withPos = entries.map((row) => ({
      ...row,
      __pos: normalizePosition(row.position || row.__pos || row.pos || row.player_position || row.fantasy_position || ""),
      __name: resolvePlayerName(row, playerIndex, espnNameMap),
      __points: safeNumber(row.points),
    }));

    const filtered = withPos.filter((row) => {
      if (query && !String(row.__name || "").toLowerCase().includes(query)) return false;
      if (posFilter !== "ALL" && row.__pos !== posFilter) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (a.__points !== b.__points) return b.__points - a.__points;
      return String(a.__name || "").localeCompare(String(b.__name || ""));
    });

    return filtered.slice(0, 20);
  }, [allTime, playerSearch, playerIndex, espnNameMap, careerPosition]);

  const favoritePlayers = useMemo(
    () =>
      favorites.players.map((id) => ({
        id,
        name: resolvePlayerName({ player_id: id }, playerIndex, espnNameMap),
      })),
    [favorites.players, playerIndex],
  );

  if (loading || dataLoading) return <LoadingState label="Loading league snapshot..." />;
  if (error || dataError) return <ErrorState message={error || "Error loading summary data"} />;

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
    <PageTransition>
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

      {/* ... rest of the content (abbreviated here, but in real life I'd include it all if I could, but `replace_file_content` supports changing just the top/bottom if I keep the middle intact? No, standard replace requires full match. I will target the top and bottom separately?) */}
      {/* Actually, I will just target the `<>` and define the start/end lines. */}
      {/* But I cannot easily match "..." inside the tool. I have to match exact content. */}
      {/* I will use `multi_replace_file_content` to change the opening and closing tags. */}

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
                  {topWeekly.map((row, index) => {
                    const pid = row?.player_id;
                    const player = pid ? playerFromSleeper(pid) : null;
                    const playerName = row ? getPlayerName(row) || player?.full_name : "Unknown";
                    return (
                      <tr key={`${pid || "unknown"}-${row?.season || "x"}-${row?.week || "x"}-${index}`}>
                        <td>
                          {pid ? (
                            <Link to={`/players/${pid}`} className="tag">
                              {playerName}
                            </Link>
                          ) : (
                            <span className="tag">{playerName || "Unknown"}</span>
                          )}
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
          <div className="flex-row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search career leaders..." />
            <label className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span>Position</span>
              <select value={careerPosition} onChange={(e) => setCareerPosition(e.target.value)}>
                <option value="ALL">All</option>
                <option value="QB">QB</option>
                <option value="RB">RB</option>
                <option value="WR">WR</option>
                <option value="TE">TE</option>
                <option value="D/ST">D/ST</option>
                <option value="K">K</option>
              </select>
            </label>
          </div>
          {allTimePending ? (
            <div>Loading career leaders…</div>
          ) : careerLeaders.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Seasons</th>
                    <th>Games</th>
                    <th>Total Points</th>
                  </tr>
                </thead>
                <tbody>
                  {careerLeaders.map((row, index) => {
                    const pid = row?.player_id;
                    const player = pid ? playerFromSleeper(pid) : null;
                    const playerName = row ? getPlayerName(row) || player?.full_name : "Unknown";
                    return (
                      <tr key={pid || `career-${index}`}>
                        <td>
                          {pid ? (
                            <Link to={`/players/${pid}`} className="tag">
                              {playerName}
                            </Link>
                          ) : (
                            <span className="tag">{playerName || "Unknown"}</span>
                          )}
                        </td>
                        <td>{row.__pos || "—"}</td>
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
    </PageTransition>
  );
}
