import React, { useEffect, useMemo, useRef, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext";
import { useStandings } from "../hooks/useStandings";
import { formatPoints } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { useFavorites } from "../utils/useFavorites";
import { readStorage, writeStorage } from "../utils/persistence";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Heart, Trophy, Calendar, Users, Crown, TrendingUp, BarChart3, Medal, Target, Zap } from "lucide-react";
import type { Manifest } from "../types/index";

interface StandingsTeam {
  owner?: string;
  display_name?: string;
  username?: string;
  team_name?: string;
}

interface StandingsRow {
  team: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
}

interface SeasonSummary {
  teams?: StandingsTeam[];
  standings?: StandingsRow[];
}

interface AllTimeRow {
  team: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
}

interface StoredPrefs {
  season?: number;
}

export default function StandingsPage(): React.ReactElement {
  const { manifest, loading, error } = useDataContext() as {
    manifest: Manifest | undefined;
    loading: boolean;
    error: string | null;
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef<boolean>(false);
  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const [season, setSeason] = useState<number | string>(seasons[0] || "");
  const [teamQuery, setTeamQuery] = useState<string>("");
  const { favorites, toggleTeam } = useFavorites();
  const STANDINGS_PREF_KEY = "tatnall-pref-standings";

  const {
    seasonSummary,
    allSummaries,
    isLoading: dataLoading,
    isError: dataError,
    error: fetchError
  } = useStandings(season, seasons) as {
    seasonSummary: SeasonSummary | undefined;
    allSummaries: SeasonSummary[];
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };

  useEffect(() => {
    if (!seasons.length) return;
    const paramSeason = Number(searchParams.get("season"));
    if (Number.isFinite(paramSeason) && seasons.includes(paramSeason) && paramSeason !== Number(season)) {
      setSeason(paramSeason);
    }
  }, [searchParamsString, seasons, season]);

  useEffect(() => {
    if (!seasons.length) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const stored = readStorage<StoredPrefs>(STANDINGS_PREF_KEY, {});
    const storedSeason = Number(stored?.season);
    const paramSeason = Number(searchParams.get("season"));
    let nextSeason = Number.isFinite(paramSeason) && seasons.includes(paramSeason) ? paramSeason : seasons[0];
    if (!searchParams.get("season") && Number.isFinite(storedSeason) && seasons.includes(storedSeason)) {
      nextSeason = storedSeason;
    }
    setSeason(nextSeason);
    if (!searchParams.get("season")) {
      params.set("season", String(nextSeason));
      setSearchParams(params, { replace: true });
    }
    didInitRef.current = true;
  }, [seasons, searchParams, setSearchParams]);

  const handleSeasonChange = (value: string): void => {
    const nextSeason = Number(value);
    setSeason(nextSeason);
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    setSearchParams(params, { replace: true });
    writeStorage(STANDINGS_PREF_KEY, { season: nextSeason });
  };

  const seasonOwners = useMemo((): Map<string, string> => {
    const mapping = new Map<string, string>();
    for (const team of seasonSummary?.teams || []) {
      const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
      if (ownerName && team.team_name) {
        mapping.set(team.team_name, ownerName);
      }
    }
    return mapping;
  }, [seasonSummary]);

  const allTime = useMemo((): AllTimeRow[] => {
    const totals = new Map<string, AllTimeRow>();
    for (const summary of allSummaries) {
      const ownerByTeam = new Map<string, string>();
      for (const team of summary?.teams || []) {
        const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
        if (ownerName && team.team_name) {
          ownerByTeam.set(team.team_name, ownerName);
        }
      }
      for (const row of summary?.standings || []) {
        const ownerName = ownerByTeam.get(row.team) || normalizeOwnerName(row.team) || row.team;
        const key = ownerName || row.team;
        const cur = totals.get(key) || {
          team: key,
          wins: 0,
          losses: 0,
          ties: 0,
          points_for: 0,
          points_against: 0,
        };
        cur.wins += row.wins;
        cur.losses += row.losses;
        cur.ties += row.ties;
        cur.points_for += row.points_for;
        cur.points_against += row.points_against;
        totals.set(key, cur);
      }
    }
    return Array.from(totals.values()).sort((a, b) => b.wins - a.wins);
  }, [allSummaries]);

  const standings = seasonSummary?.standings || [];
  const ownerLabel = (value: unknown, fallback: string = "—"): string => normalizeOwnerName(value) || fallback;
  const query = teamQuery.trim().toLowerCase();
  const filteredStandings = useMemo((): StandingsRow[] => {
    if (!query) return standings;
    return standings.filter((row) =>
      ownerLabel(seasonOwners.get(row.team) || row.team, row.team).toLowerCase().includes(query),
    );
  }, [standings, query, seasonOwners]);

  const filteredAllTime = useMemo((): AllTimeRow[] => {
    if (!query) return allTime;
    return allTime.filter((row) => ownerLabel(row.team, row.team).toLowerCase().includes(query));
  }, [allTime, query]);

  // Calculate top performer for the season
  const topPerformer = useMemo(() => {
    if (!standings.length) return null;
    return [...standings].sort((a, b) => b.points_for - a.points_for)[0];
  }, [standings]);

  if (loading || dataLoading) return <LoadingState label="Loading standings..." />;
  if (error || dataError) return <ErrorState message={error || fetchError?.message || "Error loading standings"} />;

  return (
    <PageTransition>
      {/* Hero Section */}
      <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-accent-500/20">
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />

        <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl shadow-lg shadow-amber-500/30">
              <Trophy className="text-white drop-shadow-md" size={32} />
            </div>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 px-4 py-1.5 text-sm font-bold">
              <Calendar size={14} className="mr-2" />
              Season {season}
            </Badge>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-amber-300 bg-clip-text text-transparent drop-shadow-lg mb-4">
            Standings
            <span className="text-amber-400 text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">.</span>
          </h1>
          <p className="text-lg md:text-xl text-ink-300 max-w-3xl leading-relaxed">
            Season standings plus all-time franchise performance.
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="group relative bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Users className="text-amber-200" size={18} />
              <span className="text-[10px] font-bold text-amber-200 uppercase tracking-[0.15em]">Teams</span>
            </div>
            <div className="text-5xl font-display font-black leading-none mb-1">{standings.length}</div>
            <p className="text-xs text-amber-200/80">Active teams</p>
          </div>
        </div>

        <div className="group relative bg-white rounded-2xl p-6 border-2 border-green-200 hover:border-green-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="text-green-500" size={18} />
              <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Leader</span>
            </div>
            <div className="text-xl font-display font-black text-ink-900 truncate group-hover:text-green-600 transition-colors mb-1">
              {standings[0] ? ownerLabel(seasonOwners.get(standings[0].team) || standings[0].team, standings[0].team) : "—"}
            </div>
            <p className="text-xs text-ink-400">
              {standings[0] ? `${standings[0].wins}-${standings[0].losses}` : "No data"}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-2xl p-6 border-2 border-accent-200 hover:border-accent-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="text-accent-500" size={18} />
              <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Top Scorer</span>
            </div>
            <div className="text-xl font-display font-black text-ink-900 truncate group-hover:text-accent-600 transition-colors mb-1">
              {topPerformer ? ownerLabel(seasonOwners.get(topPerformer.team) || topPerformer.team, topPerformer.team) : "—"}
            </div>
            <p className="text-xs text-ink-400">
              {topPerformer ? `${formatPoints(topPerformer.points_for)} pts` : "No data"}
            </p>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="text-purple-200" size={18} />
              <span className="text-[10px] font-bold text-purple-200 uppercase tracking-[0.15em]">All-Time Records</span>
            </div>
            <div className="text-5xl font-display font-black leading-none mb-1">{allTime.length}</div>
            <p className="text-xs text-purple-200/80">Franchise records</p>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-2xl shadow-lg border border-ink-200/50 p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10 flex flex-wrap gap-6 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
              <Calendar size={14} className="text-amber-500" />
              Season
            </label>
            <select
              value={season}
              onChange={(event) => handleSeasonChange(event.target.value)}
              className="rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 hover:border-amber-300 transition-all min-w-[140px]"
            >
              {seasons.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
              <Users size={14} className="text-amber-500" />
              Filter Team
            </label>
            <SearchBar value={teamQuery} onChange={setTeamQuery} placeholder="Filter by team..." />
          </div>
          <Badge variant="outline" className="h-12 px-5 border-2 border-ink-200 text-lg font-bold flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            {standings.length || 0} Teams
          </Badge>
        </div>
      </div>

      {/* Season Standings */}
      <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20">
              <Medal className="text-white" size={22} />
            </div>
            <div>
              <CardTitle className="text-2xl font-display font-black">Season Standings</CardTitle>
              <CardDescription className="text-sm text-ink-500 font-medium">{season} Regular Season</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative z-10">
          {filteredStandings.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Rank</th>
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">W</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">L</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">T</th>
                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">PF</th>
                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">PA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredStandings.map((row, index) => {
                    const teamName = ownerLabel(seasonOwners.get(row.team) || row.team, row.team);
                    const isFavorite = favorites.teams.includes(teamName);
                    return (
                      <tr key={row.team} className={`hover:bg-accent-50/50 transition-all duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-display font-black text-lg shadow-sm ${
                            index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white' :
                            index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                            index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                            'bg-ink-100 text-ink-600'
                          }`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-9 w-9 rounded-full transition-all hover:scale-110 ${isFavorite ? "text-red-500" : "text-ink-300 hover:text-red-400"}`}
                              onClick={() => toggleTeam(teamName)}
                            >
                              <Heart size={18} className={isFavorite ? "fill-current" : ""} />
                            </Button>
                            <span className="font-display font-black text-lg text-ink-900">{teamName}</span>
                            {index === 0 && <Crown size={18} className="text-amber-500" />}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-green-100 text-green-700 font-mono font-black text-lg">
                            {row.wins}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-red-100 text-red-700 font-mono font-black text-lg">
                            {row.losses}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-ink-100 text-ink-600 font-mono font-black text-lg">
                            {row.ties}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <span className="font-display text-2xl text-accent-600 font-black">{formatPoints(row.points_for)}</span>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <span className="font-mono text-lg text-ink-400">{formatPoints(row.points_against)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ink-100 flex items-center justify-center">
                <Trophy size={32} className="text-ink-400" />
              </div>
              <p className="text-lg text-ink-500 font-medium">No standings data available for this season.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All-Time Franchise Summary */}
      <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
              <Target className="text-white" size={22} />
            </div>
            <div>
              <CardTitle className="text-2xl font-display font-black">All-Time Franchise Summary</CardTitle>
              <CardDescription className="text-sm text-ink-500 font-medium">Cumulative stats across all seasons</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative z-10">
          {filteredAllTime.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-900 to-purple-800 text-white">
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Rank</th>
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">W</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">L</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">T</th>
                    <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Win %</th>
                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">PF</th>
                    <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">PA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredAllTime.map((row, index) => {
                    const teamName = ownerLabel(row.team, row.team);
                    const isFavorite = favorites.teams.includes(teamName);
                    const totalGames = row.wins + row.losses + row.ties;
                    const winPct = totalGames > 0 ? ((row.wins / totalGames) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={row.team} className={`hover:bg-purple-50/50 transition-all duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-display font-black text-lg shadow-sm ${
                            index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white' :
                            index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                            index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                            'bg-ink-100 text-ink-600'
                          }`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-9 w-9 rounded-full transition-all hover:scale-110 ${isFavorite ? "text-red-500" : "text-ink-300 hover:text-red-400"}`}
                              onClick={() => toggleTeam(teamName)}
                            >
                              <Heart size={18} className={isFavorite ? "fill-current" : ""} />
                            </Button>
                            <span className="font-display font-black text-lg text-ink-900">{teamName}</span>
                            {index === 0 && <Crown size={18} className="text-purple-500" />}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center justify-center w-12 h-10 rounded-lg bg-green-100 text-green-700 font-mono font-black text-lg">
                            {row.wins}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center justify-center w-12 h-10 rounded-lg bg-red-100 text-red-700 font-mono font-black text-lg">
                            {row.losses}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center justify-center w-12 h-10 rounded-lg bg-ink-100 text-ink-600 font-mono font-black text-lg">
                            {row.ties}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <Badge variant={Number(winPct) >= 50 ? "success" : "secondary"} className="text-sm font-bold px-3 py-1">
                            {winPct}%
                          </Badge>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <span className="font-display text-2xl text-purple-600 font-black">{formatPoints(row.points_for)}</span>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <span className="font-mono text-lg text-ink-400">{formatPoints(row.points_against)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ink-100 flex items-center justify-center">
                <BarChart3 size={32} className="text-ink-400" />
              </div>
              <p className="text-lg text-ink-500 font-medium">No historical standings data available.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
