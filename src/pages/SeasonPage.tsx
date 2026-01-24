import React, { useEffect, useMemo, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PlayoffBracket from "../components/PlayoffBracket.jsx";
import KiltBowlBracket from "../components/KiltBowlBracket.jsx";
import { useDataContext } from "../data/DataContext";
import { useSeasonDetails } from "../hooks/useSeasonDetails";
import { formatPoints } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { resolvePlayerName } from "../lib/playerName";
import type { Manifest, PlayerIndex, EspnNameMap } from "../types/index";

interface Team {
    owner?: string;
    display_name?: string;
    team_name?: string;
    team?: string;
    final_rank?: number;
    points_for?: number;
}

interface StandingsRow {
    team: string;
    owner?: string;
    display_name?: string;
    team_name?: string;
    rank?: number;
    wins: number;
    losses: number;
    points_for: number;
}

interface Summary {
    teams?: Team[];
    standings?: StandingsRow[];
    champion?: Team;
    runnerUp?: Team;
    kiltBowlLoser?: Team;
    playoffBracket?: unknown;
    kiltBowl?: unknown;
}

interface PlayerStat {
    player_id?: string;
    position?: string;
    fantasy_points_custom?: number;
    [key: string]: unknown;
}

interface Transactions {
    entries?: unknown[];
}

interface LoadErrors {
    summary: boolean;
    stats: boolean;
}

function getMvp(playerStats: PlayerStat[] | undefined): PlayerStat | null {
    if (!playerStats || !playerStats.length) return null;
    const sorted = [...playerStats].sort((a, b) => (b.fantasy_points_custom || 0) - (a.fantasy_points_custom || 0));
    return sorted[0];
}

export default function SeasonPage(): React.ReactElement {
    const { manifest, loading, error, playerIndex, espnNameMap } = useDataContext() as {
        manifest: Manifest | undefined;
        loading: boolean;
        error: string | null;
        playerIndex: PlayerIndex;
        espnNameMap: EspnNameMap;
    };
    const [searchParams, setSearchParams] = useSearchParams();

    const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
    const [season, setSeason] = useState<number | string>(seasons[0] || "");

    useEffect(() => {
        if (!seasons.length) return;
        const paramSeason = Number(searchParams.get("season"));
        if (Number.isFinite(paramSeason) && seasons.includes(paramSeason) && paramSeason !== Number(season)) {
            setSeason(paramSeason);
        } else if (!paramSeason && season) {
            const p = new URLSearchParams(searchParams);
            p.set("season", String(season));
            setSearchParams(p, { replace: true });
        }
    }, [searchParams, seasons, season, setSearchParams]);

    const handleSeasonChange = (val: string): void => {
        const s = Number(val);
        setSeason(s);
        const p = new URLSearchParams(searchParams);
        p.set("season", String(s));
        setSearchParams(p);
    };

    const {
        summary,
        playerStats,
        transactions,
        isLoading: pageLoading,
        errors: loadErrors
    } = useSeasonDetails(season) as {
        summary: Summary | undefined;
        playerStats: PlayerStat[] | undefined;
        transactions: Transactions | undefined;
        isLoading: boolean;
        errors: LoadErrors;
    };

    const champion = useMemo((): Team | null => {
        if (summary?.champion) return summary.champion;
        const teams = summary?.teams || [];
        return teams.find(t => t.final_rank === 1) || null;
    }, [summary]);

    const runnerUp = useMemo((): Team | null => {
        if (summary?.runnerUp) return summary.runnerUp;
        const teams = summary?.teams || [];
        return teams.find(t => t.final_rank === 2) || null;
    }, [summary]);

    const kiltBowlLoser = useMemo((): Team | null => {
        if (summary?.kiltBowlLoser) return summary.kiltBowlLoser;
        const teams = summary?.teams || [];
        return teams.find(t => t.final_rank === 8) || null;
    }, [summary]);

    const scoringChamp = useMemo((): Team | null => {
        if (!summary?.teams) return null;
        return [...summary.teams].sort((a, b) => (b.points_for || 0) - (a.points_for || 0))[0];
    }, [summary]);

    const mvp = useMemo(() => getMvp(playerStats), [playerStats]);

    const transactionCount = useMemo(() => transactions?.entries?.length || 0, [transactions]);

    const ownerLabel = (t: Team | StandingsRow | null | undefined): string =>
        t ? normalizeOwnerName(t.owner || t.display_name || t.team_name || t.team) : "—";

    const getPlayerName = (row: PlayerStat): string => resolvePlayerName(row, playerIndex, espnNameMap);

    if (loading) return <LoadingState label="Loading season data..." />;
    if (error) return <ErrorState message={error} />;

    return (
        <PageTransition>
            <section className="mb-6">
                <h1 className="text-5xl md:text-6xl font-display font-black text-ink-900 mb-3">Season Overview</h1>
                <p className="text-lg md:text-xl text-ink-600">Champions, awards, and statistics for {season}</p>
            </section>

            <section className="section-card filters mb-6">
                <label className="text-base md:text-lg font-bold text-ink-700">Select Season:</label>
                <select
                    value={season}
                    onChange={(e) => handleSeasonChange(e.target.value)}
                    className="rounded-md border-2 border-ink-300 bg-white px-4 py-2 text-base md:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[140px]"
                >
                    {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </section>

            {pageLoading ? (
                <LoadingState label={`Loading ${season} data...`} />
            ) : (
                <div className="season-content">
                    {loadErrors.summary && (
                        <div className="error-banner" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', borderRadius: '4px' }}>
                            <p style={{ margin: 0, color: '#ef4444' }}>⚠️ Partial Data: League summary and standings could not be loaded for {season}.</p>
                        </div>
                    )}
                    {loadErrors.stats && !loadErrors.summary && (
                        <div className="error-banner" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6', borderRadius: '4px' }}>
                            <p style={{ margin: 0, color: '#3b82f6' }}>ℹ️ Player statistics for this season are currently unavailable.</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                        <div className="stat-card accent p-4 md:p-6">
                            <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest mb-2">League Champion</div>
                            <div className="text-2xl md:text-3xl font-display font-black text-ink-900 mb-1">{champion ? ownerLabel(champion) : "—"}</div>
                            {champion && normalizeOwnerName(champion.team || champion.team_name).toLowerCase() !== ownerLabel(champion).toLowerCase() && (
                                <div className="text-xs md:text-sm text-ink-500">
                                    {champion.team || champion.team_name}
                                </div>
                            )}
                        </div>

                        <div className="stat-card p-4 md:p-6">
                            <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest mb-2">Runner Up</div>
                            <div className="text-2xl md:text-3xl font-display font-black text-ink-900 mb-1">{runnerUp ? ownerLabel(runnerUp) : "—"}</div>
                            {runnerUp && normalizeOwnerName(runnerUp.team || runnerUp.team_name).toLowerCase() !== ownerLabel(runnerUp).toLowerCase() && (
                                <div className="text-xs md:text-sm text-ink-500">
                                    {runnerUp.team || runnerUp.team_name}
                                </div>
                            )}
                        </div>

                        <div className="stat-card p-4 md:p-6">
                            <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest mb-2">Kilt Bowl Loser</div>
                            <div className="text-2xl md:text-3xl font-display font-black text-ink-900 mb-1">{kiltBowlLoser ? ownerLabel(kiltBowlLoser) : "—"}</div>
                            {kiltBowlLoser && normalizeOwnerName(kiltBowlLoser.team).toLowerCase() !== ownerLabel(kiltBowlLoser).toLowerCase() && (
                                <div className="text-xs md:text-sm text-ink-500">
                                    {kiltBowlLoser.team}
                                </div>
                            )}
                        </div>

                        <div className="stat-card p-4 md:p-6">
                            <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest mb-2">Scoring Leader</div>
                            <div className="text-2xl md:text-3xl font-display font-black text-ink-900 mb-1">{scoringChamp ? ownerLabel(scoringChamp) : "—"}</div>
                            <div className="text-base md:text-lg text-accent-700 font-bold">{scoringChamp ? formatPoints(scoringChamp.points_for) : "—"} pts</div>
                        </div>

                        <div className="stat-card p-4 md:p-6">
                            <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest mb-2">Season MVP</div>
                            <div className="text-xl md:text-2xl font-display font-black text-ink-900 mb-1">
                                {mvp ? (
                                    <Link to={`/players/${mvp.player_id}`} className="hover:text-accent-700 transition-colors">
                                        {getPlayerName(mvp)}
                                    </Link>
                                ) : "—"}
                            </div>
                            <div className="text-base md:text-lg text-accent-700 font-bold">
                                {mvp ? `${formatPoints(mvp.fantasy_points_custom)} pts` : "—"}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="section-card">
                            <h2 className="text-2xl md:text-3xl font-black mb-4">Final Standings</h2>
                            {summary?.standings?.length ? (
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th className="text-base md:text-lg">Rank</th>
                                                <th className="text-base md:text-lg">Team</th>
                                                <th className="text-base md:text-lg">Record</th>
                                                <th className="text-base md:text-lg">Points</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...summary.standings]
                                                .filter(row => row.team !== "Away" && row.team !== "Team Away")
                                                .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                                                .map(row => (
                                                    <tr key={row.team}>
                                                        <td className="text-base md:text-xl font-black text-accent-700">{row.rank || "-"}</td>
                                                        <td>
                                                            <div className="font-bold text-base md:text-lg">
                                                                {ownerLabel(row)}
                                                            </div>
                                                            {normalizeOwnerName(row.team).toLowerCase() !== ownerLabel(row).toLowerCase() && (
                                                                <div className="text-sm text-ink-400">{row.team}</div>
                                                            )}
                                                        </td>
                                                        <td className="text-base md:text-lg font-mono font-bold">{row.wins}-{row.losses}</td>
                                                        <td className="text-base md:text-xl font-display font-black text-accent-700">{formatPoints(row.points_for)}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-base text-ink-400 py-5">
                                    {loadErrors.summary ? "Failed to load standings data." : "No standings available for this season."}
                                </div>
                            )}
                        </div>

                        <div className="section-card">
                            <h2 className="text-2xl md:text-3xl font-black mb-4">Season Facts</h2>
                            <ul className="space-y-3 text-base md:text-lg">
                                <li>
                                    <strong className="text-ink-900">Trades & Transactions:</strong> <span className="text-accent-700 font-bold">{transactionCount}</span>
                                </li>
                                <li>
                                    <strong className="text-ink-900">Teams:</strong> <span className="text-accent-700 font-bold">{summary?.teams?.length || 0}</span>
                                </li>
                                <li>
                                    <strong className="text-ink-900">Weeks:</strong> <span className="text-accent-700 font-bold">{(manifest?.weeksBySeason?.[String(season)] || []).length}</span>
                                </li>
                            </ul>
                            <div className="mt-6 flex flex-col gap-3">
                                <Link to={`/matchups?season=${season}`} className="button text-base md:text-lg py-3">Browse Matchups</Link>
                                <Link to={`/transactions?season=${season}`} className="button secondary text-base md:text-lg py-3">View Transactions</Link>
                            </div>
                        </div>
                    </div>

                    <PlayoffBracket
                        bracket={summary?.playoffBracket}
                        champion={champion}
                        runnerUp={runnerUp}
                    />

                    <KiltBowlBracket kiltBowl={summary?.kiltBowl} />
                </div>
            )}
        </PageTransition>
    );
}
