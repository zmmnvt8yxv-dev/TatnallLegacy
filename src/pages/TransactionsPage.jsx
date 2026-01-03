import React, { useEffect, useMemo, useState } from "react";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadTransactions } from "../data/loader.js";
import { filterRegularSeasonWeeks } from "../utils/format.js";
import { resolveOwnerName } from "../utils/owners.js";

export default function TransactionsPage() {
  const { manifest, loading, error } = useDataContext();
  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [transactions, setTransactions] = useState(null);

  const availableWeeks = useMemo(() => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week);
  }, [manifest, season]);

  useEffect(() => {
    if (!season && seasons.length) setSeason(seasons[0]);
  }, [seasons, season]);

  useEffect(() => {
    let active = true;
    if (!season) return undefined;
    loadTransactions(season).then((payload) => {
      if (active) setTransactions(payload);
    });
    return () => {
      active = false;
    };
  }, [season]);

  const entries = useMemo(() => {
    const list = transactions?.entries || [];
    return list.filter((entry) => {
      if (week !== "all" && Number(entry.week) !== Number(week)) return false;
      if (teamFilter && String(entry.team) !== String(teamFilter)) return false;
      return true;
    });
  }, [transactions, week, teamFilter]);

  const totalsByTeam = useMemo(() => {
    const totals = new Map();
    for (const entry of transactions?.entries || []) {
      const team = entry?.team || "Unknown";
      const cur = totals.get(team) || { team, adds: 0, drops: 0, trades: 0 };
      if (entry?.type === "trade") cur.trades += 1;
      if (entry?.type === "add") cur.adds += 1;
      if (entry?.type === "drop") cur.drops += 1;
      totals.set(team, cur);
    }
    return Array.from(totals.values()).sort((a, b) => b.trades - a.trades);
  }, [transactions]);

  const recordHighlights = useMemo(() => {
    if (!totalsByTeam.length) return null;
    const mostAdds = totalsByTeam.reduce((best, row) => (row.adds > best.adds ? row : best), totalsByTeam[0]);
    const mostDrops = totalsByTeam.reduce((best, row) => (row.drops > best.drops ? row : best), totalsByTeam[0]);
    const mostTrades = totalsByTeam.reduce((best, row) => (row.trades > best.trades ? row : best), totalsByTeam[0]);
    return { mostAdds, mostDrops, mostTrades };
  }, [totalsByTeam]);

  if (loading) return <LoadingState label="Loading transactions..." />;
  if (error) return <ErrorState message={error} />;

  const ownerLabel = (value, fallback = "—") => resolveOwnerName(value) || fallback;

  return (
    <>
      <section>
        <h1 className="page-title">Transactions</h1>
        <p className="page-subtitle">Track trades, adds, and drops by season and week.</p>
      </section>

      <section className="section-card filters">
        <div>
          <label>Season</label>
          <select value={season} onChange={(event) => setSeason(Number(event.target.value))}>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Week</label>
          <select value={week} onChange={(event) => setWeek(event.target.value)}>
            <option value="all">All weeks</option>
            {availableWeeks.map((value) => (
              <option key={value} value={value}>
                Week {value}
              </option>
            ))}
          </select>
        </div>
        <div className="tag">Entries: {entries.length}</div>
        {teamFilter ? (
          <button type="button" className="tag" onClick={() => setTeamFilter("")}>
            Clear team filter
          </button>
        ) : null}
      </section>

      <section className="section-card">
        <h2 className="section-title">Recent Transactions</h2>
        {entries.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Team</th>
                <th>Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.week ?? "—"}</td>
                  <td>
                    <button type="button" className="tag" onClick={() => setTeamFilter(entry.team)}>
                      {ownerLabel(entry.team, entry.team || "Unknown")}
                    </button>
                  </td>
                  <td>{entry.type}</td>
                  <td>{entry.summary || "No details"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>No transaction data available for this season.</div>
        )}
      </section>

      <section className="detail-grid">
        <div className="section-card">
          <h2 className="section-title">Season Totals by Team</h2>
          {totalsByTeam.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Adds</th>
                  <th>Drops</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {totalsByTeam.map((row) => (
                  <tr key={row.team}>
                    <td>{ownerLabel(row.team, row.team)}</td>
                    <td>{row.adds}</td>
                    <td>{row.drops}</td>
                    <td>{row.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No team totals available.</div>
          )}
        </div>
        <div className="section-card">
          <h2 className="section-title">League Records</h2>
          {recordHighlights ? (
            <ul>
              <li>
                Most adds: {ownerLabel(recordHighlights.mostAdds.team, recordHighlights.mostAdds.team)} (
                {recordHighlights.mostAdds.adds})
              </li>
              <li>
                Most drops: {ownerLabel(recordHighlights.mostDrops.team, recordHighlights.mostDrops.team)} (
                {recordHighlights.mostDrops.drops})
              </li>
              <li>
                Most trades: {ownerLabel(recordHighlights.mostTrades.team, recordHighlights.mostTrades.team)} (
                {recordHighlights.mostTrades.trades})
              </li>
            </ul>
          ) : (
            <div>No league transaction records available.</div>
          )}
        </div>
      </section>
    </>
  );
}
