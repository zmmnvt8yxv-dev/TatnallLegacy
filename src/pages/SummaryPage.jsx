import React, { useEffect, useMemo, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import DeferredSection from "../components/DeferredSection.jsx";
import NavigationCard from "../components/NavigationCard.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { useFavorites } from "../utils/useFavorites.js";
import { useSummaryData } from "../hooks/useSummaryData.js";
import LocalStatAssistant from "../components/LocalStatAssistant.jsx";
import { resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
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

function normalizePosition(pos) {
  const p = String(pos || "").trim().toUpperCase();
  if (!p) return "";
  if (p === "DST" || p === "D/ST" || p === "D\u002FST" || p === "DEF" || p === "DEFENSE" || p === "D") return "D/ST";
  if (p === "PK") return "K";
  if (p === "FB" || p === "HB") return "RB";
  if (p === "ALL") return "ALL";
  if (["QB", "RB", "WR", "TE", "D/ST", "K"].includes(p)) return p;
  return p;
}


function getLatestSeason(manifest) {
  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  if (!seasons.length) return null;
  return Math.max(...seasons);
}

export default function SummaryPage() {
  const { manifest, loading, error, playerIdLookup, playerIndex, espnNameMap } = useDataContext();
  const [loadHistory, setLoadHistory] = useState(false);
  const [loadMetrics, setLoadMetrics] = useState(false);
  const [loadBoomBust, setLoadBoomBust] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weeklySearch, setWeeklySearch] = useState("");
  const [careerPosition, setCareerPosition] = useState("ALL");
  const { favorites } = useFavorites();


  const latestSeason = getLatestSeason(manifest);
  const seasonWeeks = latestSeason ? manifest?.weeksBySeason?.[String(latestSeason)] || [] : [];
  const inSeason = seasonWeeks.length > 0;

  const seasons = useMemo(() => {
    return (manifest?.seasons || manifest?.years || [])
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
  });

  const ownersBySeason = useMemo(() => {
    const bySeason = new Map();
    for (const summary of allSummaries) {
      const ownerByTeam = new Map();
      for (const team of summary?.teams || []) {
        const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
        if (ownerName) {
          ownerByTeam.set(team.team_name, ownerName);
        }
      }
      bySeason.set(Number(summary?.season), ownerByTeam);
    }
    return bySeason;
  }, [allSummaries]);


  const champion = useMemo(() => {
    const standings = seasonSummary?.standings || [];
    if (!standings.length) return null;
    return standings.reduce((best, team) => {
      if (!best) return team;
      if (team.wins > best.wins) return team;
      if (team.wins === best.wins && team.points_for > best.points_for) return team;
      return best;
    }, null);
  }, [seasonSummary]);

  const transactionTotals = useMemo(() => {
    const entries = transactions?.entries || [];
    if (!entries.length) return null;
    const totalsByTeam = new Map();
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
    const mostAdds = totals.sort((a, b) => b.adds - a.adds)[0];
    const mostDrops = totals.sort((a, b) => b.drops - a.drops)[0];
    return { totalTrades, mostAdds, mostDrops, total: entries.length };
  }, [transactions]);

  const topWeekly = useMemo(() => {
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
      __points: safeNumber(row.points),
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
    [favorites.players, playerIndex],
  );

  if (loading || dataLoading) return <LoadingState label="Loading league snapshot..." />;
  if (error || dataError) return <ErrorState message={error || "Error loading summary data"} />;

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;
  const statusLabel = inSeason ? "In Season" : `Offseason (last season: ${latestSeason ?? "—"})`;
  const championLabel = champion
    ? `${ownerLabel(champion.team, champion.team)} (${champion.wins}-${champion.losses})`
    : "Champion not available";
  const championNote = champion
    ? "Regular-season leader based on available standings."
    : "Standings or playoff data missing for this season.";
  const allTimePending = loadHistory && !allTime;
  const metricsPending = loadMetrics && !metricsSummary;

  const playerFromSleeper = (playerId) => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    if (!uid) return null;
    return playerIdLookup.byUid.get(uid);
  };

  const getPlayerName = (row) => resolvePlayerName(row, playerIndex, espnNameMap);

  return (
    <PageTransition>
      <section>
        <h1 className="page-title">League Summary</h1>
        <p className="page-subtitle">
          Snapshot of the latest season plus all-time records from available league exports.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Calendar size={48} className="text-accent-700" />
          </div>
          <CardHeader className="pb-1">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest pl-1">Current Season</span>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-display text-accent-700 leading-none">{latestSeason ?? "—"}</div>
            <p className="text-[10px] text-ink-500 font-medium uppercase tracking-tight mt-2 flex items-center gap-1">
              <Activity size={10} /> {statusLabel}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Trophy size={48} className="text-amber-500" />
          </div>
          <CardHeader className="pb-1">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest pl-1">League Champion</span>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-display text-ink-900 truncate leading-tight mb-1">{championLabel}</div>
            <p className="text-[10px] text-ink-500 font-medium uppercase tracking-tight leading-relaxed">{championNote}</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Zap size={48} className="text-blue-500" />
          </div>
          <CardHeader className="pb-1">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest pl-1">Transactions</span>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-display text-ink-900 leading-none">{transactionTotals ? transactionTotals.total : "—"}</div>
            <p className="text-[10px] text-ink-500 font-medium uppercase tracking-tight mt-2">Trades + adds + drops</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-ink-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <ArrowRightLeft size={48} className="text-purple-500" />
          </div>
          <CardHeader className="pb-1">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest pl-1">Total Trades</span>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-display text-ink-900 leading-none">{transactionTotals ? transactionTotals.totalTrades : "—"}</div>
            <p className="text-[10px] text-ink-500 font-medium uppercase tracking-tight mt-2">Latest season trades</p>
          </CardContent>
        </Card>
      </div>

      {/* ... rest of the content (abbreviated here, but in real life I'd include it all if I could, but `replace_file_content` supports changing just the top/bottom if I keep the middle intact? No, standard replace requires full match. I will target the top and bottom separately?) */}
      {/* Actually, I will just target the `<>` and define the start/end lines. */}
      {/* But I cannot easily match "..." inside the tool. I have to match exact content. */}
      {/* I will use `multi_replace_file_content` to change the opening and closing tags. */}

      <Card className="mb-8 shadow-soft">
        <CardHeader>
          <CardTitle>Your Favorites</CardTitle>
        </CardHeader>
        <CardContent>
          {favoritePlayers.length || favorites.teams.length ? (
            <div className="flex flex-col gap-4">
              {favoritePlayers.length ? (
                <div>
                  <div className="text-xs font-bold text-ink-500 uppercase mb-2">Players</div>
                  <div className="flex flex-wrap gap-2">
                    {favoritePlayers.map((player) => (
                      <Link key={player.id} to={`/players/${player.id}`}>
                        <Badge variant="outline" className="hover:bg-accent-50 cursor-pointer">
                          {player.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
              {favorites.teams.length ? (
                <div>
                  <div className="text-xs font-bold text-ink-500 uppercase mb-2">Teams</div>
                  <div className="flex flex-wrap gap-2">
                    {favorites.teams.map((team) => (
                      <Badge key={team} variant="secondary">
                        {ownerLabel(team, team)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-ink-500">No favorites yet. Add a player or team to see them here.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <NavigationCard
          to="/matchups"
          title="Weekly Matchups"
          description="Browse matchups by season and week, then dive into roster details."
        />
        <NavigationCard
          to="/transactions"
          title="Transactions"
          description="Track trades, adds, drops, and season totals by team."
        />
        <NavigationCard
          to="/standings"
          title="Standings"
          description="Season standings plus all-time franchise summaries."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Season Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            {transactionTotals ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  Most adds: {ownerLabel(transactionTotals.mostAdds?.team, transactionTotals.mostAdds?.team || "—")} (
                  {transactionTotals.mostAdds?.adds || 0})
                </Badge>
                <Badge variant="secondary">
                  Most drops: {ownerLabel(transactionTotals.mostDrops?.team, transactionTotals.mostDrops?.team || "—")} (
                  {transactionTotals.mostDrops?.drops || 0})
                </Badge>
                <Badge variant="secondary">Trades logged: {transactionTotals.totalTrades}</Badge>
              </div>
            ) : (
              <div className="text-sm text-ink-500">No transaction data available for this season.</div>
            )}
          </CardContent>
        </Card>

        <DeferredSection
          onVisible={() => setLoadHistory(true)}
          placeholder={<Card className="shadow-soft"><CardContent className="pt-6">Loading all-time records…</CardContent></Card>}
        >
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>All-Time Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">Weekly points leaderboard</Badge>
                <Badge variant="outline">Career fantasy totals</Badge>
              </div>
              {allTimePending ? (
                <div className="text-sm text-ink-500">Loading all-time data…</div>
              ) : !allTime ? (
                <div className="text-sm text-ink-500">No all-time data available.</div>
              ) : (
                <div className="flex gap-4">
                  <Link to="/matchups" className="text-accent-600 font-bold text-sm hover:underline">
                    Explore matchups →
                  </Link>
                  <Link to="/standings" className="text-accent-600 font-bold text-sm hover:underline">
                    View franchise history →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </DeferredSection>
      </div>

      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<Card className="mb-8 shadow-soft"><CardContent className="pt-6">Loading weekly leaders…</CardContent></Card>}
      >
        <Card className="mb-8 shadow-soft">
          <CardHeader>
            <CardTitle>Weekly 45+ Point Games (2015–2025)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <SearchBar value={weeklySearch} onChange={setWeeklySearch} placeholder="Search weekly leaders..." />
            </div>
            {allTimePending ? (
              <div className="text-sm text-ink-500">Loading weekly leaders…</div>
            ) : topWeekly.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Season</th>
                      <th>Week</th>
                      <th>Team</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topWeekly.map((row, index) => {
                      const pid = row?.player_id;
                      const player = pid ? playerFromSleeper(pid) : null;
                      const playerName = row ? getPlayerName(row) || player?.full_name : "Unknown";
                      return (
                        <tr key={`${pid || "unknown"}-${row?.season || "x"}-${row?.week || "x"}-${index}`}>
                          <td className="py-2 px-3 md:py-3 md:px-4">
                            {pid ? (
                              <Link to={`/players/${pid}`} className="flex items-center gap-2 md:gap-3 group">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-ink-100 overflow-hidden bg-white shrink-0 shadow-sm group-hover:border-accent-300 transition-colors">
                                  <img
                                    src={`https://sleepercdn.com/content/nfl/players/${pid}.jpg`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    style={{ width: '100%', height: '100%' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-xs md:text-sm truncate max-w-[100px] md:max-w-none group-hover:text-accent-700 transition-colors">{playerName}</div>
                                  <div className="text-[9px] md:text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                                    {row.season} · W{row.week}
                                  </div>
                                </div>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2 md:gap-3">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-ink-50 border border-ink-100 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 text-xs md:text-sm truncate max-w-[100px] md:max-w-none">{playerName || "Unknown"}</div>
                                  <div className="text-[9px] md:text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                                    {row.season} · W{row.week}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 md:py-3 md:px-4 text-xs md:text-sm font-medium text-ink-800 hidden md:table-cell">
                            {(() => {
                              const ownerByTeam = ownersBySeason.get(Number(row.season));
                              const owner = ownerByTeam?.get(row.team);
                              return owner ? (
                                <div className="flex flex-col">
                                  <span className="font-bold">{owner}</span>
                                  <span className="text-[10px] text-ink-400 uppercase tracking-tighter">{row.team}</span>
                                </div>
                              ) : row.team;
                            })()}
                          </td>
                          <td className="py-2 px-3 md:py-3 md:px-4">
                            <div className="flex items-center gap-2 md:gap-3 justify-end md:justify-start">
                              <span className="text-base md:text-lg font-display text-accent-700">{formatPoints(row.points)}</span>
                              {row.started != null && (
                                <Badge
                                  variant={row.started ? "success" : "destructive"}
                                  className="text-[9px] px-1.5 py-0 font-black h-4"
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
              <div className="text-sm text-ink-500 italic pb-4">No weekly performance data available.</div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>

      <DeferredSection
        onVisible={() => setLoadHistory(true)}
        placeholder={<Card className="mb-8 shadow-soft"><CardContent className="pt-6">Loading career leaders…</CardContent></Card>}
      >
        <Card className="mb-8 shadow-soft">
          <CardHeader>
            <CardTitle>Career Fantasy Leaders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search career leaders..." />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink-500 uppercase">Position</span>
                <select
                  value={careerPosition}
                  onChange={(e) => setCareerPosition(e.target.value)}
                  className="rounded-md border border-ink-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
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
              <div className="text-sm text-ink-500">Loading career leaders…</div>
            ) : careerLeaders.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Pos</th>
                      <th>Seasons</th>
                      <th>Games</th>
                      <th>Total Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {careerLeaders.map((row, index) => {
                      const pid = row?.player_id;
                      const player = pid ? playerFromSleeper(pid) : null;
                      const playerName = row ? getPlayerName(row) || player?.full_name : "Unknown";
                      return (
                        <tr key={pid || `career-${index}`} className="hover:bg-ink-50/30 transition-colors">
                          <td className="py-2 px-3 md:py-3 md:px-4">
                            {pid ? (
                              <Link to={`/players/${pid}`} className="flex items-center gap-2 md:gap-3 group">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-ink-100 overflow-hidden bg-white shrink-0 shadow-sm group-hover:border-accent-300 transition-colors">
                                  <img
                                    src={`https://sleepercdn.com/content/nfl/players/${pid}.jpg`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    style={{ width: '100%', height: '100%' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
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
                          <td className="py-2 px-3 md:py-3 md:px-4 font-mono text-xs md:text-sm font-medium text-ink-600">
                            {row.seasons} <span className="text-[9px] md:text-[10px] text-ink-300 uppercase hidden sm:inline">Seasons</span>
                          </td>
                          <td className="py-2 px-3 md:py-3 md:px-4 font-mono text-xs md:text-sm font-medium text-ink-600 text-right md:text-left">
                            {row.games} <span className="text-[9px] md:text-[10px] text-ink-300 uppercase hidden sm:inline">Games</span>
                          </td>
                          <td className="py-2 px-3 md:py-3 md:px-4 font-display text-base md:text-lg text-accent-700 leading-none text-right">
                            {formatPoints(row.points)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-ink-500 italic pb-4">No career leaderboard data available.</div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>

      <DeferredSection
        onVisible={() => setLoadMetrics(true)}
        placeholder={<Card className="mb-8 shadow-soft"><CardContent className="pt-6">Loading advanced metrics…</CardContent></Card>}
      >
        <Card className="mb-8 shadow-soft">
          <CardHeader>
            <CardTitle>Advanced Metrics Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsPending ? (
              <div className="text-sm text-ink-500">Loading advanced metrics…</div>
            ) : !metricsSummary ? (
              <div className="text-sm text-ink-500 italic">
                No advanced metrics available. Run <code>npm run build:data</code> to generate WAR and z-score stats.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="outline" className="bg-ink-50/50">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">Top Weekly WAR</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {metricsSummary.topWeeklyWar?.length ? (
                      <ul className="text-sm space-y-2">
                        {metricsSummary.topWeeklyWar.map((row) => (
                          <li
                            key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}-${row.week}`}
                            className="flex justify-between"
                          >
                            <span className="font-semibold text-ink-900">{getPlayerName(row)}</span>
                            <span className="text-accent-700 font-bold">{formatPoints(row.war_rep)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-ink-400">No weekly WAR data available.</div>
                    )}
                  </CardContent>
                </Card>

                <Card variant="outline" className="bg-ink-50/50">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">Best Weekly Z-Scores</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {metricsSummary.topWeeklyZ?.length ? (
                      <ul className="text-sm space-y-2">
                        {metricsSummary.topWeeklyZ.map((row) => (
                          <li
                            key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}-${row.week}`}
                            className="flex justify-between"
                          >
                            <span className="font-semibold text-ink-900">{getPlayerName(row)}</span>
                            <span className="text-accent-700 font-bold">{safeNumber(row.pos_week_z).toFixed(2)}z</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-ink-400">No weekly z-score data available.</div>
                    )}
                  </CardContent>
                </Card>

                <Card variant="outline" className="bg-ink-50/50">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">Top WAR Seasons</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {metricsSummary.topSeasonWar?.length ? (
                      <ul className="text-sm space-y-2">
                        {metricsSummary.topSeasonWar.map((row) => (
                          <li
                            key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}`}
                            className="flex justify-between"
                          >
                            <span className="font-semibold text-ink-900">{getPlayerName(row)}</span>
                            <span className="text-accent-700 font-bold">{formatPoints(row.war_rep)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-ink-400">No season WAR data available.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </DeferredSection>
      <DeferredSection
        onVisible={() => {
          setLoadHistory(true);
          setLoadBoomBust(true);
        }}
        placeholder={<div className="section-card">Loading stat assistant…</div>}
      >
        <LocalStatAssistant
          allTime={allTime}
          boomBust={boomBust}
          metricsSummary={metricsSummary}
          playerIndex={playerIndex}
          espnNameMap={espnNameMap}
        />
      </DeferredSection>

      <Card className="mb-8 border-none bg-accent-50/30">
        <CardHeader>
          <CardTitle className="text-lg">Data Coverage Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2 list-disc list-inside text-ink-600">
            <li>
              Advanced metrics (z-scores, WAR, efficiency) are displayed when present in the data exports.
            </li>
            <li>Only regular-season weeks 1–18 are included in leaderboards and matchups.</li>
          </ul>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
