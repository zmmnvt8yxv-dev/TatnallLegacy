import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import NavigationCard from "../components/NavigationCard.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadAllTime, loadSeasonSummary, loadTransactions } from "../data/loader.js";
import { formatPoints, safeNumber } from "../utils/format.js";

function getLatestSeason(manifest) {
  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  if (!seasons.length) return null;
  return Math.max(...seasons);
}

export default function SummaryPage() {
  const { manifest, loading, error, playerIdLookup } = useDataContext();
  const [seasonSummary, setSeasonSummary] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weeklySearch, setWeeklySearch] = useState("");

  const latestSeason = getLatestSeason(manifest);
  const seasonWeeks = latestSeason ? manifest?.weeksBySeason?.[String(latestSeason)] || [] : [];
  const inSeason = seasonWeeks.length > 0;

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
    loadAllTime().then((payload) => {
      if (active) setAllTime(payload);
    });
    return () => {
      active = false;
    };
  }, []);

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
      return String(row.player_name || row.player_id).toLowerCase().includes(query);
    });
  }, [allTime, weeklySearch]);

  const careerLeaders = useMemo(() => {
    const entries = allTime?.careerLeaders || [];
    if (!entries.length) return [];
    const query = playerSearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return String(row.player_name || row.player_id).toLowerCase().includes(query);
    });
  }, [allTime, playerSearch]);

  if (loading) return <LoadingState label="Loading league snapshot..." />;
  if (error) return <ErrorState message={error} />;

  const statusLabel = inSeason ? "In Season" : `Offseason (last season: ${latestSeason ?? "—"})`;
  const championLabel = champion
    ? `${champion.team} (${champion.wins}-${champion.losses})`
    : "Champion not available";
  const championNote = champion
    ? "Regular-season leader based on available standings."
    : "Standings or playoff data missing for this season.";

  const playerFromSleeper = (playerId) => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    if (!uid) return null;
    return playerIdLookup.byUid.get(uid);
  };

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
                Most adds: {transactionTotals.mostAdds?.team || "—"} ({transactionTotals.mostAdds?.adds || 0})
              </div>
              <div className="tag">
                Most drops: {transactionTotals.mostDrops?.team || "—"} ({transactionTotals.mostDrops?.drops || 0})
              </div>
              <div className="tag">Trades logged: {transactionTotals.totalTrades}</div>
            </div>
          ) : (
            <div>No transaction data available for this season.</div>
          )}
        </div>
        <div className="section-card">
          <h2 className="section-title">All-Time Records</h2>
          <div className="flex-row">
            <div className="tag">Weekly points leaderboard (custom points)</div>
            <div className="tag">Career fantasy totals</div>
          </div>
          {!allTime ? (
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
      </section>

      <section className="section-card">
        <h2 className="section-title">Best Weekly Performances (Top 10)</h2>
        <SearchBar value={weeklySearch} onChange={setWeeklySearch} placeholder="Search weekly leaders..." />
        {topWeekly.length ? (
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
                return (
                  <tr key={`${row.player_id}-${row.season}-${row.week}`}>
                    <td>
                      <Link to={`/players/${row.player_id}`}>
                        {row.player_name || player?.full_name || row.player_id}
                      </Link>
                    </td>
                    <td>{row.season}</td>
                    <td>{row.week}</td>
                    <td>{row.team || "—"}</td>
                    <td>{formatPoints(row.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>No weekly performance data available.</div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Career Fantasy Leaders</h2>
        <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search career leaders..." />
        {careerLeaders.length ? (
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
                return (
                  <tr key={row.player_id}>
                    <td>
                      <Link to={`/players/${row.player_id}`}>
                        {row.player_name || player?.full_name || row.player_id}
                      </Link>
                    </td>
                    <td>{row.seasons}</td>
                    <td>{row.games}</td>
                    <td>{formatPoints(row.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>No career leaderboard data available.</div>
        )}
      </section>

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
