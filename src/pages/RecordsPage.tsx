import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useRecords } from "../hooks/useRecords";
import PageTransition from "../components/PageTransition.jsx";
import { normalizeOwnerName } from "../lib/identity";
import { formatPoints, safeNumber } from "../utils/format";
import type { Manifest } from "../types/index";

interface SeasonTeam {
    owner?: string;
    display_name?: string;
    team_name?: string;
    final_rank?: number;
    regular_season_rank?: number;
    points_for?: number;
    wins?: number;
    losses?: number;
}

interface SeasonData {
    teams?: SeasonTeam[];
}

interface CareerLeader {
    sleeper_id?: string;
    player_id?: string;
    display_name?: string;
    player_name?: string;
    points?: number;
    games?: number;
    seasons?: number;
}

interface AllTimeData {
    careerLeaders?: CareerLeader[];
}

interface Champion {
    year: number;
    owner: string;
    teamName: string;
    pointsFor: number;
}

interface BestSeason {
    year: number;
    owner: string;
    teamName: string;
    pointsFor: number;
    wins: number;
    losses: number;
    rank: number;
}

interface OwnerStats {
    seasons: number;
    wins: number;
    losses: number;
    pointsFor: number;
    championships: number;
    playoffs: number;
}

interface Records {
    champions: Champion[];
    bestSeasons: BestSeason[];
    highestScorers: CareerLeader[];
    mostChampionships: Map<string, number>;
    mostPlayoffs: Map<string, number>;
    allOwners: Map<string, OwnerStats>;
}

function slugifyOwner(name: string): string {
    return encodeURIComponent(String(name || "").toLowerCase().replace(/\s+/g, "-"));
}

export default function RecordsPage(): React.ReactElement {
    const {
        manifest,
        allSeasonData,
        allTimeData,
        isLoading: loading,
        isError: error
    } = useRecords() as {
        manifest: Manifest | undefined;
        allSeasonData: Record<string, SeasonData>;
        allTimeData: AllTimeData | undefined;
        isLoading: boolean;
        isError: boolean;
    };

    const records = useMemo((): Records => {
        const rec: Records = {
            champions: [],
            bestSeasons: [],
            highestScorers: [],
            mostChampionships: new Map(),
            mostPlayoffs: new Map(),
            allOwners: new Map(),
        };

        Object.entries(allSeasonData).forEach(([year, data]) => {
            if (!data?.teams) return;

            const champion = data.teams.find(
                (t) => t.final_rank === 1 || t.regular_season_rank === 1
            );
            if (champion) {
                const owner = normalizeOwnerName(champion.owner || champion.display_name);
                rec.champions.push({
                    year: Number(year),
                    owner,
                    teamName: champion.team_name || champion.display_name || "",
                    pointsFor: safeNumber(champion.points_for, 0),
                });
                rec.mostChampionships.set(owner, (rec.mostChampionships.get(owner) || 0) + 1);
            }

            data.teams.forEach((t) => {
                const owner = normalizeOwnerName(t.owner || t.display_name || t.team_name);
                if (!owner) return;

                if (!rec.allOwners.has(owner)) {
                    rec.allOwners.set(owner, {
                        seasons: 0,
                        wins: 0,
                        losses: 0,
                        pointsFor: 0,
                        championships: 0,
                        playoffs: 0,
                    });
                }

                const ownerStats = rec.allOwners.get(owner)!;
                ownerStats.seasons++;
                ownerStats.wins += safeNumber(t.wins, 0);
                ownerStats.losses += safeNumber(t.losses, 0);
                ownerStats.pointsFor += safeNumber(t.points_for, 0);

                const rank = safeNumber(t.final_rank || t.regular_season_rank, 0);
                if (rank === 1) ownerStats.championships++;
                if (rank <= 4 && rank > 0) ownerStats.playoffs++;

                rec.bestSeasons.push({
                    year: Number(year),
                    owner,
                    teamName: t.team_name || t.display_name || "",
                    pointsFor: safeNumber(t.points_for, 0),
                    wins: safeNumber(t.wins, 0),
                    losses: safeNumber(t.losses, 0),
                    rank,
                });
            });
        });

        rec.bestSeasons.sort((a, b) => b.pointsFor - a.pointsFor);
        rec.champions.sort((a, b) => b.year - a.year);

        if (allTimeData?.careerLeaders) {
            rec.highestScorers = allTimeData.careerLeaders.slice(0, 10);
        }

        return rec;
    }, [allSeasonData, allTimeData]);

    const championshipLeaders = useMemo(() => {
        return [...records.mostChampionships.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([owner, count]) => ({ owner, championships: count }));
    }, [records.mostChampionships]);

    const allTimeOwnerStats = useMemo(() => {
        return [...records.allOwners.entries()]
            .map(([owner, stats]) => ({
                owner,
                ...stats,
                winPct:
                    stats.wins + stats.losses > 0
                        ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
                        : "0.0",
            }))
            .sort((a, b) => b.wins - a.wins);
    }, [records.allOwners]);

    if (loading) {
        return <LoadingState label="Compiling league records..." />;
    }

    if (error) {
        return <ErrorState message="Failed to load records" />;
    }

    return (
        <PageTransition>
            <h1 className="page-title">🏆 League Records</h1>
            <p className="page-subtitle">
                All-time achievements and records across {manifest?.seasons?.length || 0} seasons
            </p>

            <div className="section-card">
                <h2 className="section-title">League Champions</h2>
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th>Champion</th>
                                <th>Team Name</th>
                                <th>Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.champions.map((c) => (
                                <tr key={c.year}>
                                    <td>
                                        <Link to={`/standings?season=${c.year}`}>{c.year}</Link>
                                    </td>
                                    <td>
                                        <Link to={`/owners/${slugifyOwner(c.owner)}`}>{c.owner}</Link>
                                    </td>
                                    <td>{c.teamName}</td>
                                    <td>{formatPoints(c.pointsFor, 1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card-grid">
                <div className="section-card">
                    <h2 className="section-title">Most Championships</h2>
                    {championshipLeaders.slice(0, 5).map((l, idx) => (
                        <div
                            key={l.owner}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "8px 0",
                                borderBottom: idx < 4 ? "1px solid var(--ink-200)" : "none",
                            }}
                        >
                            <Link to={`/owners/${slugifyOwner(l.owner)}`}>{l.owner}</Link>
                            <span className="pill">{l.championships}x 🏆</span>
                        </div>
                    ))}
                </div>

                <div className="section-card">
                    <h2 className="section-title">Best Single Seasons</h2>
                    {records.bestSeasons.slice(0, 5).map((s, idx) => (
                        <div
                            key={`${s.year}-${s.owner}`}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "8px 0",
                                borderBottom: idx < 4 ? "1px solid var(--ink-200)" : "none",
                            }}
                        >
                            <div>
                                <Link to={`/owners/${slugifyOwner(s.owner)}`}>{s.owner}</Link>
                                <span style={{ color: "var(--ink-500)", marginLeft: "8px" }}>
                                    ({s.year})
                                </span>
                            </div>
                            <span>{formatPoints(s.pointsFor, 1)} pts</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="section-card">
                <h2 className="section-title">All-Time Owner Standings</h2>
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Owner</th>
                                <th>Seasons</th>
                                <th>Record</th>
                                <th>Win %</th>
                                <th>Total Pts</th>
                                <th>🏆</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allTimeOwnerStats.map((o) => (
                                <tr key={o.owner}>
                                    <td>
                                        <Link to={`/owners/${slugifyOwner(o.owner)}`}>{o.owner}</Link>
                                    </td>
                                    <td>{o.seasons}</td>
                                    <td>
                                        {o.wins}-{o.losses}
                                    </td>
                                    <td>{o.winPct}%</td>
                                    <td>{formatPoints(o.pointsFor, 0)}</td>
                                    <td>{o.championships > 0 ? o.championships : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {records.highestScorers.length > 0 && (
                <div className="section-card">
                    <h2 className="section-title">Career Fantasy Point Leaders (Players)</h2>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Player</th>
                                    <th>Career Points</th>
                                    <th>Games</th>
                                    <th>Seasons</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.highestScorers.map((p, idx) => (
                                    <tr key={p.sleeper_id || p.player_id || idx}>
                                        <td>{idx + 1}</td>
                                        <td>
                                            <Link to={`/players/${p.sleeper_id || p.player_id}`}>
                                                {p.display_name || p.player_name}
                                            </Link>
                                        </td>
                                        <td>{formatPoints(p.points, 1)}</td>
                                        <td>{p.games || "—"}</td>
                                        <td>{p.seasons || "—"}</td>
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
