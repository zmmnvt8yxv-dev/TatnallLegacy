import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import PageTransition from "../components/PageTransition.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { useTransactions } from "../hooks/useTransactions";
import { filterRegularSeasonWeeks } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { useVirtualRows } from "../utils/useVirtualRows";
import { readStorage, writeStorage } from "../utils/persistence";
import { Link, useSearchParams } from "react-router-dom";
import { getCanonicalPlayerId, looksLikeId } from "../lib/playerName";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
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
  const isDev = import.meta.env.DEV;
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
          <Link key={`${player.id}-${index}`} to={link} className="link-button">
            {label}
          </Link>
        );
      })
      .reduce<ReactNode>((prev, curr) => (prev === null ? [curr] : [prev, ", ", curr]), null);

  return (
    <PageTransition>
      <section>
        <h1 className="page-title">Transactions</h1>
        <p className="page-subtitle">Track trades, adds, and drops by season and week.</p>
      </section>

      <Card className="mb-6 shadow-soft filters--sticky bg-white/80 backdrop-blur-sm border-ink-100">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider ml-1">Season</label>
              <select
                value={season}
                onChange={(event) => handleSeasonChange(event.target.value)}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[100px]"
              >
                {seasons.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider ml-1">Week</label>
              <select
                value={week}
                onChange={(event) => handleWeekChange(event.target.value)}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[120px]"
              >
                <option value="all">All weeks</option>
                {availableWeeks.map((value) => (
                  <option key={value} value={value}>Week {value}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider ml-1">Type</label>
              <select
                value={typeFilter}
                onChange={(event) => handleTypeChange(event.target.value)}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[120px]"
              >
                <option value="all">All types</option>
                <option value="trade">Trade</option>
                <option value="add">Add</option>
                <option value="drop">Drop</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider ml-1">Team</label>
              <select
                value={teamFilter}
                onChange={(event) => handleTeamChange(event.target.value)}
                className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[150px]"
              >
                <option value="">All teams</option>
                {teamOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 mb-1.5">
              <Badge variant="outline" className="h-8 px-3 border-ink-200 whitespace-nowrap">
                {entries.length} Entries
              </Badge>
              {teamFilter || typeFilter !== "all" || week !== "all" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-ink-500 hover:text-accent-700"
                  onClick={() => {
                    setTeamFilter("");
                    setTypeFilter("all");
                    setWeek("all");
                    updateSearchParams(season, "all", "all", "");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex gap-4 mt-3 pt-3 border-t border-ink-100">
            <div className="text-[11px] text-ink-500 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
                Trades: <span className="font-bold text-ink-900">{filteredCounts.trade}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Adds: <span className="font-bold text-ink-900">{filteredCounts.add}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                Drops: <span className="font-bold text-ink-900">{filteredCounts.drop}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8 shadow-soft">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length ? (
            <div className="table-wrap virtual-table" ref={virtualEntries.containerRef}>
              <table className="table">
                <thead>
                  <tr className="border-b border-ink-100">
                    <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Week</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Team</th>
                    <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Type</th>
                    {showAmount ? <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Amount</th> : null}
                    <th className="py-3 px-4 text-left text-xs font-bold text-ink-500 uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {virtualEntries.topPadding ? (
                    <tr className="table-virtual-spacer" aria-hidden="true">
                      <td colSpan={showAmount ? 5 : 4} style={{ height: virtualEntries.topPadding }} />
                    </tr>
                  ) : null}
                  {visibleEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-ink-50/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-sm">{entry.week ?? "—"}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs font-semibold text-accent-700 bg-accent-50/50 hover:bg-accent-100"
                          onClick={() => handleTeamChange(normalizeOwnerName(entry.team))}
                        >
                          {ownerLabel(entry.team, entry.team || "Unknown")}
                        </Button>
                      </td>
                      <td>
                        <Badge
                          className="text-[10px] uppercase font-bold"
                          variant={
                            entry.type === "trade" ? "secondary" : entry.type === "add" ? "success" : "destructive"
                          }
                        >
                          {entry.type}
                        </Badge>
                      </td>
                      {showAmount ? <td className="font-mono text-sm">{formatAmount(entry)}</td> : null}
                      <td>
                        {entry.players?.length ? (
                          <div className="text-sm">
                            {entry.type === "trade" ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-ink-400">Received:</span>
                                <div className="flex flex-wrap gap-x-1">
                                  {renderPlayerLinks(entry.players.filter((player) => player?.action === "received"))}
                                </div>
                                <span className="text-xs text-ink-400">Sent:</span>
                                <div className="flex flex-wrap gap-x-1">
                                  {renderPlayerLinks(entry.players.filter((player) => player?.action === "sent"))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-x-1">
                                <span className="text-ink-500 italic mr-1">
                                  {entry.type === "add" ? "Added:" : entry.type === "drop" ? "Dropped:" : "Updated:"}
                                </span>
                                {renderPlayerLinks(entry.players)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-ink-600 italic">{entry.summary || "No details"}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {virtualEntries.bottomPadding ? (
                    <tr className="table-virtual-spacer" aria-hidden="true">
                      <td colSpan={showAmount ? 5 : 4} style={{ height: virtualEntries.bottomPadding }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-ink-500 italic text-center py-12">
              No transaction data available for this season.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Season Totals by Team</CardTitle>
          </CardHeader>
          <CardContent>
            {totalsByTeam.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Adds</th>
                      <th>Drops</th>
                      <th>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalsByTeam.map((row) => (
                      <tr key={row.team}>
                        <td className="font-semibold text-ink-900">{ownerLabel(row.team, row.team)}</td>
                        <td className="font-mono text-sm">{row.adds}</td>
                        <td className="font-mono text-sm">{row.drops}</td>
                        <td className="font-mono text-sm text-accent-700 font-bold">{row.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-ink-500 italic">No team totals available.</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>League Records</CardTitle>
          </CardHeader>
          <CardContent>
            {recordHighlights ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-accent-50/50 border border-accent-100">
                  <div className="text-[10px] font-bold text-accent-700 uppercase tracking-wider mb-1">Most Weekly Adds</div>
                  <div className="flex justify-between items-center">
                    <span className="font-display text-ink-900">{ownerLabel(recordHighlights.mostAdds.team, recordHighlights.mostAdds.team)}</span>
                    <Badge variant="accent">{recordHighlights.mostAdds.adds} adds</Badge>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-ink-50/50 border border-ink-100">
                  <div className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Most Weekly Drops</div>
                  <div className="flex justify-between items-center">
                    <span className="font-display text-ink-900">{ownerLabel(recordHighlights.mostDrops.team, recordHighlights.mostDrops.team)}</span>
                    <Badge variant="outline">{recordHighlights.mostDrops.drops} drops</Badge>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-accent-50/50 border border-accent-100">
                  <div className="text-[10px] font-bold text-accent-700 uppercase tracking-wider mb-1">Total Trades Leader</div>
                  <div className="flex justify-between items-center">
                    <span className="font-display text-ink-900">{ownerLabel(recordHighlights.mostTrades.team, recordHighlights.mostTrades.team)}</span>
                    <Badge variant="accent">{recordHighlights.mostTrades.trades} trades</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink-500 italic">No league transaction records available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
