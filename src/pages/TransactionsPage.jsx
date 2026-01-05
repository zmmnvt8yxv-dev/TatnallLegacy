import React, { useEffect, useMemo, useRef, useState } from "react";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadTransactions } from "../data/loader.js";
import { filterRegularSeasonWeeks } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { useVirtualRows } from "../utils/useVirtualRows.js";
import { readStorage, writeStorage } from "../utils/persistence.js";
import { Link, useSearchParams } from "react-router-dom";
import { getCanonicalPlayerId, looksLikeId } from "../lib/playerName.js";

export default function TransactionsPage() {
  const { manifest, loading, error, playerIndex, espnNameMap } = useDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef(false);
  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [transactions, setTransactions] = useState(null);
  const isDev = import.meta.env.DEV;
  const TRANSACTIONS_PREF_KEY = "tatnall-pref-transactions";

  const availableWeeks = useMemo(() => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week);
  }, [manifest, season]);

  useEffect(() => {
    if (!seasons.length) return;
    const paramSeason = Number(searchParams.get("season"));
    if (Number.isFinite(paramSeason) && paramSeason !== Number(season) && seasons.includes(paramSeason)) {
      setSeason(paramSeason);
    }
    const paramWeekRaw = searchParams.get("week") || "all";
    if (paramWeekRaw === "all" && week !== "all") {
      setWeek("all");
    } else if (paramWeekRaw !== "all") {
      const parsed = Number(paramWeekRaw);
      if (Number.isFinite(parsed) && parsed !== Number(week)) {
        setWeek(parsed);
      }
    }
    const paramType = searchParams.get("type") || "all";
    if (paramType !== typeFilter) setTypeFilter(paramType);
    const paramTeam = searchParams.get("team") || "";
    if (paramTeam !== teamFilter) setTeamFilter(paramTeam);
  }, [searchParamsString, seasons, season, week, typeFilter, teamFilter]);

  useEffect(() => {
    if (!seasons.length || !manifest) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const stored = readStorage(TRANSACTIONS_PREF_KEY, {});
    const storedSeason = Number(stored?.season);
    const storedWeek = stored?.week ?? "all";
    const storedType = stored?.type ?? "all";
    const storedTeam = stored?.team ?? "";
    const paramSeason = Number(searchParams.get("season"));
    let nextSeason = Number.isFinite(paramSeason) && seasons.includes(paramSeason) ? paramSeason : seasons[0];
    if (!searchParams.get("season") && Number.isFinite(storedSeason) && seasons.includes(storedSeason)) {
      nextSeason = storedSeason;
    }
    const weeksForSeason = manifest?.weeksBySeason?.[String(nextSeason)] || [];
    const regularWeeks = filterRegularSeasonWeeks(weeksForSeason.map((value) => ({ week: value }))).map(
      (row) => row.week,
    );
    const paramWeekRaw = searchParams.get("week") || "all";
    const paramWeek = Number(paramWeekRaw);
    let nextWeek =
      paramWeekRaw === "all" || paramWeekRaw === ""
        ? "all"
        : Number.isFinite(paramWeek) && regularWeeks.includes(paramWeek)
          ? paramWeek
          : "all";
    if (!searchParams.get("week") && storedWeek !== "all") {
      const storedWeekNumber = Number(storedWeek);
      if (Number.isFinite(storedWeekNumber) && regularWeeks.includes(storedWeekNumber)) {
        nextWeek = storedWeekNumber;
      }
    }
    const nextType = searchParams.get("type") || storedType || "all";
    const nextTeam = searchParams.get("team") || storedTeam || "";
    setSeason(nextSeason);
    setWeek(nextWeek);
    setTypeFilter(nextType);
    setTeamFilter(nextTeam);
    let changed = false;
    if (!searchParams.get("season") && nextSeason) {
      params.set("season", String(nextSeason));
      changed = true;
    }
    if (!searchParams.get("week")) {
      params.set("week", nextWeek === "all" ? "all" : String(nextWeek));
      changed = true;
    }
    if (changed) setSearchParams(params, { replace: true });
    writeStorage(TRANSACTIONS_PREF_KEY, {
      season: nextSeason,
      week: nextWeek,
      type: nextType,
      team: nextTeam,
    });
    didInitRef.current = true;
  }, [seasons, manifest, searchParams, setSearchParams]);

  useEffect(() => {
    if (!availableWeeks.length) return;
    if (week === "all") return;
    const numericWeek = Number(week);
    if (!Number.isFinite(numericWeek) || !availableWeeks.includes(numericWeek)) {
      setWeek("all");
    }
  }, [availableWeeks, week]);

  const updateSearchParams = (nextSeason, nextWeek, nextType, nextTeam) => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    params.set("week", nextWeek === "all" ? "all" : String(nextWeek));
    if (nextType && nextType !== "all") params.set("type", nextType);
    else params.delete("type");
    if (nextTeam) params.set("team", nextTeam);
    else params.delete("team");
    setSearchParams(params, { replace: true });
    writeStorage(TRANSACTIONS_PREF_KEY, {
      season: nextSeason,
      week: nextWeek,
      type: nextType,
      team: nextTeam,
    });
  };

  const handleSeasonChange = (value) => {
    const nextSeason = Number(value);
    setSeason(nextSeason);
    updateSearchParams(nextSeason, week, typeFilter, teamFilter);
  };

  const handleWeekChange = (value) => {
    const nextWeek = value === "all" ? "all" : Number(value);
    setWeek(nextWeek);
    updateSearchParams(season, nextWeek, typeFilter, teamFilter);
  };

  const handleTypeChange = (value) => {
    setTypeFilter(value);
    updateSearchParams(season, week, value, teamFilter);
  };

  const handleTeamChange = (value) => {
    setTeamFilter(value);
    updateSearchParams(season, week, typeFilter, value);
  };

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

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;
  const virtualEntries = useVirtualRows({ itemCount: entries.length, rowHeight: 46 });
  const visibleEntries = entries.slice(virtualEntries.start, virtualEntries.end);

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

  if (loading) return <LoadingState label="Loading transactions..." />;
  if (error) return <ErrorState message={error} />;

  const resolvePlayerLabel = (player) => {
    if (!player) return "Unknown";
    if (player.name && !looksLikeId(player.name)) return player.name;
    if (player.id_type === "espn") {
      const mapped = espnNameMap?.[String(player.id)];
      if (mapped) return mapped;
    }
    return player.name || player.id || "Unknown";
  };

  const renderPlayerLinks = (players) =>
    players
      .map((player, index) => {
        if (!player?.id) return <span key={`${player.name}-${index}`}>{player.name || "Unknown"}</span>;
        const canonicalId = getCanonicalPlayerId(player.id, {
          row: {
            player_id: player.id,
            sleeper_id: player.id_type === "sleeper" ? player.id : null,
            gsis_id: player.id_type === "gsis" ? player.id : null,
            espn_id: player.id_type === "espn" ? player.id : null,
          },
          playerIndex,
        });
        const linkId = canonicalId || String(player.id);
        const label = resolvePlayerLabel(player);
        return (
          <Link key={`${player.id}-${index}`} to={`/players/${linkId}`} className="link-button">
            {label}
          </Link>
        );
      })
      .reduce((prev, curr) => (prev === null ? [curr] : [prev, ", ", curr]), null);

  return (
    <>
      <section>
        <h1 className="page-title">Transactions</h1>
        <p className="page-subtitle">Track trades, adds, and drops by season and week.</p>
      </section>

      <section className="section-card filters filters--sticky">
        <div>
          <label>Season</label>
          <select value={season} onChange={(event) => handleSeasonChange(event.target.value)}>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Week</label>
          <select value={week} onChange={(event) => handleWeekChange(event.target.value)}>
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
          <select value={typeFilter} onChange={(event) => handleTypeChange(event.target.value)}>
            <option value="all">All types</option>
            <option value="trade">Trade</option>
            <option value="add">Add</option>
            <option value="drop">Drop</option>
          </select>
        </div>
        <div>
          <label>Team</label>
          <select value={teamFilter} onChange={(event) => handleTeamChange(event.target.value)}>
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
          <div className="table-wrap virtual-table" ref={virtualEntries.containerRef}>
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
                {virtualEntries.topPadding ? (
                  <tr className="table-virtual-spacer" aria-hidden="true">
                    <td colSpan={4} style={{ height: virtualEntries.topPadding }} />
                  </tr>
                ) : null}
                {visibleEntries.map((entry) => (
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
                    <td>
                      {entry.players?.length ? (
                        <div>
                          {entry.type === "trade" ? (
                            <span>
                              Received:{" "}
                              {renderPlayerLinks(entry.players.filter((player) => player?.action === "received"))}
                              {" | "}Sent:{" "}
                              {renderPlayerLinks(entry.players.filter((player) => player?.action === "sent"))}
                            </span>
                          ) : (
                            <span>
                              {entry.type === "add" ? "Added: " : entry.type === "drop" ? "Dropped: " : "Updated: "}
                              {renderPlayerLinks(entry.players)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>{entry.summary || "No details"}</div>
                      )}
                    </td>
                  </tr>
                ))}
                {virtualEntries.bottomPadding ? (
                  <tr className="table-virtual-spacer" aria-hidden="true">
                    <td colSpan={4} style={{ height: virtualEntries.bottomPadding }} />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div>No transaction data available for this season.</div>
        )}
      </section>

      <section className="detail-grid">
        <div className="section-card">
          <h2 className="section-title">Season Totals by Team</h2>
          {totalsByTeam.length ? (
            <div className="table-wrap">
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
            </div>
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
