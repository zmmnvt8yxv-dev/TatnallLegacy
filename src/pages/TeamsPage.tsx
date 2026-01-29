import React, { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useTeamsList } from "../hooks/useTeamsList";
import PageTransition from "../components/PageTransition.jsx";
import { normalizeOwnerName } from "../lib/identity";
import { formatPoints } from "../utils/format";
import { readStorage, writeStorage } from "../utils/persistence";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Users, Calendar, Crown, Trophy, ChevronRight, Zap, UserCircle, BarChart3 } from "lucide-react";
import type { Manifest } from "../types/index";

const PREF_KEY = "tatnall-pref-teams-season";

interface SeasonTeam {
    team_name?: string;
    display_name?: string;
    owner?: string;
    final_rank?: number;
    regular_season_rank?: number;
    wins?: number;
    losses?: number;
    record?: string;
    points_for?: number;
    points_against?: number;
}

interface SeasonData {
    teams?: SeasonTeam[];
}

interface EnrichedTeam extends SeasonTeam {
    ownerNormalized: string;
    ownerSlug: string;
}

function slugifyOwner(name: string): string {
    return encodeURIComponent(String(name || "").toLowerCase().replace(/\s+/g, "-"));
}

export default function TeamsPage(): React.ReactElement {
    const [searchParams, setSearchParams] = useSearchParams();

    const season = searchParams.get("season")
        ? Number(searchParams.get("season"))
        : null;

    const {
        manifest,
        seasonData,
        isLoading: loading,
        isError: error
    } = useTeamsList(season) as {
        manifest: Manifest | undefined;
        seasonData: SeasonData | undefined;
        isLoading: boolean;
        isError: boolean;
    };

    useEffect(() => {
        if (!manifest) return;
        const seasons = manifest?.seasons || [];
        const stored = readStorage<number | null>(PREF_KEY, null);
        const targetSeason =
            season || (stored && seasons.includes(Number(stored)) ? Number(stored) : seasons[0]);
        if (!season && targetSeason) {
            setSearchParams({ season: String(targetSeason) }, { replace: true });
        }
    }, [season, manifest, setSearchParams]);

    const handleSeasonChange = (value: string): void => {
        const newSeason = Number(value);
        writeStorage(PREF_KEY, newSeason);
        setSearchParams({ season: String(newSeason) });
    };

    const seasons = manifest?.seasons || [];

    const teams = useMemo((): EnrichedTeam[] => {
        if (!seasonData?.teams) return [];
        return seasonData.teams
            .map((team): EnrichedTeam => ({
                ...team,
                ownerNormalized: normalizeOwnerName(team.owner || team.display_name || team.team_name),
                ownerSlug: slugifyOwner(normalizeOwnerName(team.owner || team.display_name || team.team_name)),
            }))
            .sort((a, b) => {
                const rankA = a.final_rank || a.regular_season_rank || 999;
                const rankB = b.final_rank || b.regular_season_rank || 999;
                return rankA - rankB;
            });
    }, [seasonData]);

    const uniqueOwners = useMemo(() => {
        return [...new Set(teams.map((t) => t.ownerNormalized))].sort();
    }, [teams]);

    if (loading) {
        return <LoadingState label="Loading teams..." />;
    }

    if (error) {
        return <ErrorState message="Failed to load teams" />;
    }

    return (
        <PageTransition>
            {/* Hero Section */}
            <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-accent-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />

                <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg shadow-blue-500/30">
                            <Users className="text-white drop-shadow-md" size={32} />
                        </div>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 px-4 py-1.5 text-sm font-bold">
                            <Calendar size={14} className="mr-2" />
                            {seasons.length} Seasons
                        </Badge>
                    </div>

                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-blue-300 bg-clip-text text-transparent drop-shadow-lg mb-4">
                        Fantasy Teams
                        <span className="text-blue-400 text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]">.</span>
                    </h1>
                    <p className="text-lg md:text-xl text-ink-300 max-w-3xl leading-relaxed">
                        Browse all fantasy teams across {seasons.length} seasons of league history.
                    </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                <div className="group relative bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Users className="text-blue-200" size={18} />
                            <span className="text-[10px] font-bold text-blue-200 uppercase tracking-[0.15em]">Teams</span>
                        </div>
                        <div className="text-5xl font-display font-black leading-none mb-1">{teams.length}</div>
                        <p className="text-xs text-blue-200/80">In {season}</p>
                    </div>
                </div>

                <div className="group relative bg-white rounded-2xl p-6 border-2 border-green-200 hover:border-green-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Crown className="text-green-500" size={18} />
                            <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Champion</span>
                        </div>
                        <div className="text-xl font-display font-black text-ink-900 truncate group-hover:text-green-600 transition-colors mb-1">
                            {teams[0]?.ownerNormalized || "—"}
                        </div>
                        <p className="text-xs text-ink-400">
                            {teams[0] ? `#1 in ${season}` : "No data"}
                        </p>
                    </div>
                </div>

                <div className="group relative bg-white rounded-2xl p-6 border-2 border-purple-200 hover:border-purple-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <UserCircle className="text-purple-500" size={18} />
                            <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Unique Owners</span>
                        </div>
                        <div className="text-5xl font-display font-black text-ink-900 leading-none group-hover:text-purple-600 transition-colors">{uniqueOwners.length}</div>
                        <p className="text-xs text-ink-400 mt-1">This season</p>
                    </div>
                </div>

                <div className="group relative bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl p-6 text-white shadow-lg shadow-accent-500/25 hover:shadow-xl hover:shadow-accent-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <BarChart3 className="text-accent-200" size={18} />
                            <span className="text-[10px] font-bold text-accent-200 uppercase tracking-[0.15em]">History</span>
                        </div>
                        <div className="text-5xl font-display font-black leading-none mb-1">{seasons.length}</div>
                        <p className="text-xs text-accent-200/80">Total seasons</p>
                    </div>
                </div>
            </div>

            {/* Filters Section */}
            <div className="bg-white rounded-2xl shadow-lg border border-ink-200/50 p-6 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="relative z-10 flex flex-wrap gap-6 items-end">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
                            <Calendar size={14} className="text-blue-500" />
                            Season
                        </label>
                        <select
                            id="season-select"
                            value={season || ""}
                            onChange={(e) => handleSeasonChange(e.target.value)}
                            className="rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300 transition-all min-w-[140px]"
                        >
                            {seasons.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Badge variant="outline" className="h-12 px-5 border-2 border-ink-200 text-lg font-bold flex items-center gap-2">
                        <Zap size={18} className="text-blue-500" />
                        {teams.length} Teams
                    </Badge>
                </div>
            </div>

            {/* Teams Table */}
            <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                            <Trophy className="text-white" size={22} />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-display font-black">{season} Teams</CardTitle>
                            <CardDescription className="text-sm text-ink-500 font-medium">Final standings and season results</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 relative z-10">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Rank</th>
                                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team / Owner</th>
                                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Record</th>
                                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">PF</th>
                                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">PA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                                {teams.map((team, idx) => {
                                    const rank = team.final_rank || team.regular_season_rank || idx + 1;
                                    return (
                                        <tr key={team.team_name || team.display_name || idx} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                                            <td className="py-4 px-5">
                                                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-display font-black text-lg shadow-sm ${
                                                    rank === 1 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white' :
                                                    rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                                                    rank === 3 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                                                    'bg-ink-100 text-ink-600'
                                                }`}>
                                                    {rank}
                                                </span>
                                            </td>
                                            <td className="py-4 px-5">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-display font-black text-lg text-ink-900 flex items-center gap-2">
                                                        {team.team_name || team.display_name}
                                                        {rank === 1 && <Crown size={16} className="text-amber-500" />}
                                                    </span>
                                                    <Link
                                                        to={`/owners/${team.ownerSlug}?from=${season}`}
                                                        className="text-sm font-medium text-accent-600 hover:text-accent-700 hover:underline transition-colors flex items-center gap-1 group"
                                                    >
                                                        {team.ownerNormalized}
                                                        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                                    </Link>
                                                </div>
                                            </td>
                                            <td className="py-4 px-5 text-center">
                                                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ink-100 font-mono font-bold text-ink-700">
                                                    <span className="text-green-600">{team.wins || 0}</span>
                                                    <span className="text-ink-400">-</span>
                                                    <span className="text-red-600">{team.losses || 0}</span>
                                                </span>
                                            </td>
                                            <td className="py-4 px-5 text-right">
                                                <span className="font-display text-xl text-accent-600 font-black">{formatPoints(team.points_for, 1)}</span>
                                            </td>
                                            <td className="py-4 px-5 text-right">
                                                <span className="font-mono text-lg text-ink-400">{formatPoints(team.points_against, 1)}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* All Owners */}
            <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
                            <UserCircle className="text-white" size={22} />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-display font-black">All Owners</CardTitle>
                            <CardDescription className="text-sm text-ink-500 font-medium">Click an owner to see their full league history</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 relative z-10">
                    <div className="flex flex-wrap gap-3">
                        {uniqueOwners.map((owner) => (
                            <Link
                                key={owner}
                                to={`/owners/${slugifyOwner(owner)}`}
                                className="group px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-50 to-white border-2 border-purple-200 hover:border-purple-400 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                            >
                                <span className="font-display font-bold text-ink-800 group-hover:text-purple-600 transition-colors flex items-center gap-2">
                                    {owner}
                                    <ChevronRight size={16} className="text-purple-400 group-hover:translate-x-0.5 transition-transform" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </PageTransition>
    );
}
