import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { loadManifest, loadSeasonSummary, loadTransactions, loadAllTime } from "../data/loader.js";
import { normalizeOwnerName, OWNER_ALIASES } from "../lib/identity.js";
import { formatPoints, safeNumber } from "../utils/format.js";

function slugToName(slug) {
    // Try to match against known aliases
    const decoded = decodeURIComponent(slug || "").replace(/-/g, " ");
    const lowerDecoded = decoded.toLowerCase();

    // Check if it matches a known alias
    for (const [alias, name] of Object.entries(OWNER_ALIASES)) {
        if (alias.toLowerCase() === lowerDecoded || name.toLowerCase() === lowerDecoded) {
            return name;
        }
    }

    // Title case fallback
    return decoded.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function OwnerProfilePage() {
    const { ownerId } = useParams();
    const [searchParams] = useSearchParams();
    const fromSeason = searchParams.get("from");

    const [manifest, setManifest] = useState(null);
    const [allSeasonData, setAllSeasonData] = useState({});
    const [allTransactions, setAllTransactions] = useState({});
    const [allTimeData, setAllTimeData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const ownerName = useMemo(() => slugToName(ownerId), [ownerId]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);

        Promise.all([loadManifest(), loadAllTime()])
            .then(async ([m, allTime]) => {
                if (!active) return;
                setManifest(m);
                setAllTimeData(allTime);

                const seasons = m?.seasons || [];

                // Load all seasons and transactions in parallel
                const seasonPromises = seasons.map((s) => loadSeasonSummary(s).catch(() => null));
                const txPromises = seasons.map((s) => loadTransactions(s).catch(() => null));

                const [seasonResults, txResults] = await Promise.all([
                    Promise.all(seasonPromises),
                    Promise.all(txPromises),
                ]);

                if (!active) return;

                const seasonMap = {};
                const txMap = {};
                seasons.forEach((s, idx) => {
                    if (seasonResults[idx]) seasonMap[s] = seasonResults[idx];
                    if (txResults[idx]) txMap[s] = txResults[idx];
                });

                setAllSeasonData(seasonMap);
                setAllTransactions(txMap);
                setLoading(false);
            })
            .catch((err) => {
                if (!active) return;
                console.error("OwnerProfilePage load error:", err);
                setError(err);
                setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    // Calculate owner stats across all seasons
    const ownerStats = useMemo(() => {
        const stats = {
            seasons: [],
            totalWins: 0,
            totalLosses: 0,
            totalTies: 0,
            totalPointsFor: 0,
            totalPointsAgainst: 0,
            championships: 0,
            playoffAppearances: 0,
            trades: 0,
            adds: 0,
            drops: 0,
            bestFinish: null,
            worstFinish: null,
            bestSeason: null,
            highestScore: null,
        };

        Object.entries(allSeasonData).forEach(([seasonYear, data]) => {
            if (!data?.teams) return;

            const team = data.teams.find((t) => {
                const normalized = normalizeOwnerName(t.owner || t.display_name || t.team_name);
                return normalized.toLowerCase() === ownerName.toLowerCase();
            });

            if (team) {
                const wins = safeNumber(team.wins);
                const losses = safeNumber(team.losses);
                const ties = safeNumber(team.ties);
                const pf = safeNumber(team.points_for);
                const pa = safeNumber(team.points_against);
                const rank = safeNumber(team.final_rank || team.regular_season_rank, 99);

                stats.seasons.push({
                    year: Number(seasonYear),
                    teamName: team.team_name || team.display_name,
                    wins,
                    losses,
                    ties,
                    pointsFor: pf,
                    pointsAgainst: pa,
                    rank,
                    record: team.record || `${wins}-${losses}${ties ? `-${ties}` : ""}`,
                });

                stats.totalWins += wins;
                stats.totalLosses += losses;
                stats.totalTies += ties;
                stats.totalPointsFor += pf;
                stats.totalPointsAgainst += pa;

                if (rank === 1) stats.championships++;
                if (rank <= 4) stats.playoffAppearances++;

                if (!stats.bestFinish || rank < stats.bestFinish.rank) {
                    stats.bestFinish = { year: seasonYear, rank };
                }
                if (!stats.worstFinish || rank > stats.worstFinish.rank) {
                    stats.worstFinish = { year: seasonYear, rank };
                }
                if (!stats.bestSeason || pf > stats.bestSeason.points) {
                    stats.bestSeason = { year: seasonYear, points: pf };
                }
            }
        });

        // Count transactions
        Object.entries(allTransactions).forEach(([, txData]) => {
            if (!txData?.entries) return;

            txData.entries.forEach((entry) => {
                const txOwner = normalizeOwnerName(entry.team || entry.owner || "");
                if (txOwner.toLowerCase() !== ownerName.toLowerCase()) return;

                if (entry.type === "trade") stats.trades++;
                else if (entry.type === "add" || entry.type === "waiver") stats.adds++;
                else if (entry.type === "drop") stats.drops++;
            });
        });

        // Sort seasons descending
        stats.seasons.sort((a, b) => b.year - a.year);

        return stats;
    }, [allSeasonData, allTransactions, ownerName]);

    // Get opponents for head-to-head summary
    const opponents = useMemo(() => {
        const oppMap = new Map();

        // This would need matchup data to properly calculate
        // For now, we'll show all other owners as potential opponents
        Object.values(allSeasonData).forEach((data) => {
            if (!data?.teams) return;
            data.teams.forEach((t) => {
                const name = normalizeOwnerName(t.owner || t.display_name || t.team_name);
                if (name.toLowerCase() !== ownerName.toLowerCase() && name) {
                    oppMap.set(name, (oppMap.get(name) || 0) + 1);
                }
            });
        });

        return [...oppMap.entries()].sort((a, b) => b[1] - a[1]);
    }, [allSeasonData, ownerName]);

    if (loading) {
        return <LoadingState message={`Loading ${ownerName}'s profile...`} />;
    }

    if (error) {
        return <ErrorState message="Failed to load owner profile" />;
    }

    if (ownerStats.seasons.length === 0) {
        return (
            <ErrorState message={`No data found for owner "${ownerName}"`} />
        );
    }

    const winPct = ownerStats.totalWins + ownerStats.totalLosses > 0
        ? ((ownerStats.totalWins / (ownerStats.totalWins + ownerStats.totalLosses)) * 100).toFixed(1)
        : "0.0";

    return (
        <>
            <h1 className="page-title">{ownerName}</h1>
            <p className="page-subtitle">
                League member since {Math.min(...ownerStats.seasons.map((s) => s.year))}
            </p>

            {/* Career Summary Cards */}
            <div className="card-grid">
                <div className="stat-card">
                    <div className="stat-label">All-Time Record</div>
                    <div className="stat-value">
                        {ownerStats.totalWins}-{ownerStats.totalLosses}
                        {ownerStats.totalTies > 0 && `-${ownerStats.totalTies}`}
                    </div>
                    <div className="stat-subtext">{winPct}% win rate</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Championships</div>
                    <div className="stat-value">{ownerStats.championships}</div>
                    <div className="stat-subtext">
                        {ownerStats.playoffAppearances} playoff appearances
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Seasons</div>
                    <div className="stat-value">{ownerStats.seasons.length}</div>
                    <div className="stat-subtext">
                        Best: #{ownerStats.bestFinish?.rank} ({ownerStats.bestFinish?.year})
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Total Points</div>
                    <div className="stat-value">{formatPoints(ownerStats.totalPointsFor, 0)}</div>
                    <div className="stat-subtext">
                        {formatPoints(ownerStats.totalPointsFor / ownerStats.seasons.length, 1)} avg/season
                    </div>
                </div>
            </div>

            {/* Transaction Activity */}
            <div className="section-card">
                <h2 className="section-title">Transaction Activity</h2>
                <div className="flex-row">
                    <span className="pill">🔄 {ownerStats.trades} trades</span>
                    <span className="pill">➕ {ownerStats.adds} adds</span>
                    <span className="pill">➖ {ownerStats.drops} drops</span>
                </div>
            </div>

            {/* Season History */}
            <div className="section-card">
                <h2 className="section-title">Season History</h2>
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th>Team Name</th>
                                <th>Record</th>
                                <th>Finish</th>
                                <th>Points For</th>
                                <th>Points Against</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ownerStats.seasons.map((s) => (
                                <tr key={s.year}>
                                    <td>
                                        <Link to={`/standings?season=${s.year}`}>{s.year}</Link>
                                    </td>
                                    <td>{s.teamName}</td>
                                    <td>{s.record}</td>
                                    <td>
                                        {s.rank === 1 && "🏆 "}
                                        #{s.rank}
                                    </td>
                                    <td>{formatPoints(s.pointsFor, 1)}</td>
                                    <td>{formatPoints(s.pointsAgainst, 1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Head to Head */}
            <div className="section-card">
                <h2 className="section-title">League Rivals</h2>
                <p style={{ color: "var(--ink-500)", marginBottom: "12px" }}>
                    Other owners {ownerName} has competed against
                </p>
                <div className="favorite-list">
                    {opponents.slice(0, 12).map(([name]) => (
                        <Link
                            key={name}
                            to={`/owners/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}`}
                            className="tag"
                        >
                            {name}
                        </Link>
                    ))}
                </div>
            </div>

            <div className="flex-row" style={{ marginTop: "16px" }}>
                <Link to="/teams" className="tag">
                    ← All Teams
                </Link>
                {fromSeason && (
                    <Link to={`/standings?season=${fromSeason}`} className="tag">
                        ← {fromSeason} Standings
                    </Link>
                )}
            </div>
        </>
    );
}
