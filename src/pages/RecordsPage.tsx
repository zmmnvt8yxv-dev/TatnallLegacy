import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useRecords } from "../hooks/useRecords";
import PageTransition from "../components/PageTransition.jsx";
import { normalizeOwnerName } from "../lib/identity";
import { formatPoints, safeNumber } from "../utils/format";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Trophy, Crown, Star, Users, TrendingUp, Award, ChevronRight, Medal, Target, Zap } from "lucide-react";
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
            {/* Hero Section */}
            <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-accent-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-yellow-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />

                <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-4 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl shadow-lg shadow-amber-500/30">
                            <Trophy className="text-white drop-shadow-md" size={32} />
                        </div>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 px-4 py-1.5 text-sm font-bold">
                            <Star size={14} className="mr-2" />
                            Hall of Fame
                        </Badge>
                    </div>

                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-amber-300 bg-clip-text text-transparent drop-shadow-lg mb-4">
                        League Records
                        <span className="text-amber-400 text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">.</span>
                    </h1>
                    <p className="text-lg md:text-xl text-ink-300 max-w-3xl leading-relaxed">
                        All-time achievements and records across {manifest?.seasons?.length || 0} seasons of league history.
                    </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                <div className="group relative bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Trophy className="text-amber-200" size={18} />
                            <span className="text-[10px] font-bold text-amber-200 uppercase tracking-[0.15em]">Seasons</span>
                        </div>
                        <div className="text-5xl font-display font-black leading-none mb-1">{manifest?.seasons?.length || 0}</div>
                        <p className="text-xs text-amber-200/80">Total recorded</p>
                    </div>
                </div>

                <div className="group relative bg-white rounded-2xl p-6 border-2 border-purple-200 hover:border-purple-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Users className="text-purple-500" size={18} />
                            <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Unique Owners</span>
                        </div>
                        <div className="text-5xl font-display font-black text-ink-900 leading-none group-hover:text-purple-600 transition-colors">{records.allOwners.size}</div>
                        <p className="text-xs text-ink-400 mt-1">All-time participants</p>
                    </div>
                </div>

                <div className="group relative bg-white rounded-2xl p-6 border-2 border-green-200 hover:border-green-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Crown className="text-green-500" size={18} />
                            <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Most Titles</span>
                        </div>
                        <div className="text-xl font-display font-black text-ink-900 truncate group-hover:text-green-600 transition-colors mb-1">
                            {championshipLeaders[0]?.owner || "—"}
                        </div>
                        <p className="text-xs text-ink-400">{championshipLeaders[0]?.championships || 0} championships</p>
                    </div>
                </div>

                <div className="group relative bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl p-6 text-white shadow-lg shadow-accent-500/25 hover:shadow-xl hover:shadow-accent-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="text-accent-200" size={18} />
                            <span className="text-[10px] font-bold text-accent-200 uppercase tracking-[0.15em]">Best Season</span>
                        </div>
                        <div className="text-xl font-display font-black truncate mb-1">
                            {records.bestSeasons[0]?.owner || "—"}
                        </div>
                        <p className="text-xs text-accent-200/80">
                            {records.bestSeasons[0] ? `${formatPoints(records.bestSeasons[0].pointsFor, 0)} pts (${records.bestSeasons[0].year})` : "—"}
                        </p>
                    </div>
                </div>
            </div>

            {/* League Champions */}
            <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20">
                            <Trophy className="text-white" size={22} />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-display font-black">League Champions</CardTitle>
                            <CardDescription className="text-sm text-ink-500 font-medium">Historic title winners</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 relative z-10">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-amber-900 to-amber-800 text-white">
                                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Year</th>
                                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Champion</th>
                                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team Name</th>
                                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Points</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                                {records.champions.map((c, idx) => (
                                    <tr key={c.year} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                                        <td className="py-4 px-5">
                                            <Link to={`/standings?season=${c.year}`} className="font-bold text-accent-600 hover:text-accent-700 hover:underline transition-colors">
                                                {c.year}
                                            </Link>
                                        </td>
                                        <td className="py-4 px-5">
                                            <Link to={`/owners/${slugifyOwner(c.owner)}`} className="flex items-center gap-2 group">
                                                <Crown size={18} className="text-amber-500" />
                                                <span className="font-display font-black text-ink-900 group-hover:text-accent-600 transition-colors">{c.owner}</span>
                                            </Link>
                                        </td>
                                        <td className="py-4 px-5 text-ink-600">{c.teamName}</td>
                                        <td className="py-4 px-5 text-right">
                                            <span className="font-display text-xl text-amber-600 font-black">{formatPoints(c.pointsFor, 1)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Championships & Best Seasons Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
                                <Medal className="text-white" size={22} />
                            </div>
                            <CardTitle className="text-xl font-display font-black">Most Championships</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 relative z-10">
                        <div className="space-y-3">
                            {championshipLeaders.slice(0, 5).map((l, idx) => (
                                <div
                                    key={l.owner}
                                    className={`flex items-center justify-between p-4 rounded-xl transition-all hover:shadow-md ${idx === 0 ? 'bg-gradient-to-r from-amber-50 to-white border-2 border-amber-200' : 'bg-ink-50/50 border border-ink-100'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-display font-black text-sm ${
                                            idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white' :
                                            idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                                            idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                                            'bg-ink-100 text-ink-600'
                                        }`}>
                                            {idx + 1}
                                        </span>
                                        <Link to={`/owners/${slugifyOwner(l.owner)}`} className="font-display font-bold text-ink-900 hover:text-accent-600 transition-colors flex items-center gap-2">
                                            {l.owner}
                                            <ChevronRight size={16} className="text-ink-400" />
                                        </Link>
                                    </div>
                                    <Badge className="bg-amber-500 text-white font-bold px-3">
                                        {l.championships}x
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg shadow-green-500/20">
                                <Zap className="text-white" size={22} />
                            </div>
                            <CardTitle className="text-xl font-display font-black">Best Single Seasons</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 relative z-10">
                        <div className="space-y-3">
                            {records.bestSeasons.slice(0, 5).map((s, idx) => (
                                <div
                                    key={`${s.year}-${s.owner}`}
                                    className={`flex items-center justify-between p-4 rounded-xl transition-all hover:shadow-md ${idx === 0 ? 'bg-gradient-to-r from-green-50 to-white border-2 border-green-200' : 'bg-ink-50/50 border border-ink-100'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-display font-black text-sm ${
                                            idx === 0 ? 'bg-gradient-to-br from-green-400 to-green-500 text-white' :
                                            idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                                            idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                                            'bg-ink-100 text-ink-600'
                                        }`}>
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <Link to={`/owners/${slugifyOwner(s.owner)}`} className="font-display font-bold text-ink-900 hover:text-accent-600 transition-colors">
                                                {s.owner}
                                            </Link>
                                            <span className="text-sm text-ink-500 ml-2">({s.year})</span>
                                        </div>
                                    </div>
                                    <span className="font-display text-xl text-green-600 font-black">{formatPoints(s.pointsFor, 1)}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* All-Time Owner Standings */}
            <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                            <Users className="text-white" size={22} />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-display font-black">All-Time Owner Standings</CardTitle>
                            <CardDescription className="text-sm text-ink-500 font-medium">Career statistics for all league members</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 relative z-10">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Owner</th>
                                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Seasons</th>
                                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Record</th>
                                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Win %</th>
                                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Total Pts</th>
                                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Titles</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                                {allTimeOwnerStats.map((o, idx) => (
                                    <tr key={o.owner} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                                        <td className="py-4 px-5">
                                            <Link to={`/owners/${slugifyOwner(o.owner)}`} className="flex items-center gap-2 group">
                                                <span className="font-display font-black text-ink-900 group-hover:text-accent-600 transition-colors">{o.owner}</span>
                                                <ChevronRight size={16} className="text-ink-300 group-hover:text-accent-500 group-hover:translate-x-0.5 transition-all" />
                                            </Link>
                                        </td>
                                        <td className="py-4 px-5 text-center">
                                            <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-ink-100 font-mono font-bold text-ink-700">
                                                {o.seasons}
                                            </span>
                                        </td>
                                        <td className="py-4 px-5 text-center">
                                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ink-100 font-mono font-bold text-ink-700">
                                                <span className="text-green-600">{o.wins}</span>
                                                <span className="text-ink-400">-</span>
                                                <span className="text-red-600">{o.losses}</span>
                                            </span>
                                        </td>
                                        <td className="py-4 px-5 text-center">
                                            <Badge variant={Number(o.winPct) >= 50 ? "success" : "secondary"} className="font-bold">
                                                {o.winPct}%
                                            </Badge>
                                        </td>
                                        <td className="py-4 px-5 text-right">
                                            <span className="font-display text-xl text-accent-600 font-black">{formatPoints(o.pointsFor, 0)}</span>
                                        </td>
                                        <td className="py-4 px-5 text-center">
                                            {o.championships > 0 ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <Trophy size={16} className="text-amber-500" />
                                                    <span className="font-display font-black text-amber-600">{o.championships}</span>
                                                </div>
                                            ) : (
                                                <span className="text-ink-300">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Career Fantasy Point Leaders */}
            {records.highestScorers.length > 0 && (
                <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-lg shadow-accent-500/20">
                                <Target className="text-white" size={22} />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-display font-black">Career Fantasy Point Leaders</CardTitle>
                                <CardDescription className="text-sm text-ink-500 font-medium">Top scoring players in league history</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 relative z-10">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gradient-to-r from-accent-900 to-accent-800 text-white">
                                        <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Rank</th>
                                        <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Player</th>
                                        <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Career Points</th>
                                        <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Games</th>
                                        <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Seasons</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100">
                                    {records.highestScorers.map((p, idx) => (
                                        <tr key={p.sleeper_id || p.player_id || idx} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                                            <td className="py-4 px-5">
                                                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-display font-black text-lg shadow-sm ${
                                                    idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white' :
                                                    idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                                                    idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                                                    'bg-ink-100 text-ink-600'
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                            </td>
                                            <td className="py-4 px-5">
                                                <Link to={`/players/${p.sleeper_id || p.player_id}`} className="font-display font-black text-lg text-ink-900 hover:text-accent-600 transition-colors">
                                                    {p.display_name || p.player_name}
                                                </Link>
                                            </td>
                                            <td className="py-4 px-5 text-right">
                                                <span className="font-display text-2xl text-accent-600 font-black">{formatPoints(p.points, 1)}</span>
                                            </td>
                                            <td className="py-4 px-5 text-center">
                                                <span className="font-mono text-lg text-ink-600">{p.games || "—"}</span>
                                            </td>
                                            <td className="py-4 px-5 text-center">
                                                <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-ink-100 font-mono font-bold text-ink-700">
                                                    {p.seasons || "—"}
                                                </span>
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
