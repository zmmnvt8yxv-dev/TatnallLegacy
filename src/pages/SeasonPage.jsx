import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import {
    loadSeasonSummary,
    loadPlayerStatsSeason,
    loadTransactions
} from "../data/loader.js";
import { formatPoints } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { resolvePlayerName } from "../lib/playerName.js";

// Helper to find the best player (MVP) by fantasy points
function getMvp(playerStats) {
    if (!playerStats || !playerStats.length) return null;
    // Sort by points desc
    const sorted = [...playerStats].sort((a, b) => (b.fantasy_points_custom || 0) - (a.fantasy_points_custom || 0));
    return sorted[0];
}

export default function SeasonPage() {
    const { manifest, loading, error, playerIndex, espnNameMap, playerIdLookup } = useDataContext();
    const [searchParams, setSearchParams] = useSearchParams();

    const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
    const [season, setSeason] = useState(seasons[0] || "");

    const [summary, setSummary] = useState(null);
    const [playerStats, setPlayerStats] = useState(null);
    const [transactions, setTransactions] = useState(null);
    const [pageLoading, setPageLoading] = useState(false);

    // Sync season with URL
    useEffect(() => {
        if (!seasons.length) return;
        const paramSeason = Number(searchParams.get("season"));
        if (Number.isFinite(paramSeason) && seasons.includes(paramSeason) && paramSeason !== Number(season)) {
            setSeason(paramSeason);
        } else if (!paramSeason && season) {
            // invalid or missing param, set to current state
            const p = new URLSearchParams(searchParams);
            p.set("season", season);
            setSearchParams(p, { replace: true });
        }
    }, [searchParams, seasons, season, setSearchParams]);

    const handleSeasonChange = (val) => {
        const s = Number(val);
        setSeason(s);
        const p = new URLSearchParams(searchParams);
        p.set("season", s);
        setSearchParams(p);
    };

    // Load Data
    useEffect(() => {
        if (!season) return;

        let active = true;
        setPageLoading(true);

        async function load() {
            try {
                const [sum, stats, trans] = await Promise.all([
                    loadSeasonSummary(season),
                    loadPlayerStatsSeason(season),
                    loadTransactions(season).catch(() => null)
                ]);

                if (active) {
                    setSummary(sum);
                    setPlayerStats(Array.isArray(stats) ? stats : stats?.rows || []);
                    setTransactions(trans);
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (active) setPageLoading(false);
            }
        }

        load();
        return () => { active = false; };
    }, [season]);

    // Derived Data
    const champion = useMemo(() => {
        if (!summary?.standings) return null;
        // Simple heuristic: The winner of the league is usually top of the final standings list 
        // IF the standings are finalized. However, raw standings are Regular Season usually.
        // For many fantasy exports, 'rank' indicates final placement.
        const sorted = [...summary.standings].sort((a, b) => (a.rank || 99) - (b.rank || 99));
        return sorted[0]; // Rank 1
    }, [summary]);

    const runnerUp = useMemo(() => {
        if (!summary?.standings) return null;
        const sorted = [...summary.standings].sort((a, b) => (a.rank || 99) - (b.rank || 99));
        return sorted.length > 1 ? sorted[1] : null;
    }, [summary]);

    const scoringChamp = useMemo(() => {
        if (!summary?.standings) return null;
        return [...summary.standings].sort((a, b) => b.points_for - a.points_for)[0];
    }, [summary]);

    const mvp = useMemo(() => getMvp(playerStats), [playerStats]);

    const transactionCount = useMemo(() => transactions?.entries?.length || 0, [transactions]);

    const ownerLabel = (t) => t ? normalizeOwnerName(t.owner || t.display_name || t.team_name || t.team) : "—";

    const getPlayerName = (row) => resolvePlayerName(row, playerIndex, espnNameMap);

    if (loading) return <LoadingState label="Loading season data..." />;
    if (error) return <ErrorState message={error} />;

    return (
        <>
            <section>
                <h1 className="page-title">Season Overview</h1>
                <p className="page-subtitle">Champions, awards, and statistics for {season}</p>
            </section>

            <section className="section-card filters">
                <label>Select Season:</label>
                <select value={season} onChange={(e) => handleSeasonChange(e.target.value)}>
                    {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </section>

            {pageLoading ? (
                <LoadingState label={`Loading ${season} data...`} />
            ) : (
                <>
                    {/* HEROS */}
                    <div className="card-grid">
                        <div className="stat-card accent">
                            <div className="stat-label">League Champion</div>
                            <div className="stat-value">{champion ? ownerLabel(champion) : "—"}</div>
                            <div className="stat-subtext">
                                {champion ? `${champion.wins}-${champion.losses} Record` : "No data"}
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-label">Runner Up</div>
                            <div className="stat-value">{runnerUp ? ownerLabel(runnerUp) : "—"}</div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-label">Scoring Leader (Team)</div>
                            <div className="stat-value">{scoringChamp ? ownerLabel(scoringChamp) : "—"}</div>
                            <div className="stat-subtext">{scoringChamp ? formatPoints(scoringChamp.points_for) : "—"} pts</div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-label">Season MVP (Player)</div>
                            <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                                {mvp ? (
                                    <Link to={`/players/${mvp.player_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        {getPlayerName(mvp)}
                                    </Link>
                                ) : "—"}
                            </div>
                            <div className="stat-subtext">
                                {mvp ? `${formatPoints(mvp.fantasy_points_custom)} pts (${mvp.position})` : "—"}
                            </div>
                        </div>
                    </div>

                    <div className="detail-grid">
                        {/* STANDINGS PREVIEW */}
                        <div className="section-card">
                            <h2 className="section-title">Final Standings</h2>
                            {summary?.standings?.length ? (
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Rank</th>
                                                <th>Team</th>
                                                <th>Rec</th>
                                                <th>PF</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...summary.standings]
                                                .filter(row => row.team !== "Away" && row.team !== "Team Away")
                                                .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                                                .map(row => (
                                                    <tr key={row.team}>
                                                        <td>{row.rank || "-"}</td>
                                                        <td>
                                                            <div style={{ fontWeight: 600 }}>
                                                                {ownerLabel(row)}
                                                            </div>
                                                            <div style={{ fontSize: '0.8em', color: 'var(--ink-400)' }}>{row.team}</div>
                                                        </td>
                                                        <td>{row.wins}-{row.losses}</td>
                                                        <td>{formatPoints(row.points_for)}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div>No standings available.</div>
                            )}
                        </div>

                        {/* STATS / INFO */}
                        <div className="flex-col" style={{ gap: '20px' }}>
                            <div className="section-card">
                                <h2 className="section-title">Season Facts</h2>
                                <ul style={{ lineHeight: '1.8', listStyle: 'none', padding: 0 }}>
                                    <li>
                                        <strong>Trades & Transactions:</strong> {transactionCount}
                                    </li>
                                    <li>
                                        <strong>Teams:</strong> {summary?.teams?.length || 0}
                                    </li>
                                    <li>
                                        <strong>Weeks:</strong> {(manifest?.weeksBySeason?.[season] || []).length}
                                    </li>
                                </ul>
                                <div style={{ marginTop: '20px' }}>
                                    <Link to={`/matchups?season=${season}`} className="button">Browse Matchups</Link>
                                </div>
                                <div style={{ marginTop: '10px' }}>
                                    <Link to={`/transactions?season=${season}`} className="button secondary">View Transactions</Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
