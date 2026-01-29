import React, { useEffect, useMemo, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import DeferredSection from "../components/DeferredSection.jsx";
import NavigationCard from "../components/NavigationCard.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext";
import { useFavorites } from "../utils/useFavorites";
import { useSummaryData } from "../hooks/useSummaryData";
import LocalStatAssistant from "../components/LocalStatAssistant.jsx";
import { resolvePlayerName } from "../lib/playerName";
import { formatPoints, safeNumber } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import {
  Trophy,
  Users,
  Repeat,
  ArrowRightLeft,
  Star,
  Activity,
  Calendar,
  Zap,
  ChevronRight,
  TrendingUp,
  Target,
  BarChart3,
  Crown,
  Flame
} from "lucide-react";
import type { Manifest, Player } from "../types/index";

interface StandingsTeam {
  team?: string;
  wins: number;
  losses: number;
  points_for: number;
  [key: string]: unknown;
}

interface SeasonSummaryTeam {
  team_name?: string;
  owner?: string;
  display_name?: string;
  username?: string;
  [key: string]: unknown;
}

interface SeasonSummary {
  season?: number;
  teams?: SeasonSummaryTeam[];
  standings?: StandingsTeam[];
  [key: string]: unknown;
}

interface TransactionEntry {
  team?: string;
  type?: string;
  [key: string]: unknown;
}

interface Transactions {
  entries?: TransactionEntry[];
  [key: string]: unknown;
}

interface TopWeeklyRow {
  player_id?: string;
  season?: number;
  week?: number;
  team?: string;
  points?: number;
  started?: boolean;
  [key: string]: unknown;
}

interface CareerLeaderRow {
  player_id?: string;
  position?: string;
  __pos?: string;
  pos?: string;
  player_position?: string;
  fantasy_position?: string;
  points?: number;
  seasons?: number;
  games?: number;
  [key: string]: unknown;
}

interface AllTimeData {
  topWeekly?: TopWeeklyRow[];
  careerLeaders?: CareerLeaderRow[];
  [key: string]: unknown;
}

interface MetricsRow {
  player_id?: string;
  sleeper_id?: string;
  gsis_id?: string;
  display_name?: string;
  season?: number;
  week?: number;
  war_rep?: number;
  pos_week_z?: number;
  [key: string]: unknown;
}

interface MetricsSummary {
  topWeeklyWar?: MetricsRow[];
  topWeeklyZ?: MetricsRow[];
  topSeasonWar?: MetricsRow[];
  [key: string]: unknown;
}

interface TransactionTotals {
  totalTrades: number;
  mostAdds: { team: string; adds: number; drops: number; trades: number } | undefined;
  mostDrops: { team: string; adds: number; drops: number; trades: number } | undefined;
  total: number;
}

function normalizePosition(pos: unknown): string {
  const p = String(pos || "").trim().toUpperCase();
  if (!p) return "";
  if (p === "DST" || p === "D/ST" || p === "D\u002FST" || p === "DEF" || p === "DEFENSE" || p === "D") return "D/ST";
  if (p === "PK") return "K";
  if (p === "FB" || p === "HB") return "RB";
  if (p === "ALL") return "ALL";
  if (["QB", "RB", "WR", "TE", "D/ST", "K"].includes(p)) return p;
  return p;
}

function getLatestSeason(manifest: Manifest | undefined): number | null {
  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  if (!seasons.length) return null;
  return Math.max(...seasons);
}

export default function SummaryPage(): React.ReactElement {
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext();
  const [loadHistory, setLoadHistory] = useState<boolean>(false);
  const [loadMetrics, setLoadMetrics] = useState<boolean>(false);
  const [loadBoomBust, setLoadBoomBust] = useState<boolean>(false);
  const [playerSearch, setPlayerSearch] = useState<string>("");
  const [weeklySearch, setWeeklySearch] = useState<string>("");
  const [careerPosition, setCareerPosition] = useState<string>("ALL");
  const { favorites } = useFavorites();

  const latestSeason = getLatestSeason(manifest);
  const seasonWeeks = latestSeason ? manifest?.weeksBySeason?.[String(latestSeason)] || [] : [];
  const inSeason = seasonWeeks.length > 0;

  const seasons = useMemo(() => {
    const manifestSeasons = (manifest as { seasons?: number[]; years?: number[] } | undefined)?.seasons ||
                           (manifest as { seasons?: number[]; years?: number[] } | undefined)?.years || [];
    return manifestSeasons
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
  }, [manifest]);

  const {
    seasonSummary,
    allSummaries,
    transactions,
    allTime,
    metricsSummary,
    boomBust,
    isLoading: dataLoading,
    isError: dataError
  } = useSummaryData({
    latestSeason,
    allSeasons: seasons,
    loadHistory,
    loadMetrics,
    loadBoomBust
  }) as {
    seasonSummary: SeasonSummary | undefined;
    allSummaries: SeasonSummary[];
    transactions: Transactions | undefined;
    allTime: AllTimeData | undefined;
    metricsSummary: MetricsSummary | undefined;
    boomBust: unknown;
    isLoading: boolean;
    isError: boolean;
  };

  const ownersBySeason = useMemo(() => {
    const bySeason = new Map<number, Map<string, string>>();
    for (const summary of allSummaries) {
      const ownerByTeam = new Map<string, string>();
      for (const team of summary?.teams || []) {
        const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
        if (ownerName && team.team_name) {
          ownerByTeam.set(team.team_name, ownerName);
        }
      }
      if (summary?.season) {
        bySeason.set(Number(summary.season), ownerByTeam);
      }
    }
    return bySeason;
  }, [allSummaries]);

  const champion = useMemo((): StandingsTeam | null => {
    const standings = seasonSummary?.standings || [];
    if (!standings.length) return null;
    return standings.reduce((best: StandingsTeam | null, team: StandingsTeam) => {
      if (!best) return team;
      if (team.wins > best.wins) return team;
      if (team.wins === best.wins && team.points_for > best.points_for) return team;
      return best;
    }, null);
  }, [seasonSummary]);

  const transactionTotals = useMemo((): TransactionTotals | null => {
    const entries = transactions?.entries || [];
    if (!entries.length) return null;
    const totalsByTeam = new Map<string, { team: string; adds: number; drops: number; trades: number }>();
    let totalTrades = 0;
    for (const entry of entries) {
      const team = entry?.team || "Unknown";
      const cur = totalsByTeam.get(team) || { team, adds: 0, drops: 0, trades: 0 };
      if (entry?.type === "trade") {
        cur.trades += 1;
        totalTrades += 1;
      } else if (entry?.type === "add") {
        cur.adds += 1;
      } else if (entry?.type === "drop") {
        cur.drops += 1;
      }
      totalsByTeam.set(team, cur);
    }
    const totals = Array.from(totalsByTeam.values());
    const mostAdds = [...totals].sort((a, b) => b.adds - a.adds)[0];
    const mostDrops = [...totals].sort((a, b) => b.drops - a.drops)[0];
    return { totalTrades, mostAdds, mostDrops, total: entries.length };
  }, [transactions]);

  const topWeekly = useMemo((): TopWeeklyRow[] => {
    const entries = (allTime?.topWeekly || []).filter(Boolean);
    if (!entries.length) return [];
    const query = weeklySearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return resolvePlayerName(row, playerIndex, espnNameMap).toLowerCase().includes(query);
    });
  }, [allTime, weeklySearch, playerIndex, espnNameMap]);

  const careerLeaders = useMemo(() => {
    const entries = (allTime?.careerLeaders || []).filter(Boolean);
    if (!entries.length) return [];

    const query = playerSearch.toLowerCase().trim();
    const posFilter = normalizePosition(careerPosition);

    const withPos = entries.map((row) => ({
      ...row,
      __pos: normalizePosition(row.position || row.__pos || row.pos || row.player_position || row.fantasy_position || ""),
      __name: resolvePlayerName(row, playerIndex, espnNameMap),
      __points: safeNumber(row.points, 0),
    }));

    const filtered = withPos.filter((row) => {
      if (query && !String(row.__name || "").toLowerCase().includes(query)) return false;
      if (posFilter !== "ALL" && row.__pos !== posFilter) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (a.__points !== b.__points) return b.__points - a.__points;
      return String(a.__name || "").localeCompare(String(b.__name || ""));
    });

    return filtered.slice(0, 20);
  }, [allTime, playerSearch, playerIndex, espnNameMap, careerPosition]);

  const favoritePlayers = useMemo(
    () =>
      favorites.players.map((id) => ({
        id,
        name: resolvePlayerName({ player_id: id }, playerIndex, espnNameMap),
      })),
    [favorites.players, playerIndex, espnNameMap],
  );

  if (loading || dataLoading) return <LoadingState label="Loading league snapshot..." />;
  if (error || dataError) return <ErrorState message={error || "Error loading summary data"} />;

  const ownerLabel = (value: unknown, fallback: string = "—"): string => normalizeOwnerName(value) || fallback;
  const statusLabel = inSeason ? "In Season" : `Offseason (last season: ${latestSeason ?? "—"})`;
  const championLabel = champion
    ? `${ownerLabel(champion.team, champion.team as string)} (${champion.wins}-${champion.losses})`
    : "Champion not available";
  const championNote = champion
    ? "Regular-season leader based on available standings."
    : "Standings or playoff data missing for this season.";
  const allTimePending = loadHistory && !allTime;
  const metricsPending = loadMetrics && !metricsSummary;

  const playerFromSleeper = (playerId: string | number): Player | null => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    if (!uid) return null;
    return playerIdLookup.byUid.get(uid) || null;
  };

  const getPlayerName = (row: unknown): string => resolvePlayerName(row, playerIndex, espnNameMap);

  return (
    <PageTransition>
      {/* Hero Section - Futuristic Design */}
      <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-accent-500/20">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[60px] -translate-x-1/2 -translate-y-1/2 -z-10" />

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />

        {/* Accent lines */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-500/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-500/30 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl shadow-lg shadow-accent-500/30">
              <Trophy className="text-white drop-shadow-md" size={32} />
            </div>
            <Badge variant="outline" className="bg-accent-500/10 text-accent-400 border-accent-500/30 px-4 py-1.5 text-sm font-bold">
              <Activity size={14} className="mr-2" />
              {statusLabel}
            </Badge>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-accent-300 bg-clip-text text-transparent drop-shadow-lg mb-4">
            League Summary
            <span className="text-accent-400 text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(31,147,134,0.5)]">.</span>
          </h1>
          <p className="text-lg md:text-xl text-ink-300 max-w-3xl leading-relaxed">
            Snapshot of the latest season plus all-time records from available league exports.
          </p>
        </div>
      </div>

      {/* Quick Stats Grid - Futuristic Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="group relative bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl p-6 text-white shadow-lg shadow-accent-500/25 hover:shadow-xl hover:shadow-accent-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="text-accent-200" size={18} />
              <span className="text-[10px] font-bold text-accent-200 uppercase tracking-[0.15em]">Current Season</span>
            </div>
            <div className="text-5xl md:text-6xl font-display font-black leading-none mb-1">{latestSeason ?? "—"}</div>
            <p className="text-xs text-accent-200/80">Active fantasy season</p>
          </div>
        </div>

        <div className="group relative bg-white rounded-2xl p-6 border-2 border-amber-200 hover:border-amber-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="text-amber-500" size={18} />
              <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">League Champion</span>
            </div>
            <div className="text-xl md:text-2xl font-display font-black text-ink-900 truncate group-hover:text-amber-600 transition-colors mb-1">{championLabel}</div>
            <p className="text-xs text-ink-400 truncate">{championNote}</p>
          </div>
        </div>

        <div className="group relative bg-white rounded-2xl p-6 border-2 border-blue-200 hover:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="text-blue-500" size={18} />
              <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Transactions</span>
            </div>
            <div className="text-5xl md:text-6xl font-display font-black text-ink-900 leading-none group-hover:text-blue-600 transition-colors">{transactionTotals ? transactionTotals.total : "—"}</div>
            <p className="text-xs text-ink-400 mt-1">Trades + adds + drops</p>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="text-purple-200" size={18} />
              <span className="text-[10px] font-bold text-purple-200 uppercase tracking-[0.15em]">Total Trades</span>
            </div>
            <div className="text-5xl md:text-6xl font-display font-black leading-none mb-1">{transactionTotals ? transactionTotals.totalTrades : "—"}</div>
            <p className="text-xs text-purple-200/80">Latest season trades</p>
          </div>
        </div>
      </div>

      {/* Season Highlights & Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <Card className="shadow-lg border-2 border-ink-100 hover:border-accent-300 transition-all duration-300 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-accent-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <CardHeader className="border-b border-ink-100 bg-gradient-to-r from-ink-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-md shadow-accent-500/20">
                <Flame className="text-white" size={20} />
              </div>
              <CardTitle className="text-xl font-display font-black">Season Highlights</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 relative z-10">
            {transactionTotals ? (
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-white border border-green-200 hover:shadow-md transition-all">
                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider block mb-1">Most Adds</span>
                  <span className="text-lg font-display font-black text-ink-900">{ownerLabel(transactionTotals.mostAdds?.team, transactionTotals.mostAdds?.team || "—")}</span>
                  <Badge variant="success" className="ml-2 text-xs">{transactionTotals.mostAdds?.adds || 0} adds</Badge>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-r from-red-50 to-white border border-red-200 hover:shadow-md transition-all">
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block mb-1">Most Drops</span>
                  <span className="text-lg font-display font-black text-ink-900">{ownerLabel(transactionTotals.mostDrops?.team, transactionTotals.mostDrops?.team || "—")}</span>
                  <Badge variant="destructive" className="ml-2 text-xs">{transactionTotals.mostDrops?.drops || 0} drops</Badge>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-white border border-purple-200 hover:shadow-md transition-all">
                  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block mb-1">Trade Activity</span>
                  <span className="text-lg font-display font-black text-ink-900">{transactionTotals.totalTrades} trades logged</span>
                </div>
              </div>
            ) : (
              <div className="text-base text-ink-500 p-6 text-center bg-ink-50 rounded-xl border-2 border-dashed border-ink-200">No transaction data available for this season.</div>
            )}
          </CardContent>
        </Card>

        <Link to="/matchups" className="block group">
          <div className="h-full relative bg-gradient-to-br from-ink-900 to-ink-800 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px'}} />
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-accent-500/20 rounded-xl border border-accent-500/30">
                  <Target className="text-accent-400" size={24} />
                </div>
              </div>
              <h3 className="text-2xl font-display font-black mb-3 group-hover:text-accent-400 transition-colors">Weekly Matchups</h3>
              <p className="text-ink-400 text-sm leading-relaxed flex-1">Browse matchups by season and week, then dive into roster details.</p>
              <div className="flex items-center gap-2 text-accent-400 font-bold text-sm mt-4 group-hover:gap-3 transition-all">
                <span>Explore matchups</span>
                <ChevronRight size={18} />
              </div>
            </div>
          </div>
        </Link>

        <Link to="/standings" className="block group">
          <div className="h-full relative bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white shadow-xl shadow-amber-500/25 hover:shadow-2xl hover:shadow-amber-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/10 rounded-xl border border-white/20">
                  <BarChart3 className="text-amber-100" size={24} />
                </div>
              </div>
              <h3 className="text-2xl font-display font-black mb-3">Standings</h3>
              <p className="text-amber-100/80 text-sm leading-relaxed flex-1">Season standings plus all-time franchise summaries.</p>
              <div className="flex items-center gap-2 text-white font-bold text-sm mt-4 group-hover:gap-3 transition-all">
                <span>View standings</span>
                <ChevronRight size={18} />
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Top Weekly Performances */}
      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<Card className="mb-8 shadow-lg"><CardContent className="pt-6 text-base">Loading weekly leaders...</CardContent></Card>}
      >
        <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg shadow-green-500/20">
                  <TrendingUp className="text-white" size={22} />
                </div>
                <div>
                  <CardTitle className="text-2xl font-display font-black">Top Weekly Performances</CardTitle>
                  <CardDescription className="text-sm text-ink-500 font-medium">45+ Point Games (2015–2025)</CardDescription>
                </div>
              </div>
              <div className="w-full md:w-64">
                <SearchBar value={weeklySearch} onChange={setWeeklySearch} placeholder="Search weekly leaders..." />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 relative z-10">
            {allTimePending ? (
              <div className="text-base text-ink-500 p-8 text-center">Loading weekly leaders...</div>
            ) : topWeekly.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                      <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Player</th>
                      <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em] hidden md:table-cell">Team</th>
                      <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {topWeekly.slice(0, 10).map((row, index) => {
                      const pid = row?.player_id;
                      const player = pid ? playerFromSleeper(pid) : null;
                      const playerName = row ? getPlayerName(row) || player?.name : "Unknown";
                      return (
                        <tr key={`${pid || "unknown"}-${row?.season || "x"}-${row?.week || "x"}-${index}`} className={`hover:bg-accent-50/50 transition-all duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                          <td className="py-4 px-5">
                            {pid ? (
                              <Link to={`/players/${pid}`} className="flex items-center gap-3 group">
                                <div className="w-10 h-10 rounded-full border-2 border-ink-100 overflow-hidden bg-white shrink-0 shadow-sm group-hover:border-accent-400 transition-all group-hover:shadow-md">
                                  <img
                                    src={`https://sleepercdn.com/content/nfl/players/${pid}.jpg`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    style={{ width: '100%', height: '100%' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-sm md:text-base truncate max-w-[150px] md:max-w-none group-hover:text-accent-600 transition-colors">{playerName}</div>
                                  <div className="text-xs font-bold text-ink-400 uppercase tracking-wider">
                                    {row.season} · W{row.week}
                                  </div>
                                </div>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-ink-100 border border-ink-200 shrink-0 flex items-center justify-center">
                                  <Users size={18} className="text-ink-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-sm md:text-base truncate max-w-[150px] md:max-w-none">{playerName || "Unknown"}</div>
                                  <div className="text-xs font-bold text-ink-400 uppercase tracking-wider">
                                    {row.season} · W{row.week}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 text-base font-medium text-ink-800 hidden md:table-cell">
                            {(() => {
                              const ownerByTeam = ownersBySeason.get(Number(row.season));
                              const owner = ownerByTeam?.get(row.team || "");
                              return owner ? (
                                <div className="flex flex-col">
                                  <span className="font-bold">{owner}</span>
                                  <span className="text-xs text-ink-400 uppercase tracking-tighter">{row.team}</span>
                                </div>
                              ) : row.team;
                            })()}
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3 justify-end">
                              <span className="text-2xl md:text-3xl font-display text-accent-600 font-black">{formatPoints(row.points)}</span>
                              {row.started != null && (
                                <Badge
                                  variant={row.started ? "success" : "destructive"}
                                  className="text-[10px] px-2 py-0.5 font-bold shadow-sm"
                                >
                                  {row.started ? "START" : "BN"}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-base text-ink-500 italic p-8 text-center bg-ink-50/50">No weekly performance data available.</div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>

      {/* Career Fantasy Leaders */}
      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<Card className="mb-8 shadow-lg"><CardContent className="pt-6 text-base">Loading career leaders...</CardContent></Card>}
      >
        <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20">
                  <Star className="text-white" size={22} />
                </div>
                <CardTitle className="text-2xl font-display font-black">Career Fantasy Leaders</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-full md:w-48">
                  <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search leaders..." />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink-500 uppercase tracking-wider">Position</span>
                  <select
                    value={careerPosition}
                    onChange={(e) => setCareerPosition(e.target.value)}
                    className="rounded-lg border-2 border-ink-200 bg-white px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-500 hover:border-ink-300 transition-colors"
                  >
                    <option value="ALL">All</option>
                    <option value="QB">QB</option>
                    <option value="RB">RB</option>
                    <option value="WR">WR</option>
                    <option value="TE">TE</option>
                    <option value="D/ST">D/ST</option>
                    <option value="K">K</option>
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 relative z-10">
            {allTimePending ? (
              <div className="text-base text-ink-500 p-8 text-center">Loading career leaders...</div>
            ) : careerLeaders.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                      <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Rank</th>
                      <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Player</th>
                      <th className="py-4 px-5 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Seasons</th>
                      <th className="py-4 px-5 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Total Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {careerLeaders.slice(0, 10).map((row, index) => {
                      const pid = row?.player_id;
                      const player = pid ? playerFromSleeper(pid) : null;
                      const playerName = row ? getPlayerName(row) || player?.name : "Unknown";
                      return (
                        <tr key={pid || `career-${index}`} className={`hover:bg-accent-50/50 transition-all duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
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
                            {pid ? (
                              <Link to={`/players/${pid}`} className="flex items-center gap-3 group">
                                <div className="w-12 h-12 rounded-full border-2 border-ink-100 overflow-hidden bg-white shrink-0 shadow-sm group-hover:border-accent-400 transition-all group-hover:shadow-md">
                                  <img
                                    src={`https://sleepercdn.com/content/nfl/players/${pid}.jpg`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    style={{ width: '100%', height: '100%' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-sm md:text-base group-hover:text-accent-600 transition-colors truncate max-w-[150px] md:max-w-none">{playerName}</div>
                                  <Badge variant="secondary" className="text-[9px] px-2 py-0 h-5 uppercase font-bold tracking-tight mt-1">
                                    {row.__pos || "—"}
                                  </Badge>
                                </div>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-ink-100 border border-ink-200 shrink-0 flex items-center justify-center">
                                  <Users size={20} className="text-ink-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-sm md:text-base truncate max-w-[150px] md:max-w-none">{playerName || "Unknown"}</div>
                                  <Badge variant="secondary" className="text-[9px] px-2 py-0 h-5 uppercase font-bold tracking-tight mt-1">
                                    {row.__pos || "—"}
                                  </Badge>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 font-mono text-lg font-bold text-ink-600 text-center">
                            {row.seasons}
                          </td>
                          <td className="py-4 px-5 font-display text-2xl md:text-3xl text-accent-600 leading-none text-right font-black">
                            {formatPoints(row.points)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-base text-ink-500 italic p-8 text-center bg-ink-50/50">No career leaderboard data available.</div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>
    </PageTransition>
  );
}
