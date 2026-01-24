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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
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
  ChevronRight
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
      <section className="mb-6">
        <h1 className="text-5xl md:text-6xl font-display font-black text-ink-900 mb-3">League Summary</h1>
        <p className="text-lg md:text-xl text-ink-600 max-w-4xl">
          Snapshot of the latest season plus all-time records from available league exports.
        </p>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Calendar size={56} className="text-accent-700" />
          </div>
          <CardHeader className="pb-2">
            <span className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest">Current Season</span>
          </CardHeader>
          <CardContent>
            <div className="text-5xl md:text-6xl font-display text-accent-700 leading-none font-black">{latestSeason ?? "—"}</div>
            <p className="text-sm md:text-base text-ink-500 font-medium uppercase tracking-tight mt-2 flex items-center gap-1">
              <Activity size={14} /> {statusLabel}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Trophy size={56} className="text-amber-500" />
          </div>
          <CardHeader className="pb-2">
            <span className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest">League Champion</span>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-display text-ink-900 truncate leading-tight mb-1 font-black">{championLabel}</div>
            <p className="text-xs md:text-sm text-ink-500 font-medium uppercase tracking-tight leading-relaxed">{championNote}</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Zap size={56} className="text-blue-500" />
          </div>
          <CardHeader className="pb-2">
            <span className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest">Transactions</span>
          </CardHeader>
          <CardContent>
            <div className="text-5xl md:text-6xl font-display text-ink-900 leading-none font-black">{transactionTotals ? transactionTotals.total : "—"}</div>
            <p className="text-sm md:text-base text-ink-500 font-medium uppercase tracking-tight mt-2">Trades + adds + drops</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <ArrowRightLeft size={56} className="text-purple-500" />
          </div>
          <CardHeader className="pb-2">
            <span className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-widest">Total Trades</span>
          </CardHeader>
          <CardContent>
            <div className="text-5xl md:text-6xl font-display text-ink-900 leading-none font-black">{transactionTotals ? transactionTotals.totalTrades : "—"}</div>
            <p className="text-sm md:text-base text-ink-500 font-medium uppercase tracking-tight mt-2">Latest season trades</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-2xl font-black">Season Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            {transactionTotals ? (
              <div className="flex flex-col gap-2">
                <div className="text-base md:text-lg">
                  <span className="font-bold text-ink-900">Most adds:</span>{" "}
                  <span className="text-accent-700">{ownerLabel(transactionTotals.mostAdds?.team, transactionTotals.mostAdds?.team || "—")}</span>{" "}
                  <span className="text-ink-600">({transactionTotals.mostAdds?.adds || 0})</span>
                </div>
                <div className="text-base md:text-lg">
                  <span className="font-bold text-ink-900">Most drops:</span>{" "}
                  <span className="text-accent-700">{ownerLabel(transactionTotals.mostDrops?.team, transactionTotals.mostDrops?.team || "—")}</span>{" "}
                  <span className="text-ink-600">({transactionTotals.mostDrops?.drops || 0})</span>
                </div>
                <div className="text-base md:text-lg">
                  <span className="font-bold text-ink-900">Trades logged:</span>{" "}
                  <span className="text-accent-700">{transactionTotals.totalTrades}</span>
                </div>
              </div>
            ) : (
              <div className="text-base text-ink-500">No transaction data available for this season.</div>
            )}
          </CardContent>
        </Card>

        <NavigationCard
          to="/matchups"
          title="Weekly Matchups"
          description="Browse matchups by season and week, then dive into roster details."
        />
        <NavigationCard
          to="/standings"
          title="Standings"
          description="Season standings plus all-time franchise summaries."
        />
      </div>

      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<Card className="mb-6 shadow-soft"><CardContent className="pt-6 text-base">Loading weekly leaders…</CardContent></Card>}
      >
        <Card className="mb-6 shadow-soft">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-black">Top Weekly Performances</CardTitle>
            <CardDescription className="text-base md:text-lg">45+ Point Games (2015–2025)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <SearchBar value={weeklySearch} onChange={setWeeklySearch} placeholder="Search weekly leaders..." />
            </div>
            {allTimePending ? (
              <div className="text-base text-ink-500">Loading weekly leaders…</div>
            ) : topWeekly.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="text-sm md:text-base">Player</th>
                      <th className="text-sm md:text-base hidden md:table-cell">Team</th>
                      <th className="text-sm md:text-base">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topWeekly.slice(0, 10).map((row, index) => {
                      const pid = row?.player_id;
                      const player = pid ? playerFromSleeper(pid) : null;
                      const playerName = row ? getPlayerName(row) || player?.name : "Unknown";
                      return (
                        <tr key={`${pid || "unknown"}-${row?.season || "x"}-${row?.week || "x"}-${index}`}>
                          <td className="py-3 px-4">
                            {pid ? (
                              <Link to={`/players/${pid}`} className="flex items-center gap-2 md:gap-3 group">
                                <div className="w-6 h-6 rounded-full border border-ink-100 overflow-hidden bg-white shrink-0 shadow-sm group-hover:border-accent-300 transition-colors">
                                  <img
                                    src={`https://sleepercdn.com/content/nfl/players/${pid}.jpg`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    style={{ width: '100%', height: '100%' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-sm md:text-base truncate max-w-[120px] md:max-w-none group-hover:text-accent-700 transition-colors">{playerName}</div>
                                  <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-wider">
                                    {row.season} · W{row.week}
                                  </div>
                                </div>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2 md:gap-3">
                                <div className="w-6 h-6 rounded-full bg-ink-50 border border-ink-100 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-sm md:text-base truncate max-w-[120px] md:max-w-none">{playerName || "Unknown"}</div>
                                  <div className="text-xs md:text-sm font-bold text-ink-400 uppercase tracking-wider">
                                    {row.season} · W{row.week}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-base md:text-lg font-medium text-ink-800 hidden md:table-cell">
                            {(() => {
                              const ownerByTeam = ownersBySeason.get(Number(row.season));
                              const owner = ownerByTeam?.get(row.team || "");
                              return owner ? (
                                <div className="flex flex-col">
                                  <span className="font-bold">{owner}</span>
                                  <span className="text-xs md:text-sm text-ink-400 uppercase tracking-tighter">{row.team}</span>
                                </div>
                              ) : row.team;
                            })()}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 md:gap-3 justify-end md:justify-start">
                              <span className="text-xl md:text-3xl font-display text-accent-700 font-black">{formatPoints(row.points)}</span>
                              {row.started != null && (
                                <Badge
                                  variant={row.started ? "success" : "destructive"}
                                  className="text-xs md:text-sm px-2 py-0.5 font-black"
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
              <div className="text-base text-ink-500 italic pb-4">No weekly performance data available.</div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>

      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<Card className="mb-6 shadow-soft"><CardContent className="pt-6 text-base">Loading career leaders…</CardContent></Card>}
      >
        <Card className="mb-6 shadow-soft">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-black">Career Fantasy Leaders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search career leaders..." />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-ink-500 uppercase">Position</span>
                <select
                  value={careerPosition}
                  onChange={(e) => setCareerPosition(e.target.value)}
                  className="rounded-md border border-ink-200 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent-500"
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
            {allTimePending ? (
              <div className="text-base text-ink-500">Loading career leaders…</div>
            ) : careerLeaders.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="text-sm md:text-base">Player</th>
                      <th className="text-sm md:text-base">Seasons</th>
                      <th className="text-sm md:text-base">Total Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {careerLeaders.slice(0, 10).map((row, index) => {
                      const pid = row?.player_id;
                      const player = pid ? playerFromSleeper(pid) : null;
                      const playerName = row ? getPlayerName(row) || player?.name : "Unknown";
                      return (
                        <tr key={pid || `career-${index}`} className="hover:bg-ink-50/30 transition-colors">
                          <td className="py-3 px-4">
                            {pid ? (
                              <Link to={`/players/${pid}`} className="flex items-center gap-2 md:gap-3 group">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-ink-100 overflow-hidden bg-white shrink-0 shadow-sm group-hover:border-accent-300 transition-colors">
                                  <img
                                    src={`https://sleepercdn.com/content/nfl/players/${pid}.jpg`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    style={{ width: '100%', height: '100%' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-xs md:text-sm group-hover:text-accent-700 transition-colors truncate max-w-[120px] md:max-w-none">{playerName}</div>
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-3.5 uppercase font-black tracking-tighter">
                                    {row.__pos || "—"}
                                  </Badge>
                                </div>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2 md:gap-3">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-ink-50 border border-ink-100 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-xs md:text-sm truncate max-w-[120px] md:max-w-none">{playerName || "Unknown"}</div>
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-3.5 uppercase font-black tracking-tighter">
                                    {row.__pos || "—"}
                                  </Badge>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-base md:text-lg font-medium text-ink-600 text-center">
                            {row.seasons}
                          </td>
                          <td className="py-3 px-4 font-display text-xl md:text-3xl text-accent-700 leading-none text-right font-black">
                            {formatPoints(row.points)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-base text-ink-500 italic pb-4">No career leaderboard data available.</div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>
    </PageTransition>
  );
}
