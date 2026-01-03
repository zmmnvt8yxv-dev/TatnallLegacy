import React, { useEffect, useMemo, useState } from "react";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadTransactions } from "../data/loader.js";
import { filterRegularSeasonWeeks } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { useSearchParams } from "react-router-dom";

export default function TransactionsPage() {
  const { manifest, loading, error } = useDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [transactions, setTransactions] = useState(null);
  const isDev = import.meta.env.DEV;

  const availableWeeks = useMemo(() => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week);
  }, [manifest, season]);

  useEffect(() => {
    if (!seasons.length) return;
    const param = Number(searchParams.get("season"));
    if (Number.isFinite(param) && seasons.includes(param)) {
      if (param !== season) setSeason(param);
    } else if (!season) {
      setSeason(seasons[0]);
    }
  }, [seasons, season, searchParams]);

  useEffect(() => {
    const param = searchParams.get("week") || "all";
    if (param === "all" || param === "") {
      if (week !== "all") setWeek("all");
      return;
    }
    const parsed = Number(param);
    if (Number.isFinite(parsed) && parsed !== Number(week)) {
      setWeek(parsed);
    }
  }, [searchParams, week]);

  useEffect(() => {
    const param = searchParams.get("type") || "all";
    if (param !== typeFilter) setTypeFilter(param);
  }, [searchParams, typeFilter]);

  useEffect(() => {
    const param = searchParams.get("team") || "";
    if (param !== teamFilter) setTeamFilter(param);
  }, [searchParams, teamFilter]);

  useEffect(() => {
    if (!availableWeeks.length) return;
    if (week === "all") return;
    const numericWeek = Number(week);
    if (!Number.isFinite(numericWeek) || !availableWeeks.includes(numericWeek)) {
      setWeek("all");
    }
  }, [availableWeeks, week]);

  useEffect(() => {
    if (!season) return;
    const next = new URLSearchParams(searchParams);
    const seasonValue = String(season);
    const weekValue = week === "all" ? "all" : String(week);
    const currentSeason = searchParams.get("season") || "";
    const currentWeek = searchParams.get("week") || "all";
    const currentType = searchParams.get("type") || "all";
    const currentTeam = searchParams.get("team") || "";
    if (
      currentSeason === seasonValue &&
      currentWeek === weekValue &&
      currentType === typeFilter &&
      currentTeam === teamFilter
    ) {
      return;
    }
    next.set("season", seasonValue);
    next.set("week", weekValue);
    if (typeFilter && typeFilter !== "all") next.set("type", typeFilter);
    else next.delete("type");
    if (teamFilter) next.set("team", teamFilter);
    else next.delete("team");
    setSearchParams(next, { replace: true });
  }, [season, week, typeFilter, teamFilter, searchParams, setSearchParams]);

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
      const entryWeek = Number(entry.week);
      if (Number.isFinite(entryWeek) && (entryWeek < 1 || entryWeek > 18)) return false;
      if (week !== "all" && Number(entry.week) !== Number(week)) return false;
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (teamFilter && normalizeOwnerName(entry.team) !== teamFilter) return false;
      return true;
    });
  }, [transactions, week, typeFilter, teamFilter]);

  const totalsByTeam = useMemo(() => {
    const totals = new Map();
    for (const entry of transactions?.entries || []) {
      const team = normalizeOwnerName(entry?.team) || "Unknown";
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

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;

  const teamOptions = useMemo(() => {
    const set = new Set();
    for (const entry of transactions?.entries || []) {
      const label = normalizeOwnerName(entry?.team);
      if (label) set.add(label);
    }
    return Array.from(set).sort();
  }, [transactions]);

  const filteredCounts = useMemo(() => {
    const counts = { add: 0, drop: 0, trade: 0 };
    for (const entry of entries) {
      if (entry?.type === "add") counts.add += 1;
      if (entry?.type === "drop") counts.drop += 1;
      if (entry?.type === "trade") counts.trade += 1;
    }
    return counts;
  }, [entries]);

  const diagnostics = useMemo(() => {
    if (!isDev || !transactions?.entries) return null;
    const rows = transactions.entries;
    const byType = { add: [], drop: [], trade: [] };
    for (const row of rows) {
      if (row?.type === "add") byType.add.push(row);
      if (row?.type === "drop") byType.drop.push(row);
      if (row?.type === "trade") byType.trade.push(row);
    }
    return {
      source: transactions?.__meta?.path || "unknown",
      sources: transactions?.sources || [],
      counts: {
        add: byType.add.length,
        drop: byType.drop.length,
        trade: byType.trade.length,
      },
      samples: {
        add: byType.add.slice(0, 3),
        drop: byType.drop.slice(0, 3),
        trade: byType.trade.slice(0, 3),
      },
    };
  }, [isDev, transactions]);

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
        <div>
          <label>Type</label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="trade">Trade</option>
            <option value="add">Add</option>
            <option value="drop">Drop</option>
          </select>
        </div>
        <div>
          <label>Team</label>
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="">All teams</option>
            {teamOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="tag">Entries: {entries.length}</div>
        <div className="tag">
          Trades: {filteredCounts.trade} · Adds: {filteredCounts.add} · Drops: {filteredCounts.drop}
        </div>
        {teamFilter || typeFilter !== "all" || week !== "all" ? (
          <button
            type="button"
            className="tag"
            onClick={() => {
              setTeamFilter("");
              setTypeFilter("all");
              setWeek("all");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </section>

      {diagnostics ? (
        <section className="section-card">
          <h2 className="section-title">Diagnostics (DEV)</h2>
          <div className="flex-row">
            <div className="tag">Source: {diagnostics.source}</div>
            <div className="tag">
              Adds: {diagnostics.counts.add} · Drops: {diagnostics.counts.drop} · Trades: {diagnostics.counts.trade}
            </div>
            {diagnostics.sources.length ? (
              <div className="tag">Inputs: {diagnostics.sources.join(", ")}</div>
            ) : null}
          </div>
          <pre className="code-block">
            {JSON.stringify(
              {
                add: diagnostics.samples.add,
                drop: diagnostics.samples.drop,
                trade: diagnostics.samples.trade,
              },
              null,
              2,
            )}
          </pre>
        </section>
      ) : null}

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
                    <button
                      type="button"
                      className="tag"
                      onClick={() => setTeamFilter(normalizeOwnerName(entry.team))}
                    >
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
