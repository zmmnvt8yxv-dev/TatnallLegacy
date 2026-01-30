import React, { useEffect, useMemo, useRef, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import Modal from "../components/Modal.jsx";
import { useDataContext } from "../data/DataContext";
import { useMatchups } from "../hooks/useMatchups";
import SearchBar from "../components/SearchBar.jsx";
import { getCanonicalPlayerId, resolvePlayerDisplay } from "../lib/playerName";
import { buildNameIndex, normalizeName } from "../lib/nameUtils";
import { formatPoints, filterRegularSeasonWeeks, safeNumber } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { positionSort } from "../utils/positions";
import { readStorage, writeStorage } from "../utils/persistence";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Target, Calendar, Users, Trophy, ChevronRight, Zap, Crown, Swords, Eye, ExternalLink } from "lucide-react";
import type { Manifest, LineupEntry, Matchup, Team, PlayerIndex, EspnNameMap, PlayerSearchEntry } from "../types/index";

interface MatchupWithId extends Matchup {
  matchup_id: string | number;
  home_roster_id?: string | number;
  away_roster_id?: string | number;
  entries?: Array<{
    roster_id?: string | number;
    display_name?: string;
    team_name?: string;
    username?: string;
  }>;
}

interface LineupRow extends LineupEntry {
  player?: string;
  display_name?: string;
  player_name?: string;
  espn_id?: string;
  source_player_id?: string;
  slot?: string;
  lineup_position?: string;
  lineupSlot?: string;
  pos?: string;
}

interface EnrichedRow extends LineupRow {
  originalIndex: number;
  displayName: string;
  position: string;
  nflTeam: string;
  canonicalPlayerId: string;
  linkName: string;
  canLink: boolean;
}

interface RosterData {
  rows: EnrichedRow[];
  totals: { points: number; starters: number };
  positionalTotals: Record<string, number>;
}

interface WeekData {
  matchups?: MatchupWithId[];
  lineups?: LineupRow[];
}

interface StoredPrefs {
  season?: number;
  week?: number;
}

export default function MatchupsPage(): React.ReactElement {
  const { manifest, loading, error, playerIndex, teams, espnNameMap, playerSearch } = useDataContext() as {
    manifest: Manifest | undefined;
    loading: boolean;
    error: string | null;
    playerIndex: PlayerIndex;
    teams: Team[];
    espnNameMap: EspnNameMap;
    playerSearch: PlayerSearchEntry[];
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef<boolean>(false);
  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const [season, setSeason] = useState<number | string>(seasons[0] || "");
  const [week, setWeek] = useState<number | string>("");
  const [activeMatchup, setActiveMatchup] = useState<MatchupWithId | null>(null);
  const [teamQuery, setTeamQuery] = useState<string>("");
  const MATCHUPS_PREF_KEY = "tatnall-pref-matchups";
  const isDev = import.meta.env.DEV;

  const availableWeeks = useMemo((): number[] => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week as number);
  }, [manifest, season]);

  useEffect(() => {
    if (!seasons.length || !manifest) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const stored = readStorage<StoredPrefs>(MATCHUPS_PREF_KEY, {});
    const storedSeason = Number(stored?.season);
    const storedWeek = Number(stored?.week);
    const paramSeason = Number(searchParams.get("season"));
    let nextSeason = Number.isFinite(paramSeason) && seasons.includes(paramSeason) ? paramSeason : seasons[0];
    if (!searchParams.get("season") && Number.isFinite(storedSeason) && seasons.includes(storedSeason)) {
      nextSeason = storedSeason;
    }
    const weeksForSeason = manifest?.weeksBySeason?.[String(nextSeason)] || [];
    const regularWeeks = filterRegularSeasonWeeks(weeksForSeason.map((value) => ({ week: value }))).map(
      (row) => row.week as number,
    );
    const paramWeek = Number(searchParams.get("week"));
    let nextWeek: number | string =
      Number.isFinite(paramWeek) && regularWeeks.includes(paramWeek) ? paramWeek : regularWeeks[0] || "";
    if (!searchParams.get("week") && Number.isFinite(storedWeek) && regularWeeks.includes(storedWeek)) {
      nextWeek = storedWeek;
    }
    setSeason(nextSeason);
    if (nextWeek) setWeek(nextWeek);
    let changed = false;
    if (!searchParams.get("season") && nextSeason) {
      params.set("season", String(nextSeason));
      changed = true;
    }
    if (!searchParams.get("week") && nextWeek) {
      params.set("week", String(nextWeek));
      changed = true;
    }
    if (changed) setSearchParams(params, { replace: true });
    writeStorage(MATCHUPS_PREF_KEY, { season: nextSeason, week: nextWeek });
    didInitRef.current = true;
  }, [seasons, manifest, searchParams, setSearchParams]);

  useEffect(() => {
    if (!availableWeeks.length) return;
    const param = Number(searchParams.get("week"));
    if (Number.isFinite(param) && availableWeeks.includes(param)) {
      if (param !== Number(week)) setWeek(param);
      return;
    }
    if (!week || !availableWeeks.includes(Number(week))) {
      setWeek(availableWeeks[0]);
    }
  }, [availableWeeks, week, searchParamsString]);

  const updateSearchParams = (nextSeason: number | string, nextWeek: number | string): void => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    if (nextWeek) params.set("week", String(nextWeek));
    else params.delete("week");
    setSearchParams(params, { replace: true });
    writeStorage(MATCHUPS_PREF_KEY, { season: nextSeason, week: nextWeek });
  };

  const handleSeasonChange = (value: string): void => {
    const nextSeason = Number(value);
    setSeason(nextSeason);
    const weeksForSeason = manifest?.weeksBySeason?.[String(nextSeason)] || [];
    const regularWeeks = filterRegularSeasonWeeks(weeksForSeason.map((w) => ({ week: w }))).map((row) => row.week as number);
    const nextWeek = regularWeeks.includes(Number(week)) ? Number(week) : regularWeeks[0] || "";
    setWeek(nextWeek);
    updateSearchParams(nextSeason, nextWeek);
  };

  const handleWeekChange = (value: string): void => {
    const nextWeek = Number(value);
    setWeek(nextWeek);
    updateSearchParams(season, nextWeek);
  };

  const {
    weekData,
    fullStatsRows,
    isLoading: dataLoading,
    isError: dataError,
    error: fetchError
  } = useMatchups(season, week) as {
    weekData: WeekData | undefined;
    fullStatsRows: unknown[];
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };

  useEffect(() => {
    setActiveMatchup(null);
  }, [season, week]);

  const matchups = (weekData?.matchups || []) as MatchupWithId[];
  const lineups = (weekData?.lineups || []) as LineupRow[];
  const fullStatsIndex = useMemo(() => buildNameIndex(fullStatsRows), [fullStatsRows]);
  const searchIndex = useMemo(() => buildNameIndex(playerSearch), [playerSearch]);

  const teamsByRosterId = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const team of teams || []) {
      if (season && Number(team?.season) !== Number(season)) continue;
      const key = team?.roster_id ?? team?.team_id;
      if (key == null) continue;
      const name = team?.display_name || (team as { team_name?: string }).team_name || (team as { name?: string }).name;
      if (name) map.set(String(key), name);
    }
    return map;
  }, [teams, season]);

  const getLineupTeamKeys = (matchup: MatchupWithId, side: "home" | "away"): Set<string> => {
    const keys = new Set<string>();
    const teamValue = side === "home" ? matchup?.home_team : matchup?.away_team;
    const rosterId = side === "home" ? matchup?.home_roster_id : matchup?.away_roster_id;
    if (teamValue) keys.add(String(teamValue));
    if (rosterId != null) {
      const rosterName = teamsByRosterId.get(String(rosterId));
      if (rosterName) keys.add(String(rosterName));
    }
    for (const entry of matchup?.entries || []) {
      const matchesRoster = rosterId != null && String(entry?.roster_id) === String(rosterId);
      if (matchesRoster || rosterId == null) {
        for (const value of [entry?.display_name, entry?.team_name, entry?.username]) {
          if (value) keys.add(String(value));
        }
      }
    }
    return keys;
  };

  const getMatchupLabel = (matchup: MatchupWithId, side: "home" | "away"): string => {
    const teamValue = side === "home" ? matchup?.home_team : matchup?.away_team;
    const rosterId = side === "home" ? matchup?.home_roster_id : matchup?.away_roster_id;
    const rosterName = rosterId != null ? teamsByRosterId.get(String(rosterId)) : null;
    return rosterName || teamValue || (side === "home" ? "Home" : "Away");
  };

  const buildRoster = (teamKeys: Set<string>): RosterData => {
    const rows = lineups.filter((row) => teamKeys.has(String(row.team)));
    const mapped: EnrichedRow[] = rows.map((row, originalIndex) => {
      const rawName = row.player || row.display_name || row.player_name;
      const espnLookupId = row.espn_id || row.player_id || row.source_player_id;
      const resolvedName =
        /^ESPN Player \d+$/i.test(String(rawName || "").trim()) && espnLookupId != null
          ? espnNameMap?.[String(espnLookupId)] || rawName
          : rawName;
      const nameKey = normalizeName(resolvedName);
      const lookup = nameKey ? fullStatsIndex.get(nameKey) || searchIndex.get(nameKey) : null;
      const merged = lookup
        ? {
          ...row,
          display_name: lookup.name || row.player,
          position: lookup.position || row.position || row.pos,
          nfl_team: lookup.team || row.nfl_team,
          sleeper_id: lookup.sleeper_id || row.sleeper_id,
          gsis_id: lookup.gsis_id || row.gsis_id,
          player_id: lookup.player_id || row.player_id,
        }
        : row;
      const display = resolvePlayerDisplay(merged.player_id, { row: merged, playerIndex, espnNameMap });
      const canonicalId = getCanonicalPlayerId(merged.player_id || merged.gsis_id || merged.sleeper_id, {
        row: merged,
        playerIndex,
      });
      const canLink = Boolean(canonicalId);
      return {
        ...merged,
        originalIndex,
        displayName: display.name,
        position: display.position || merged.position || "—",
        nflTeam: display.team || merged.nfl_team || "—",
        canonicalPlayerId: canonicalId || "",
        linkName: display.name || merged.display_name || row.player || "",
        canLink,
      } as EnrichedRow;
    });
    const sortedRows = Number(season) === 2025
      ? mapped
      : [...mapped].sort((a, b) => {
        const aStarter = a.started ? 0 : 1;
        const bStarter = b.started ? 0 : 1;
        if (aStarter !== bStarter) return aStarter - bStarter;

        const slotA = String(a.slot || a.lineup_position || a.lineupSlot || "").toUpperCase();
        const slotB = String(b.slot || b.lineup_position || b.lineupSlot || "").toUpperCase();
        const posA = String(a.position || "").toUpperCase();
        const posB = String(b.position || "").toUpperCase();

        const isFlexA = slotA.includes("FLEX") || slotA.includes("W/R") || slotA.includes("WR/RB") || slotA.includes("RB/WR") || slotA.includes("W/R/T");
        const isFlexB = slotB.includes("FLEX") || slotB.includes("W/R") || slotB.includes("WR/RB") || slotB.includes("RB/WR") || slotB.includes("W/R/T");

        const rank = (pos: string, isFlex: boolean): number => {
          if (isFlex) return 4;
          if (pos === "QB") return 0;
          if (pos === "RB") return 1;
          if (pos === "WR") return 2;
          if (pos === "TE") return 3;
          if (pos === "FLEX") return 4;
          if (pos === "DEF" || pos === "DST" || pos === "D/ST") return 5;
          if (pos === "K") return 6;
          return 7;
        };

        const rA = rank(posA, isFlexA);
        const rB = rank(posB, isFlexB);
        if (rA !== rB) return rA - rB;

        const pA = safeNumber(a.points, 0);
        const pB = safeNumber(b.points, 0);
        if (pA !== pB) return pB - pA;

        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      });
    const totals = sortedRows.reduce(
      (acc, row) => {
        acc.points += safeNumber(row.points, 0);
        acc.starters += row.started ? 1 : 0;
        return acc;
      },
      { points: 0, starters: 0 },
    );
    const positionalTotals = sortedRows.reduce<Record<string, number>>((acc, row) => {
      const position = row.position || "—";
      acc[position] = (acc[position] || 0) + safeNumber(row.points, 0);
      return acc;
    }, {});
    return { rows: sortedRows, totals, positionalTotals };
  };

  const buildPlayerLink = (row: EnrichedRow): string => {
    const name = row.linkName || row.displayName;
    if (name) return `/players/${row.canonicalPlayerId}?name=${encodeURIComponent(name)}`;
    return `/players/${row.canonicalPlayerId}`;
  };

  const activeRoster = useMemo((): { home: RosterData; away: RosterData } | null => {
    if (!activeMatchup) return null;
    return {
      home: buildRoster(getLineupTeamKeys(activeMatchup, "home")),
      away: buildRoster(getLineupTeamKeys(activeMatchup, "away")),
    };
  }, [activeMatchup, lineups, playerIndex, teamsByRosterId, fullStatsIndex, searchIndex, espnNameMap]);

  const ownerLabel = (value: unknown, fallback: string = "—"): string => normalizeOwnerName(value) || fallback;
  const query = teamQuery.trim().toLowerCase();

  const filteredMatchups = useMemo((): MatchupWithId[] => {
    return matchups.map((matchup, index) => ({
      ...matchup,
      matchup_id: matchup.matchup_id ?? (matchup as { id?: string | number }).id ?? `m-${index}`,
    })).filter((matchup) => {
      const homeLabel = ownerLabel(getMatchupLabel(matchup, "home"), matchup.home_team || "Home");
      const awayLabel = ownerLabel(getMatchupLabel(matchup, "away"), matchup.away_team || "Away");
      return homeLabel.toLowerCase().includes(query) || awayLabel.toLowerCase().includes(query);
    });
  }, [matchups, query]);

  const diagnostics = useMemo(() => {
    if (!isDev || !weekData) return null;
    let resolvedNames = 0;
    let missingIds = 0;
    const starters = lineups.filter((row) => row.started).length;
    for (const row of lineups) {
      if (!row.player_id && !row.sleeper_id && !row.gsis_id && !row.espn_id) missingIds += 1;
      const display = resolvePlayerDisplay(row.player_id, { playerIndex, espnNameMap });
      if (display.name && display.name !== "(Unknown Player)") resolvedNames += 1;
    }
    return {
      total: lineups.length,
      starters,
      resolvedNames,
      missingIds,
    };
  }, [isDev, weekData, lineups, playerIndex, espnNameMap]);

  if (loading || dataLoading) return <LoadingState label="Loading matchups..." />;
  if (error || dataError) return <ErrorState message={error || fetchError?.message || "Error loading data"} />;

  return (
    <PageTransition>
      {/* Hero Section */}
      <div className="relative w-full bg-[var(--bg-card)] text-[var(--text-primary)] overflow-hidden rounded-3xl mb-10 p-8 md:p-12 isolate shadow-2xl border border-[var(--accent)]/20">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-primary)] via-[var(--bg-card)] to-[var(--bg-primary)] -z-10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--accent)]/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/15 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 -z-10" />

        <div className="absolute inset-0 opacity-[0.03] -z-10" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-2xl shadow-lg shadow-[var(--accent)]/30">
              <Swords className="text-white drop-shadow-md" size={32} />
            </div>
            <Badge variant="outline" className="bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30 px-4 py-1.5 text-sm font-bold">
              <Calendar size={14} className="mr-2" />
              Season {season} · Week {week}
            </Badge>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-black tracking-tighter leading-none bg-gradient-to-r from-[var(--text-primary)] via-[var(--text-primary)] to-[var(--accent)] bg-clip-text text-transparent drop-shadow-lg mb-4">
            Matchups
            <span className="text-[var(--accent)] text-6xl lg:text-7xl leading-none drop-shadow-[0_0_20px_rgba(31,147,134,0.5)]">.</span>
          </h1>
          <p className="text-lg md:text-xl text-[var(--text-muted)] max-w-3xl leading-relaxed">
            Filter by season and week, then open a matchup to see roster details.
          </p>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-lg border border-[var(--border)] p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[var(--accent)]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10 flex flex-wrap gap-6 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em] flex items-center gap-2">
              <Calendar size={14} className="text-[var(--accent)]" />
              Season
            </label>
            <select
              value={season}
              onChange={(event) => handleSeasonChange(event.target.value)}
              className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] hover:border-[var(--accent)]/50 transition-all min-w-[140px]"
            >
              {seasons.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em] flex items-center gap-2">
              <Target size={14} className="text-[var(--accent)]" />
              Week
            </label>
            <select
              value={week}
              onChange={(event) => handleWeekChange(event.target.value)}
              className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] px-5 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] hover:border-[var(--accent)]/50 transition-all min-w-[140px]"
            >
              {availableWeeks.map((value) => (
                <option key={value} value={value}>
                  Week {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em] flex items-center gap-2">
              <Users size={14} className="text-[var(--accent)]" />
              Filter Team
            </label>
            <SearchBar value={teamQuery} onChange={setTeamQuery} placeholder="Filter by team..." />
          </div>
          <Badge variant="outline" className="h-12 px-5 border-2 border-[var(--border)] text-lg font-bold flex items-center gap-2">
            <Zap size={18} className="text-[var(--accent)]" />
            {matchups.length || 0} Matchups
          </Badge>
        </div>
      </div>

      {diagnostics ? (
        <Card className="mb-6 bg-gradient-to-r from-blue-500/10 to-[var(--bg-card)] border-blue-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-500">Diagnostics (DEV)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-row gap-3 flex-wrap">
            <Badge variant="outline" className="bg-[var(--bg-card)]">Lineups: {diagnostics.total}</Badge>
            <Badge variant="outline" className="bg-[var(--bg-card)]">Starters: {diagnostics.starters}</Badge>
            <Badge variant="outline" className="bg-[var(--bg-card)]">Resolved: {diagnostics.resolvedNames}</Badge>
            <Badge variant="outline" className="bg-[var(--bg-card)]">Missing IDs: {diagnostics.missingIds}</Badge>
          </CardContent>
        </Card>
      ) : null}

      {filteredMatchups.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMatchups.map((matchup) => {
            const homeWin = matchup.home_score > matchup.away_score;
            const awayWin = matchup.away_score > matchup.home_score;
            const homeLabel = ownerLabel(getMatchupLabel(matchup, "home"), matchup.home_team || "Home");
            const awayLabel = ownerLabel(getMatchupLabel(matchup, "away"), matchup.away_team || "Away");
            return (
              <div
                key={matchup.matchup_id}
                className="group relative bg-[var(--bg-card)] rounded-2xl shadow-lg border-2 border-[var(--border)] hover:border-[var(--accent)] hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                {/* Decorative elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-[var(--accent)]/10 transition-colors" />

                {/* Winner banner */}
                {(homeWin || awayWin) && (
                  <div className="absolute top-4 right-4 z-10">
                    <div className={`p-2 rounded-full ${homeWin ? 'bg-gradient-to-br from-[var(--success)] to-emerald-600' : 'bg-gradient-to-br from-[var(--success)] to-emerald-600'} shadow-lg`}>
                      <Trophy size={16} className="text-white" />
                    </div>
                  </div>
                )}

                <div className="p-6 relative z-10">
                  {/* Home Team */}
                  <div className={`flex items-center justify-between p-4 rounded-xl mb-3 transition-all ${homeWin ? 'bg-[var(--success-light)] border border-[var(--success)]/30' : 'bg-[var(--bg-card-hover)]'}`}>
                    <div className="flex items-center gap-3">
                      {homeWin && <Crown size={18} className="text-[var(--success)]" />}
                      <span className="font-display font-black text-lg text-[var(--text-primary)]">{homeLabel}</span>
                    </div>
                    <span className={`text-3xl font-display font-black ${homeWin ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>
                      {formatPoints(matchup.home_score)}
                    </span>
                  </div>

                  {/* VS Divider */}
                  <div className="flex items-center justify-center gap-4 py-2">
                    <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent to-[var(--border)]" />
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">vs</span>
                    <div className="flex-1 h-[2px] bg-gradient-to-l from-transparent to-[var(--border)]" />
                  </div>

                  {/* Away Team */}
                  <div className={`flex items-center justify-between p-4 rounded-xl mt-3 transition-all ${awayWin ? 'bg-[var(--success-light)] border border-[var(--success)]/30' : 'bg-[var(--bg-card-hover)]'}`}>
                    <div className="flex items-center gap-3">
                      {awayWin && <Crown size={18} className="text-[var(--success)]" />}
                      <span className="font-display font-black text-lg text-[var(--text-primary)]">{awayLabel}</span>
                    </div>
                    <span className={`text-3xl font-display font-black ${awayWin ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>
                      {formatPoints(matchup.away_score)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 mt-6">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl border-2 hover:bg-[var(--accent-light)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all group/btn"
                      onClick={() => setActiveMatchup(matchup)}
                    >
                      <Eye size={16} className="mr-2 group-hover/btn:scale-110 transition-transform" />
                      Quick View
                    </Button>
                    <Button asChild variant="outline" className="flex-1 rounded-xl border-2 hover:bg-[var(--accent-light)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all group/btn">
                      <Link to={`/matchups/${season}/${week}/${matchup.matchup_id}`}>
                        <ExternalLink size={16} className="mr-2 group-hover/btn:scale-110 transition-transform" />
                        Full View
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="shadow-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-card-hover)]">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
              <Swords size={32} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-lg text-[var(--text-muted)] font-medium">No matchups available for this week.</p>
          </CardContent>
        </Card>
      )}

      <Modal
        isOpen={Boolean(activeMatchup)}
        title={
          activeMatchup
            ? `Week ${week} · ${ownerLabel(
              getMatchupLabel(activeMatchup, "home"),
              activeMatchup.home_team,
            )} vs ${ownerLabel(getMatchupLabel(activeMatchup, "away"), activeMatchup.away_team)}`
            : "Matchup"
        }
        onClose={() => setActiveMatchup(null)}
      >
        {activeMatchup && activeRoster ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { label: getMatchupLabel(activeMatchup, "home"), roster: activeRoster.home, score: activeMatchup.home_score, isWinner: activeMatchup.home_score > activeMatchup.away_score },
              { label: getMatchupLabel(activeMatchup, "away"), roster: activeRoster.away, score: activeMatchup.away_score, isWinner: activeMatchup.away_score > activeMatchup.home_score },
            ].map(({ label, roster, score, isWinner }) => (
              <Card key={label} className={`shadow-lg overflow-hidden ${isWinner ? 'border-2 border-[var(--success)]/50' : 'border border-[var(--border)]'}`}>
                <CardHeader className={`${isWinner ? 'bg-gradient-to-r from-[var(--success)] to-emerald-600 text-white' : 'bg-gradient-to-r from-[var(--bg-primary)] to-[var(--bg-card)] text-[var(--text-primary)]'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isWinner && <Trophy size={20} className="text-emerald-200" />}
                      <CardTitle className="font-display font-black">{ownerLabel(label, label)}</CardTitle>
                    </div>
                    <span className="text-3xl font-display font-black">{formatPoints(score)}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="outline" className="bg-[var(--bg-card)]">Team: {formatPoints(roster.totals.points)}</Badge>
                    <Badge variant="outline" className="bg-[var(--bg-card)]">Starters: {roster.totals.starters}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(roster.positionalTotals)
                      .sort(([a], [b]) => positionSort(a, b))
                      .map(([position, total]) => (
                        <Badge key={position} variant="secondary" className="text-xs">
                          {position}: {formatPoints(total)}
                        </Badge>
                      ))}
                  </div>
                  {roster.rows.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[var(--bg-card-hover)]">
                            <th className="py-2 px-3 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Player</th>
                            <th className="py-2 px-3 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Pos</th>
                            <th className="py-2 px-3 text-center text-[10px] font-bold uppercase text-[var(--text-muted)]">Start</th>
                            <th className="py-2 px-3 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {(() => {
                            const starters = roster.rows.filter((r) => r.started);
                            const bench = roster.rows.filter((r) => !r.started);
                            const startersTotal = starters.reduce((acc, r) => acc + safeNumber(r.points, 0), 0);
                            const benchTotal = bench.reduce((acc, r) => acc + safeNumber(r.points, 0), 0);

                            return (
                              <>
                                {starters.map((row, idx) => (
                                  <tr key={`${row.player_id || row.player}-starter-${idx}`} className="hover:bg-[var(--accent-light)]">
                                    <td className="py-2 px-3">
                                      {row.canLink ? (
                                        <Link className="text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium hover:underline" to={buildPlayerLink(row)}>
                                          {row.displayName}
                                        </Link>
                                      ) : (
                                        <span className="font-medium text-[var(--text-primary)]">{row.displayName}</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3">
                                      <Badge variant="secondary" className="text-[10px]">{row.position}</Badge>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <Badge variant="success" className="text-[10px]">Yes</Badge>
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-[var(--accent)]">{formatPoints(row.points)}</td>
                                  </tr>
                                ))}

                                {starters.length ? (
                                  <tr className="bg-[var(--success-light)] border-y-2 border-[var(--success)]/30">
                                    <td colSpan={3} className="py-2 px-3">
                                      <strong className="text-[var(--success)]">Starters Total</strong>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <strong className="font-mono text-[var(--success)]">{formatPoints(startersTotal)}</strong>
                                    </td>
                                  </tr>
                                ) : null}

                                {bench.map((row, idx) => (
                                  <tr key={`${row.player_id || row.player}-bench-${idx}`} className="hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)]">
                                    <td className="py-2 px-3">
                                      {row.canLink ? (
                                        <Link className="text-[var(--text-secondary)] hover:text-[var(--accent)] font-medium hover:underline" to={buildPlayerLink(row)}>
                                          {row.displayName}
                                        </Link>
                                      ) : (
                                        <span className="font-medium">{row.displayName}</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3">
                                      <Badge variant="secondary" className="text-[10px]">{row.position}</Badge>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <span className="text-xs text-[var(--text-muted)]">—</span>
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono">{formatPoints(row.points)}</td>
                                  </tr>
                                ))}

                                {bench.length ? (
                                  <tr className="bg-[var(--bg-card-hover)]">
                                    <td colSpan={3} className="py-2 px-3">
                                      <strong className="text-[var(--text-secondary)]">Bench Total</strong>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <strong className="font-mono text-[var(--text-secondary)]">{formatPoints(benchTotal)}</strong>
                                    </td>
                                  </tr>
                                ) : null}
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[var(--text-muted)]">No roster data available for this team.</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text-muted)]">No matchup details available.</div>
        )}
      </Modal>

    </PageTransition>
  );
}
