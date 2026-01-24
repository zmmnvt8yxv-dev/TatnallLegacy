import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/LoadingState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useHeadToHeadData } from "../hooks/useHeadToHeadData";
import PageTransition from "../components/PageTransition.jsx";
import { normalizeOwnerName } from "../lib/identity";
import { formatPoints, safeNumber } from "../utils/format";
import type { Manifest } from "../types/index";

interface SeasonTeam {
    owner?: string;
    display_name?: string;
    team_name?: string;
    roster_id?: string | number;
}

interface SeasonData {
    teams?: SeasonTeam[];
}

interface Roster {
    owner?: string;
    roster_id?: string | number;
    points: number;
}

interface MatchupData {
    rosters?: Roster[];
}

interface WeekData {
    season: number;
    week: number;
    matchups?: MatchupData[];
}

interface MatchupHistoryEntry {
    season: number;
    week: number;
    winner: string;
    loser: string;
    ownerA_score: number;
    ownerB_score: number;
    margin: number;
    isPlayoff: boolean;
}

interface Stats {
    winsA: number;
    winsB: number;
    totalPointsA: number;
    totalPointsB: number;
    avgA: number;
    avgB: number;
    maxScoreA: number;
    maxScoreB: number;
    longestStreakA: number;
    longestStreakB: number;
}

function getOwnerOptions(seasonData: Record<string, SeasonData> | null): string[] {
    if (!seasonData) return [];
    const owners = new Set<string>();

    Object.values(seasonData).forEach(season => {
        season.teams?.forEach(team => {
            const name = normalizeOwnerName(team.owner || team.display_name || team.team_name);
            if (name) owners.add(name);
        });
    });

    return Array.from(owners).sort();
}

export default function HeadToHeadPage(): React.ReactElement {
    const [searchParams, setSearchParams] = useSearchParams();

    const ownerA = searchParams.get("ownerA") || "";
    const ownerB = searchParams.get("ownerB") || "";

    const {
        manifest,
        allSeasonData,
        allWeekData,
        isLoading: loading,
        isError: error
    } = useHeadToHeadData(ownerA, ownerB) as {
        manifest: Manifest | undefined;
        allSeasonData: Record<string, SeasonData>;
        allWeekData: WeekData[];
        isLoading: boolean;
        isError: boolean;
    };

    const matchupHistory = useMemo((): MatchupHistoryEntry[] => {
        if (!ownerA || !ownerB || !allWeekData.length || !allSeasonData) return [];

        const history: MatchupHistoryEntry[] = [];

        allWeekData.forEach(weekData => {
            if (!weekData?.matchups) return;
            const season = weekData.season;
            const summary = allSeasonData[season];
            if (!summary) return;

            weekData.matchups.forEach(matchup => {
                if (!matchup.rosters || matchup.rosters.length < 2) return;

                const roster1 = matchup.rosters[0];
                const roster2 = matchup.rosters[1];
                if (!roster1 || !roster2) return;

                const getOwner = (r: Roster): string | null => {
                    if (r.owner) return normalizeOwnerName(r.owner);
                    const team = summary.teams?.find(t => t.roster_id === r.roster_id);
                    if (team) return normalizeOwnerName(team.owner || team.display_name || team.team_name);
                    return null;
                };

                const name1 = getOwner(roster1);
                const name2 = getOwner(roster2);

                if (!name1 || !name2) return;

                if ((name1 === ownerA && name2 === ownerB) || (name1 === ownerB && name2 === ownerA)) {
                    history.push({
                        season,
                        week: weekData.week,
                        winner: roster1.points > roster2.points ? name1 : name2,
                        loser: roster1.points > roster2.points ? name2 : name1,
                        ownerA_score: name1 === ownerA ? roster1.points : roster2.points,
                        ownerB_score: name1 === ownerB ? roster1.points : roster2.points,
                        margin: Math.abs(roster1.points - roster2.points),
                        isPlayoff: weekData.week > 14
                    });
                }
            });
        });

        return history.sort((a, b) => b.season - a.season || b.week - a.week);
    }, [allWeekData, allSeasonData, ownerA, ownerB]);

    const owners = useMemo(() => getOwnerOptions(allSeasonData), [allSeasonData]);

    const stats = useMemo((): Stats | null => {
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

        const chronoHistory = [...matchupHistory].reverse();

        chronoHistory.forEach(game => {
            totalPointsA += safeNumber(game.ownerA_score, 0);
            totalPointsB += safeNumber(game.ownerB_score, 0);
            maxScoreA = Math.max(maxScoreA, safeNumber(game.ownerA_score, 0));
            maxScoreB = Math.max(maxScoreB, safeNumber(game.ownerB_score, 0));

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


    const handleOwnerChange = (param: string, value: string): void => {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(param, value);
        } else {
            newParams.delete(param);
        }
        setSearchParams(newParams);
    };

    if (loading && !manifest) {
        return <LoadingState label="Loading head-to-head data..." />;
    }

    if (error) {
        return <ErrorState message="Failed to load head-to-head data" />;
    }

    return (
        <PageTransition>
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
        </PageTransition>
    );
}
