import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/LoadingState.jsx";
import { loadManifest, loadSeasonSummary, loadWeekData } from "../data/loader.js";
import { normalizeOwnerName } from "../lib/identity.js";
import { formatPoints, safeNumber } from "../utils/format.js";

function getOwnerOptions(seasonData) {
    if (!seasonData) return [];
    const owners = new Set();

    Object.values(seasonData).forEach(season => {
        season.teams?.forEach(team => {
            const name = normalizeOwnerName(team.owner || team.display_name || team.team_name);
            if (name) owners.add(name);
        });
    });

    return Array.from(owners).sort();
}

export default function HeadToHeadPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [manifest, setManifest] = useState(null);
    const [allSeasonData, setAllSeasonData] = useState({});
    const [matchupHistory, setMatchupHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const ownerA = searchParams.get("ownerA") || "";
    const ownerB = searchParams.get("ownerB") || "";

    useEffect(() => {
        let active = true;

        async function loadData() {
            const m = await loadManifest();
            if (!active) return;
            setManifest(m);

            const seasons = m.seasons || [];
            const seasonPromises = seasons.map(s => loadSeasonSummary(s));
            const results = await Promise.all(seasonPromises);

            const seasonMap = {};
            results.forEach((res, idx) => {
                if (res) seasonMap[seasons[idx]] = res;
            });

            if (active) {
                setAllSeasonData(seasonMap);
                setLoading(false);
            }
        }

        loadData();
        return () => { active = false; };
    }, []);

    // Load detailed matchup history when owners are selected
    useEffect(() => {
        if (!ownerA || !ownerB || !manifest) return;

        let active = true;
        setLoading(true);

        async function findMatchups() {
            const history = [];
            const seasons = manifest.seasons || [];

            // We need to check every week of every season
            // Note: This could be heavy, optimized by loading only needed seasons or chunking
            // For now, loading all weekly chunks sequentially to be safe

            for (const season of seasons) {
                // Optimization: Check if both owners participated in this season first
                const summary = allSeasonData[season];
                if (!summary) continue;

                const ownerNames = summary.teams?.map(t =>
                    normalizeOwnerName(t.owner || t.display_name || t.team_name)
                ) || [];

                if (!ownerNames.includes(ownerA) || !ownerNames.includes(ownerB)) {
                    continue;
                }

                // Fetch all weeks for valid seasons
                // Use manifest to determine weeks if available, otherwise default to 18
                const seasonWeeks = manifest.weeksBySeason?.[season] ||
                    Array.from({ length: 18 }, (_, i) => i + 1);

                const weekPromises = seasonWeeks.map(w => loadWeekData(season, w).catch(() => null));
                const weekResults = await Promise.all(weekPromises);

                weekResults.forEach((weekData, idx) => {
                    if (!weekData?.matchups) return;
                    const weekNum = seasonWeeks[idx];

                    weekData.matchups.forEach(matchup => {
                        if (!matchup.rosters || matchup.rosters.length < 2) return;

                        const roster1 = matchup.rosters[0];
                        const roster2 = matchup.rosters[1];
                        if (!roster1 || !roster2) return;

                        // Resolve owners for this specific matchup
                        // We need to map rosterID -> owner from the season summary or roster data
                        // The matchup object often contains minimal info. 
                        // We rely on roster_id or custom owner fields if present.
                        // TatnallLegacy format: roster objects often have 'owner_id' or we match via roster_id to season info.

                        // Helper to get owner name from roster
                        const getOwner = (r) => {
                            // Try direct property
                            if (r.owner) return normalizeOwnerName(r.owner);

                            // Try looking up via roster_id in season summary
                            const team = summary.teams.find(t => t.roster_id === r.roster_id);
                            if (team) return normalizeOwnerName(team.owner || team.display_name || team.team_name);

                            return null;
                        };

                        const name1 = getOwner(roster1);
                        const name2 = getOwner(roster2);

                        if (!name1 || !name2) return;

                        if ((name1 === ownerA && name2 === ownerB) || (name1 === ownerB && name2 === ownerA)) {
                            history.push({
                                season,
                                week: weekNum,
                                winner: roster1.points > roster2.points ? name1 : name2,
                                loser: roster1.points > roster2.points ? name2 : name1,
                                ownerA_score: name1 === ownerA ? roster1.points : roster2.points,
                                ownerB_score: name1 === ownerB ? roster1.points : roster2.points,
                                margin: Math.abs(roster1.points - roster2.points),
                                isPlayoff: weekNum > 14 // Approx rule, could be refined
                            });
                        }
                    });
                });
            }

            if (active) {
                setMatchupHistory(history.sort((a, b) => b.season - a.season || b.week - a.week));
                setLoading(false);
            }
        }

        findMatchups();

        return () => { active = false; };
    }, [ownerA, ownerB, manifest, allSeasonData]);

    const owners = useMemo(() => getOwnerOptions(allSeasonData), [allSeasonData]);

    const stats = useMemo(() => {
        if (!matchupHistory.length) return null;

        let winsA = 0;
        let winsB = 0;
        let totalPointsA = 0;
        let totalPointsB = 0;
        let maxScoreA = 0;
        let maxScoreB = 0;
        let longestStreakA = 0;
        let longestStreakB = 0;
        let currentStreakA = 0;
        let currentStreakB = 0;

        // Process chronological for streaks
        const chronoHistory = [...matchupHistory].reverse();

        chronoHistory.forEach(game => {
            totalPointsA += safeNumber(game.ownerA_score);
            totalPointsB += safeNumber(game.ownerB_score);
            maxScoreA = Math.max(maxScoreA, safeNumber(game.ownerA_score));
            maxScoreB = Math.max(maxScoreB, safeNumber(game.ownerB_score));

            if (game.winner === ownerA) {
                winsA++;
                currentStreakA++;
                currentStreakB = 0;
            } else {
                winsB++;
                currentStreakB++;
                currentStreakA = 0;
            }

            longestStreakA = Math.max(longestStreakA, currentStreakA);
            longestStreakB = Math.max(longestStreakB, currentStreakB);
        });

        return {
            winsA,
            winsB,
            totalPointsA,
            totalPointsB,
            avgA: totalPointsA / matchupHistory.length,
            avgB: totalPointsB / matchupHistory.length,
            maxScoreA,
            maxScoreB,
            longestStreakA,
            longestStreakB
        };

    }, [matchupHistory, ownerA, ownerB]);


    const handleOwnerChange = (param, value) => {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(param, value);
        } else {
            newParams.delete(param);
        }
        setSearchParams(newParams);
    };

    if (loading && !manifest) {
        return <LoadingState message="Loading head-to-head data..." />;
    }

    return (
        <>
            <h1 className="page-title">⚔️ Head-to-Head Comparison</h1>
            <p className="page-subtitle">Compare history between any two league members</p>

            <div className="section-card filters">
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Owner 1</label>
                        <select
                            style={{ width: '100%', padding: '8px' }}
                            value={ownerA}
                            onChange={e => handleOwnerChange('ownerA', e.target.value)}
                        >
                            <option value="">Select Owner...</option>
                            {owners.map(o => (
                                <option key={o} value={o} disabled={o === ownerB}>{o}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--ink-400)' }}>VS</div>

                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Owner 2</label>
                        <select
                            style={{ width: '100%', padding: '8px' }}
                            value={ownerB}
                            onChange={e => handleOwnerChange('ownerB', e.target.value)}
                        >
                            <option value="">Select Owner...</option>
                            {owners.map(o => (
                                <option key={o} value={o} disabled={o === ownerA}>{o}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {ownerA && ownerB && loading && (
                <LoadingState message={`Analyzing history between ${ownerA} and ${ownerB}...`} />
            )}

            {ownerA && ownerB && !loading && matchupHistory.length === 0 && (
                <div className="section-card" style={{ textAlign: 'center', padding: '40px' }}>
                    <h3>No Matchups Found</h3>
                    <p>These owners have never played each other in the recorded history.</p>
                </div>
            )}

            {stats && (
                <div className="card-grid">
                    <div className="stat-card" style={{ gridColumn: 'span 2' }}>
                        <div className="stat-label">All-Time Record</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.winsA}</div>
                                <div style={{ fontSize: '0.8rem' }}>{ownerA}</div>
                            </div>
                            <div style={{ fontSize: '1.2rem', color: 'var(--ink-400)' }}>-</div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.winsB}</div>
                                <div style={{ fontSize: '0.8rem' }}>{ownerB}</div>
                            </div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-label">Total Points</div>
                        <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                            {formatPoints(stats.totalPointsA, 0)} - {formatPoints(stats.totalPointsB, 0)}
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-label">Longest Streak</div>
                        <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                            {stats.longestStreakA > stats.longestStreakB ? `${ownerA} (${stats.longestStreakA})` : `${ownerB} (${stats.longestStreakB})`}
                        </div>
                    </div>
                </div>
            )}

            {matchupHistory.length > 0 && (
                <div className="section-card">
                    <h2 className="section-title">Matchup History</h2>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Year</th>
                                    <th>Week</th>
                                    <th>Winner</th>
                                    <th style={{ textAlign: 'right' }}>{ownerA}</th>
                                    <th style={{ textAlign: 'right' }}>{ownerB}</th>
                                    <th style={{ textAlign: 'right' }}>Diff</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matchupHistory.map((game, idx) => (
                                    <tr key={`${game.season}-${game.week}-${idx}`}>
                                        <td><Link to={`/matchups?season=${game.season}&week=${game.week}`}>{game.season}</Link></td>
                                        <td>{game.week}</td>
                                        <td>
                                            <span style={{
                                                fontWeight: 600,
                                                color: game.winner === ownerA ? 'var(--primary-600)' : 'var(--accent-600)'
                                            }}>
                                                {game.winner}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: game.winner === ownerA ? 700 : 400 }}>
                                            {formatPoints(game.ownerA_score)}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: game.winner === ownerB ? 700 : 400 }}>
                                            {formatPoints(game.ownerB_score)}
                                        </td>
                                        <td style={{ textAlign: 'right', color: 'var(--ink-400)' }}>
                                            {formatPoints(game.margin)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
    );
}
