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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Heart } from "lucide-react";
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

  if (loading || dataLoading) return <LoadingState label="Loading standings..." />;
  if (error || dataError) return <ErrorState message={error || fetchError?.message || "Error loading standings"} />;

  return (
    <PageTransition>
      <section>
        <h1 className="page-title">Standings</h1>
        <p className="page-subtitle">Season standings plus all-time franchise performance.</p>
      </section>

      <section className="section-card filters filters--sticky">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider ml-1">Season</label>
              <select
                value={season}
                onChange={(event) => handleSeasonChange(event.target.value)}
                className="rounded-md border border-ink-200 bg-card px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-500 min-w-[120px]"
              >
                {seasons.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider ml-1">Filter Team</label>
              <SearchBar value={teamQuery} onChange={setTeamQuery} placeholder="Filter by team..." />
            </div>
          </div>
          <Badge variant="outline" className="h-8 px-3 border-ink-200">
            {standings.length || 0} Teams
          </Badge>
        </div>
      </section>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Season Standings</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStandings.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W</th>
                    <th>L</th>
                    <th>T</th>
                    <th>PF</th>
                    <th>PA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStandings.map((row) => (
                    <tr key={row.team} className="hover:bg-ink-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 rounded-full ${favorites.teams.includes(ownerLabel(seasonOwners.get(row.team) || row.team, row.team)) ? "text-red-500 fill-red-500" : "text-ink-300"}`}
                            onClick={() => toggleTeam(ownerLabel(seasonOwners.get(row.team) || row.team, row.team))}
                          >
                            <Heart size={16} className={favorites.teams.includes(ownerLabel(seasonOwners.get(row.team) || row.team, row.team)) ? "fill-current" : ""} />
                          </Button>
                          <span className="font-bold text-ink-900">{ownerLabel(seasonOwners.get(row.team) || row.team, row.team)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">{row.wins}</td>
                      <td className="py-3 px-4 text-center font-mono">{row.losses}</td>
                      <td className="py-3 px-4 text-center font-mono">{row.ties}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-accent-700">{formatPoints(row.points_for)}</td>
                      <td className="py-3 px-4 text-right font-mono text-ink-400">{formatPoints(row.points_against)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No standings data available for this season.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All-Time Franchise Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAllTime.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W</th>
                    <th>L</th>
                    <th>T</th>
                    <th>PF</th>
                    <th>PA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllTime.map((row) => (
                    <tr key={row.team} className="hover:bg-ink-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 rounded-full ${favorites.teams.includes(ownerLabel(row.team, row.team)) ? "text-red-500 fill-red-500" : "text-ink-300"}`}
                            onClick={() => toggleTeam(ownerLabel(row.team, row.team))}
                          >
                            <Heart size={16} className={favorites.teams.includes(ownerLabel(row.team, row.team)) ? "fill-current" : ""} />
                          </Button>
                          <span className="font-bold text-ink-900">{ownerLabel(row.team, row.team)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">{row.wins}</td>
                      <td className="py-3 px-4 text-center font-mono">{row.losses}</td>
                      <td className="py-3 px-4 text-center font-mono">{row.ties}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-accent-700">{formatPoints(row.points_for)}</td>
                      <td className="py-3 px-4 text-right font-mono text-ink-400">{formatPoints(row.points_against)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>No historical standings data available.</div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
