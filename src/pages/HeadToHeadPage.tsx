import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/LoadingState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useHeadToHeadData } from "../hooks/useHeadToHeadData";
import PageTransition from "../components/PageTransition.jsx";
import { normalizeOwnerName } from "../lib/identity";
import { formatPoints, safeNumber } from "../utils/format";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Swords, Users, Trophy, TrendingUp, Target, Zap, ChevronRight, Crown, Flame } from "lucide-react";
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

    const leaderA = stats ? stats.winsA > stats.winsB : false;
    const leaderB = stats ? stats.winsB > stats.winsA : false;

    return (
        <PageTransition>
            {/* Hero Section */}
            <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-accent-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />

                <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />

                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-4 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl shadow-lg shadow-red-500/30">
                            <Swords className="text-white drop-shadow-md" size={32} />
                        </div>
                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 px-4 py-1.5 text-sm font-bold">
                            <Users size={14} className="mr-2" />
                            Rivalry Mode
                        </Badge>
                    </div>

                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-red-300 bg-clip-text text-transparent drop-shadow-lg mb-4">
                        Head-to-Head
                        <span className="text-red-400 text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">.</span>
                    </h1>
                    <p className="text-lg md:text-xl text-ink-300 max-w-3xl leading-relaxed">
                        Compare history between any two league members and discover rivalry stats.
                    </p>
                </div>
            </div>

            {/* Owner Selection */}
            <div className="bg-white rounded-2xl shadow-lg border border-ink-200/50 p-8 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="relative z-10">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2 mb-3">
                                <Users size={14} className="text-blue-500" />
                                Owner 1
                            </label>
                            <select
                                className="w-full rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300 transition-all"
                                value={ownerA}
                                onChange={e => handleOwnerChange('ownerA', e.target.value)}
                            >
                                <option value="">Select Owner...</option>
                                {owners.map(o => (
                                    <option key={o} value={o} disabled={o === ownerB}>{o}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                                <span className="text-white font-display font-black text-xl">VS</span>
                            </div>
                        </div>

                        <div className="flex-1 min-w-[200px]">
                            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2 mb-3">
                                <Users size={14} className="text-purple-500" />
                                Owner 2
                            </label>
                            <select
                                className="w-full rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-300 transition-all"
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
            </div>

            {ownerA && ownerB && loading && (
                <LoadingState message={`Analyzing history between ${ownerA} and ${ownerB}...`} />
            )}

            {ownerA && ownerB && !loading && matchupHistory.length === 0 && (
                <Card className="shadow-lg border-2 border-dashed border-ink-200 bg-ink-50/30">
                    <CardContent className="py-16 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ink-100 flex items-center justify-center">
                            <Swords size={32} className="text-ink-400" />
                        </div>
                        <h3 className="text-xl font-display font-black text-ink-900 mb-2">No Matchups Found</h3>
                        <p className="text-ink-500">These owners have never played each other in the recorded history.</p>
                    </CardContent>
                </Card>
            )}

            {stats && (
                <>
                    {/* All-Time Record Card */}
                    <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 rounded-2xl p-1 mb-8 shadow-xl">
                        <div className="bg-white rounded-xl p-8">
                            <div className="text-center mb-6">
                                <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">All-Time Head-to-Head Record</span>
                            </div>
                            <div className="flex items-center justify-center gap-8">
                                <div className={`text-center flex-1 p-6 rounded-xl transition-all ${leaderA ? 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300' : 'bg-ink-50'}`}>
                                    {leaderA && <Crown className="mx-auto mb-2 text-amber-500" size={24} />}
                                    <div className={`text-6xl font-display font-black ${leaderA ? 'text-green-600' : 'text-ink-600'}`}>{stats.winsA}</div>
                                    <div className="text-lg font-display font-bold text-ink-700 mt-2">{ownerA}</div>
                                </div>
                                <div className="text-4xl font-display font-black text-ink-300">—</div>
                                <div className={`text-center flex-1 p-6 rounded-xl transition-all ${leaderB ? 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300' : 'bg-ink-50'}`}>
                                    {leaderB && <Crown className="mx-auto mb-2 text-amber-500" size={24} />}
                                    <div className={`text-6xl font-display font-black ${leaderB ? 'text-green-600' : 'text-ink-600'}`}>{stats.winsB}</div>
                                    <div className="text-lg font-display font-bold text-ink-700 mt-2">{ownerB}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                        <div className="group relative bg-white rounded-2xl p-6 border-2 border-blue-200 hover:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <Target className="text-blue-500" size={18} />
                                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Total Points</span>
                                </div>
                                <div className="text-xl font-display font-black text-ink-900">
                                    {formatPoints(stats.totalPointsA, 0)} - {formatPoints(stats.totalPointsB, 0)}
                                </div>
                            </div>
                        </div>

                        <div className="group relative bg-white rounded-2xl p-6 border-2 border-purple-200 hover:border-purple-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp className="text-purple-500" size={18} />
                                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Avg Points</span>
                                </div>
                                <div className="text-xl font-display font-black text-ink-900">
                                    {formatPoints(stats.avgA, 1)} - {formatPoints(stats.avgB, 1)}
                                </div>
                            </div>
                        </div>

                        <div className="group relative bg-white rounded-2xl p-6 border-2 border-amber-200 hover:border-amber-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <Zap className="text-amber-500" size={18} />
                                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Best Game</span>
                                </div>
                                <div className="text-xl font-display font-black text-ink-900">
                                    {formatPoints(stats.maxScoreA, 1)} - {formatPoints(stats.maxScoreB, 1)}
                                </div>
                            </div>
                        </div>

                        <div className="group relative bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <Flame className="text-red-200" size={18} />
                                    <span className="text-[10px] font-bold text-red-200 uppercase tracking-[0.15em]">Longest Streak</span>
                                </div>
                                <div className="text-xl font-display font-black">
                                    {stats.longestStreakA > stats.longestStreakB
                                        ? `${ownerA} (${stats.longestStreakA})`
                                        : `${ownerB} (${stats.longestStreakB})`}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {matchupHistory.length > 0 && (
                <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg shadow-red-500/20">
                                <Trophy className="text-white" size={22} />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-display font-black">Matchup History</CardTitle>
                                <CardDescription className="text-sm text-ink-500 font-medium">{matchupHistory.length} total games played</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 relative z-10">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                                        <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Year</th>
                                        <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Week</th>
                                        <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Winner</th>
                                        <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">{ownerA}</th>
                                        <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">{ownerB}</th>
                                        <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Diff</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100">
                                    {matchupHistory.map((game, idx) => (
                                        <tr key={`${game.season}-${game.week}-${idx}`} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                                            <td className="py-4 px-5">
                                                <Link to={`/matchups?season=${game.season}&week=${game.week}`} className="font-bold text-accent-600 hover:text-accent-700 hover:underline transition-colors">
                                                    {game.season}
                                                </Link>
                                            </td>
                                            <td className="py-4 px-5">
                                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-ink-100 font-mono font-bold text-ink-700">
                                                    {game.week}
                                                </span>
                                            </td>
                                            <td className="py-4 px-5">
                                                <div className="flex items-center gap-2">
                                                    <Crown size={16} className={game.winner === ownerA ? 'text-blue-500' : 'text-purple-500'} />
                                                    <span className={`font-display font-black ${game.winner === ownerA ? 'text-blue-600' : 'text-purple-600'}`}>
                                                        {game.winner}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-5 text-right">
                                                <span className={`font-display text-xl font-black ${game.winner === ownerA ? 'text-green-600' : 'text-ink-500'}`}>
                                                    {formatPoints(game.ownerA_score)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-5 text-right">
                                                <span className={`font-display text-xl font-black ${game.winner === ownerB ? 'text-green-600' : 'text-ink-500'}`}>
                                                    {formatPoints(game.ownerB_score)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-5 text-right">
                                                <Badge variant="outline" className="font-mono font-bold">
                                                    {formatPoints(game.margin)}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </PageTransition>
    );
}
