import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import PageTransition from "../components/PageTransition.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext";
import { useTransactions } from "../hooks/useTransactions";
import { filterRegularSeasonWeeks } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { useVirtualRows } from "../utils/useVirtualRows";
import { readStorage, writeStorage } from "../utils/persistence";
import { Link, useSearchParams } from "react-router-dom";
import { getCanonicalPlayerId, looksLikeId } from "../lib/playerName";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { ArrowRightLeft, Calendar, Users, Target, Zap, Plus, Minus, TrendingUp, Award, Filter, X } from "lucide-react";
import type { Manifest, PlayerIndex, EspnNameMap } from "../types/index";

interface Player {
  id?: string;
  name?: string;
  id_type?: string;
  action?: string;
}

interface TransactionEntry {
  id?: string;
  week?: number;
  team?: string;
  type?: string;
  amount?: number;
  created?: number;
  players?: Player[];
  summary?: string;
}

interface Transactions {
  entries?: TransactionEntry[];
  sources?: string[];
  __meta?: { path?: string };
}

interface TeamTotal {
  team: string;
  adds: number;
  drops: number;
  trades: number;
}

interface StoredPrefs {
  season?: number;
  week?: string | number;
  type?: string;
  team?: string;
}

export default function TransactionsPage(): React.ReactElement {
  const { manifest, loading, error, playerIndex, espnNameMap } = useDataContext() as {
    manifest: Manifest | undefined;
    loading: boolean;
    error: string | null;
    playerIndex: PlayerIndex;
    espnNameMap: EspnNameMap;
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef<boolean>(false);
  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const [season, setSeason] = useState<number | string>(seasons[0] || "");
  const [week, setWeek] = useState<number | string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const {
    transactions,
    isLoading: dataLoading,
    isError: dataError,
    error: fetchError
  } = useTransactions(season) as {
    transactions: Transactions | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };
  const TRANSACTIONS_PREF_KEY = "tatnall-pref-transactions";

  const availableWeeks = useMemo((): number[] => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week as number);
  }, [manifest, season]);

  useEffect(() => {
    if (!seasons.length) return;
    const paramSeason = Number(searchParams.get("season"));
    if (Number.isFinite(paramSeason) && paramSeason !== Number(season) && seasons.includes(paramSeason)) {
      setSeason(paramSeason);
    }
    const paramWeekRaw = searchParams.get("week") || "all";
    if (paramWeekRaw === "all" && week !== "all") {
      setWeek("all");
    } else if (paramWeekRaw !== "all") {
      const parsed = Number(paramWeekRaw);
      if (Number.isFinite(parsed) && parsed !== Number(week)) {
        setWeek(parsed);
      }
    }
    const paramType = searchParams.get("type") || "all";
    if (paramType !== typeFilter) setTypeFilter(paramType);
    const paramTeam = searchParams.get("team") || "";
    if (paramTeam !== teamFilter) setTeamFilter(paramTeam);
  }, [searchParamsString, seasons, season, week, typeFilter, teamFilter]);

  useEffect(() => {
    if (!seasons.length || !manifest) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const stored = readStorage<StoredPrefs>(TRANSACTIONS_PREF_KEY, {});
    const storedSeason = Number(stored?.season);
    const storedWeek = stored?.week ?? "all";
    const storedType = stored?.type ?? "all";
    const storedTeam = stored?.team ?? "";
    const paramSeason = Number(searchParams.get("season"));
    let nextSeason = Number.isFinite(paramSeason) && seasons.includes(paramSeason) ? paramSeason : seasons[0];
    if (!searchParams.get("season") && Number.isFinite(storedSeason) && seasons.includes(storedSeason)) {
      nextSeason = storedSeason;
    }
    const weeksForSeason = manifest?.weeksBySeason?.[String(nextSeason)] || [];
    const regularWeeks = filterRegularSeasonWeeks(weeksForSeason.map((value) => ({ week: value }))).map(
      (row) => row.week as number,
    );
    const paramWeekRaw = searchParams.get("week") || "all";
    const paramWeek = Number(paramWeekRaw);
    let nextWeek: string | number =
      paramWeekRaw === "all" || paramWeekRaw === ""
        ? "all"
        : Number.isFinite(paramWeek) && regularWeeks.includes(paramWeek)
          ? paramWeek
          : "all";
    if (!searchParams.get("week") && storedWeek !== "all") {
      const storedWeekNumber = Number(storedWeek);
      if (Number.isFinite(storedWeekNumber) && regularWeeks.includes(storedWeekNumber)) {
        nextWeek = storedWeekNumber;
      }
    }
    const nextType = searchParams.get("type") || storedType || "all";
    const nextTeam = searchParams.get("team") || storedTeam || "";
    setSeason(nextSeason);
    setWeek(nextWeek);
    setTypeFilter(nextType);
    setTeamFilter(nextTeam);
    let changed = false;
    if (!searchParams.get("season") && nextSeason) {
      params.set("season", String(nextSeason));
      changed = true;
    }
    if (!searchParams.get("week")) {
      params.set("week", nextWeek === "all" ? "all" : String(nextWeek));
      changed = true;
    }
    if (changed) setSearchParams(params, { replace: true });
    writeStorage(TRANSACTIONS_PREF_KEY, {
      season: nextSeason,
      week: nextWeek,
      type: nextType,
      team: nextTeam,
    });
    didInitRef.current = true;
  }, [seasons, manifest, searchParams, setSearchParams]);

  useEffect(() => {
    if (!availableWeeks.length) return;
    if (week === "all") return;
    const numericWeek = Number(week);
    if (!Number.isFinite(numericWeek) || !availableWeeks.includes(numericWeek)) {
      setWeek("all");
    }
  }, [availableWeeks, week]);

  const updateSearchParams = (nextSeason: number | string, nextWeek: string | number, nextType: string, nextTeam: string): void => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    params.set("week", nextWeek === "all" ? "all" : String(nextWeek));
    if (nextType && nextType !== "all") params.set("type", nextType);
    else params.delete("type");
    if (nextTeam) params.set("team", nextTeam);
    else params.delete("team");
    setSearchParams(params, { replace: true });
    writeStorage(TRANSACTIONS_PREF_KEY, {
      season: nextSeason,
      week: nextWeek,
      type: nextType,
      team: nextTeam,
    });
  };

  const handleSeasonChange = (value: string): void => {
    const nextSeason = Number(value);
    setSeason(nextSeason);
    updateSearchParams(nextSeason, week, typeFilter, teamFilter);
  };

  const handleWeekChange = (value: string): void => {
    const nextWeek = value === "all" ? "all" : Number(value);
    setWeek(nextWeek);
    updateSearchParams(season, nextWeek, typeFilter, teamFilter);
  };

  const handleTypeChange = (value: string): void => {
    setTypeFilter(value);
    updateSearchParams(season, week, value, teamFilter);
  };

  const handleTeamChange = (value: string): void => {
    setTeamFilter(value);
    updateSearchParams(season, week, typeFilter, value);
  };

  const entries = useMemo((): TransactionEntry[] => {
    const list = transactions?.entries || [];
    const filtered = list.filter((entry) => {
      const entryWeek = Number(entry.week);
      if (Number.isFinite(entryWeek) && (entryWeek < 1 || entryWeek > 18)) return false;
      if (week !== "all" && Number(entry.week) !== Number(week)) return false;
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (teamFilter && normalizeOwnerName(entry.team) !== teamFilter) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const weekA = Number(a.week) || 0;
      const weekB = Number(b.week) || 0;
      if (weekA !== weekB) return weekB - weekA;
      const createdA = Number(a.created) || 0;
      const createdB = Number(b.created) || 0;
      if (createdA !== createdB) return createdB - createdA;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }, [transactions, week, typeFilter, teamFilter]);

  const totalsByTeam = useMemo((): TeamTotal[] => {
    const totals = new Map<string, TeamTotal>();
    for (const entry of transactions?.entries || []) {
      const team = normalizeOwnerName(entry?.team) || "Unknown";
      const cur = totals.get(team) || { team, adds: 0, drops: 0, trades: 0 };
      if (entry?.type === "trade") cur.trades += 1;
      if (entry?.type === "add") cur.adds += 1;
      if (entry?.type === "drop") cur.drops += 1;
      totals.set(team, cur);
    }
    return Array.from(totals.values()).sort((a, b) => b.trades - a.trades);
  }, [transactions]);

  const recordHighlights = useMemo(() => {
    if (!totalsByTeam.length) return null;
    const mostAdds = totalsByTeam.reduce((best, row) => (row.adds > best.adds ? row : best), totalsByTeam[0]);
    const mostDrops = totalsByTeam.reduce((best, row) => (row.drops > best.drops ? row : best), totalsByTeam[0]);
    const mostTrades = totalsByTeam.reduce((best, row) => (row.trades > best.trades ? row : best), totalsByTeam[0]);
    return { mostAdds, mostDrops, mostTrades };
  }, [totalsByTeam]);

  const ownerLabel = (value: unknown, fallback: string = "—"): string => normalizeOwnerName(value) || fallback;
  const showAmount = Number(season) === 2025;
  const formatAmount = (entry: TransactionEntry): string => {
    if (!showAmount) return "—";
    if (entry?.type !== "add" && entry?.type !== "trade") return "—";
    const value = entry?.amount;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    return `$${numeric}`;
  };
  const virtualEntries = useVirtualRows({ itemCount: entries.length, rowHeight: 46 });
  const visibleEntries = entries.slice(virtualEntries.start, virtualEntries.end);

  const teamOptions = useMemo((): string[] => {
    const set = new Set<string>();
    for (const entry of transactions?.entries || []) {
      const label = normalizeOwnerName(entry?.team);
      if (label) set.add(label);
    }
    return Array.from(set).sort();
  }, [transactions]);

  const filteredCounts = useMemo(() => {
    const counts = { add: 0, drop: 0, trade: 0 };
    for (const entry of entries) {
      if (entry?.type === "add") counts.add += 1;
      if (entry?.type === "drop") counts.drop += 1;
      if (entry?.type === "trade") counts.trade += 1;
    }
    return counts;
  }, [entries]);

  const totalTransactions = (transactions?.entries || []).length;

  if (loading || dataLoading) return <LoadingState label="Loading transactions..." />;
  if (error || dataError) return <ErrorState message={error || fetchError?.message || "Error loading transactions"} />;

  const isPlaceholderName = (value: unknown): boolean => /^ESPN Player \d+$/i.test(String(value || "").trim());

  const resolvePlayerLabel = (player: Player | null | undefined): string => {
    if (!player) return "Unknown";
    if (player.name) {
      if (isPlaceholderName(player.name)) {
        const mapped = espnNameMap?.[String(player.id)];
        if (mapped) return mapped;
      } else if (!looksLikeId(player.name)) {
        return player.name;
      }
    }
    if (player.id_type === "espn") {
      const mapped = espnNameMap?.[String(player.id)];
      if (mapped) return mapped;
    }
    return player.name || player.id || "Unknown";
  };

  const renderPlayerLinks = (players: Player[]): ReactNode =>
    players
      .map((player, index) => {
        if (!player?.id) return <span key={`${player.name}-${index}`}>{player.name || "Unknown"}</span>;
        const canonicalId = getCanonicalPlayerId(player.id, {
          row: {
            player_id: player.id,
            sleeper_id: player.id_type === "sleeper" ? player.id : null,
            gsis_id: player.id_type === "gsis" ? player.id : null,
            espn_id: player.id_type === "espn" ? player.id : null,
          },
          playerIndex,
        });
        const linkId = canonicalId || String(player.id);
        const label = resolvePlayerLabel(player);
        const link = label ? `/players/${linkId}?name=${encodeURIComponent(label)}` : `/players/${linkId}`;
        return (
          <Link key={`${player.id}-${index}`} to={link} className="text-accent-600 hover:text-accent-700 font-medium hover:underline transition-colors">
            {label}
          </Link>
        );
      })
      .reduce<ReactNode>((prev, curr) => (prev === null ? [curr] : [prev, ", ", curr]), null);

  const hasActiveFilters = teamFilter || typeFilter !== "all" || week !== "all";

  return (
    <PageTransition>
      {/* Hero Section */}
      <div className="relative w-full bg-ink-900 text-white overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-accent-500/20">
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 -z-10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-green-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-red-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />

        <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg shadow-green-500/30">
              <ArrowRightLeft className="text-white drop-shadow-md" size={32} />
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 px-4 py-1.5 text-sm font-bold">
              <Calendar size={14} className="mr-2" />
              Season {season}
            </Badge>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-white via-white to-green-300 bg-clip-text text-transparent drop-shadow-lg mb-4">
            Transactions
            <span className="text-green-400 text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]">.</span>
          </h1>
          <p className="text-lg md:text-xl text-ink-300 max-w-3xl leading-relaxed">
            Track trades, adds, and drops by season and week.
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <div className="group relative bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl p-6 text-white shadow-lg shadow-accent-500/25 hover:shadow-xl hover:shadow-accent-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="text-accent-200" size={18} />
              <span className="text-[10px] font-bold text-accent-200 uppercase tracking-[0.15em]">Total Trades</span>
            </div>
            <div className="text-5xl font-display font-black leading-none mb-1">{filteredCounts.trade}</div>
            <p className="text-xs text-accent-200/80">This season</p>
          </div>
        </div>

        <div className="group relative bg-white rounded-2xl p-6 border-2 border-green-200 hover:border-green-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="text-green-500" size={18} />
              <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Adds</span>
            </div>
            <div className="text-5xl font-display font-black text-ink-900 leading-none group-hover:text-green-600 transition-colors">{filteredCounts.add}</div>
            <p className="text-xs text-ink-400 mt-1">Player pickups</p>
          </div>
        </div>

        <div className="group relative bg-white rounded-2xl p-6 border-2 border-red-200 hover:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Minus className="text-red-500" size={18} />
              <span className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em]">Drops</span>
            </div>
            <div className="text-5xl font-display font-black text-ink-900 leading-none group-hover:text-red-600 transition-colors">{filteredCounts.drop}</div>
            <p className="text-xs text-ink-400 mt-1">Released players</p>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="text-purple-200" size={18} />
              <span className="text-[10px] font-bold text-purple-200 uppercase tracking-[0.15em]">Total Activity</span>
            </div>
            <div className="text-5xl font-display font-black leading-none mb-1">{totalTransactions}</div>
            <p className="text-xs text-purple-200/80">All transactions</p>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-2xl shadow-lg border border-ink-200/50 p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-wrap gap-6 items-end mb-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
                <Calendar size={14} className="text-green-500" />
                Season
              </label>
              <select
                value={season}
                onChange={(event) => handleSeasonChange(event.target.value)}
                className="rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 hover:border-green-300 transition-all min-w-[140px]"
              >
                {seasons.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
                <Target size={14} className="text-green-500" />
                Week
              </label>
              <select
                value={week}
                onChange={(event) => handleWeekChange(event.target.value)}
                className="rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 hover:border-green-300 transition-all min-w-[140px]"
              >
                <option value="all">All weeks</option>
                {availableWeeks.map((value) => (
                  <option key={value} value={value}>Week {value}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
                <Filter size={14} className="text-green-500" />
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(event) => handleTypeChange(event.target.value)}
                className="rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 hover:border-green-300 transition-all min-w-[140px]"
              >
                <option value="all">All types</option>
                <option value="trade">Trade</option>
                <option value="add">Add</option>
                <option value="drop">Drop</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.15em] flex items-center gap-2">
                <Users size={14} className="text-green-500" />
                Team
              </label>
              <select
                value={teamFilter}
                onChange={(event) => handleTeamChange(event.target.value)}
                className="rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 hover:border-green-300 transition-all min-w-[180px]"
              >
                <option value="">All teams</option>
                {teamOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-12 px-5 border-2 border-ink-200 text-lg font-bold flex items-center gap-2">
                <Zap size={18} className="text-green-500" />
                {entries.length} Entries
              </Badge>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  className="h-12 px-4 border-2 rounded-xl hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all"
                  onClick={() => {
                    setTeamFilter("");
                    setTypeFilter("all");
                    setWeek("all");
                    updateSearchParams(season, "all", "all", "");
                  }}
                >
                  <X size={16} className="mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-6 pt-4 border-t border-ink-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent-500" />
              <span className="text-sm text-ink-600">Trades: <span className="font-bold text-ink-900">{filteredCounts.trade}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-ink-600">Adds: <span className="font-bold text-ink-900">{filteredCounts.add}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-sm text-ink-600">Drops: <span className="font-bold text-ink-900">{filteredCounts.drop}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <Card className="mb-8 shadow-lg border border-ink-200/50 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg shadow-green-500/20">
              <TrendingUp className="text-white" size={22} />
            </div>
            <div>
              <CardTitle className="text-2xl font-display font-black">Recent Transactions</CardTitle>
              <CardDescription className="text-sm text-ink-500 font-medium">Latest waiver moves and trades</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative z-10">
          {entries.length ? (
            <div className="overflow-x-auto" ref={virtualEntries.containerRef}>
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-ink-900 to-ink-800 text-white">
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Week</th>
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team</th>
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Type</th>
                    {showAmount ? <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Amount</th> : null}
                    <th className="py-4 px-5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {virtualEntries.topPadding ? (
                    <tr aria-hidden="true">
                      <td colSpan={showAmount ? 5 : 4} style={{ height: virtualEntries.topPadding }} />
                    </tr>
                  ) : null}
                  {visibleEntries.map((entry, idx) => (
                    <tr key={entry.id} className={`hover:bg-accent-50/50 transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-ink-100 font-mono font-bold text-ink-700">
                          {entry.week ?? "—"}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm font-bold text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-lg transition-all"
                          onClick={() => handleTeamChange(normalizeOwnerName(entry.team))}
                        >
                          {ownerLabel(entry.team, entry.team || "Unknown")}
                        </Button>
                      </td>
                      <td className="py-4 px-5">
                        <Badge
                          className="text-[10px] uppercase font-bold px-3 py-1"
                          variant={
                            entry.type === "trade" ? "secondary" : entry.type === "add" ? "success" : "destructive"
                          }
                        >
                          {entry.type === "trade" && <ArrowRightLeft size={12} className="mr-1" />}
                          {entry.type === "add" && <Plus size={12} className="mr-1" />}
                          {entry.type === "drop" && <Minus size={12} className="mr-1" />}
                          {entry.type}
                        </Badge>
                      </td>
                      {showAmount ? <td className="py-4 px-5 font-mono text-lg font-bold text-green-600">{formatAmount(entry)}</td> : null}
                      <td className="py-4 px-5">
                        {entry.players?.length ? (
                          <div className="text-sm">
                            {entry.type === "trade" ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="success" className="text-[9px] px-2 py-0.5">Received</Badge>
                                  <div className="flex flex-wrap gap-x-1">
                                    {renderPlayerLinks(entry.players.filter((player) => player?.action === "received"))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="destructive" className="text-[9px] px-2 py-0.5">Sent</Badge>
                                  <div className="flex flex-wrap gap-x-1">
                                    {renderPlayerLinks(entry.players.filter((player) => player?.action === "sent"))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-ink-500 text-xs font-medium">
                                  {entry.type === "add" ? "Added:" : entry.type === "drop" ? "Dropped:" : "Updated:"}
                                </span>
                                {renderPlayerLinks(entry.players)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-ink-500 italic">{entry.summary || "No details"}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {virtualEntries.bottomPadding ? (
                    <tr aria-hidden="true">
                      <td colSpan={showAmount ? 5 : 4} style={{ height: virtualEntries.bottomPadding }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ink-100 flex items-center justify-center">
                <ArrowRightLeft size={32} className="text-ink-400" />
              </div>
              <p className="text-lg text-ink-500 font-medium">No transaction data available for this season.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Season Totals & League Records */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Users className="text-white" size={22} />
              </div>
              <CardTitle className="text-xl font-display font-black">Season Totals by Team</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 relative z-10">
            {totalsByTeam.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-900 to-blue-800 text-white">
                      <th className="py-3 px-4 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team</th>
                      <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Adds</th>
                      <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Drops</th>
                      <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-[0.15em]">Trades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {totalsByTeam.map((row, idx) => (
                      <tr key={row.team} className={`hover:bg-accent-50/50 transition-all ${idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/30'}`}>
                        <td className="py-3 px-4 font-display font-bold text-ink-900">{ownerLabel(row.team, row.team)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-green-100 text-green-700 font-mono font-bold">
                            {row.adds}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-red-100 text-red-700 font-mono font-bold">
                            {row.drops}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-accent-100 text-accent-700 font-mono font-bold">
                            {row.trades}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-ink-500">No team totals available.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg border border-ink-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <CardHeader className="bg-gradient-to-r from-ink-50 to-white border-b border-ink-100">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20">
                <Award className="text-white" size={22} />
              </div>
              <CardTitle className="text-xl font-display font-black">League Records</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 relative z-10">
            {recordHighlights ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-white border border-green-200 hover:shadow-md transition-all">
                  <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Plus size={14} />
                    Most Weekly Adds
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-display font-black text-lg text-ink-900">{ownerLabel(recordHighlights.mostAdds.team, recordHighlights.mostAdds.team)}</span>
                    <Badge variant="success" className="text-sm font-bold">{recordHighlights.mostAdds.adds} adds</Badge>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-r from-red-50 to-white border border-red-200 hover:shadow-md transition-all">
                  <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Minus size={14} />
                    Most Weekly Drops
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-display font-black text-lg text-ink-900">{ownerLabel(recordHighlights.mostDrops.team, recordHighlights.mostDrops.team)}</span>
                    <Badge variant="destructive" className="text-sm font-bold">{recordHighlights.mostDrops.drops} drops</Badge>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-r from-accent-50 to-white border border-accent-200 hover:shadow-md transition-all">
                  <div className="text-[10px] font-bold text-accent-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <ArrowRightLeft size={14} />
                    Total Trades Leader
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-display font-black text-lg text-ink-900">{ownerLabel(recordHighlights.mostTrades.team, recordHighlights.mostTrades.team)}</span>
                    <Badge className="text-sm font-bold bg-accent-500">{recordHighlights.mostTrades.trades} trades</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-ink-500">No league transaction records available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
