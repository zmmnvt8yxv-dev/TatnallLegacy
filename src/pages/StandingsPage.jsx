import React, { useEffect, useMemo, useRef, useState } from "react";
import PageTransition from "../components/PageTransition.jsx";
import { useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { useStandings } from "../hooks/useStandings.js";
import { formatPoints } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { useFavorites } from "../utils/useFavorites.js";
import { readStorage, writeStorage } from "../utils/persistence.js";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";

export default function StandingsPage() {
  const { manifest, loading, error } = useDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef(false);
  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const [season, setSeason] = useState(seasons[0] || "");
  const [teamQuery, setTeamQuery] = useState("");
  const { favorites, toggleTeam } = useFavorites();
  const STANDINGS_PREF_KEY = "tatnall-pref-standings";

  const {
    seasonSummary,
    allSummaries,
    isLoading: dataLoading,
    isError: dataError,
    error: fetchError
  } = useStandings(season, seasons);

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
    const stored = readStorage(STANDINGS_PREF_KEY, {});
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

  const handleSeasonChange = (value) => {
    const nextSeason = Number(value);
    setSeason(nextSeason);
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    setSearchParams(params, { replace: true });
    writeStorage(STANDINGS_PREF_KEY, { season: nextSeason });
  };


  const seasonOwners = useMemo(() => {
    const mapping = new Map();
    for (const team of seasonSummary?.teams || []) {
      const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
      if (ownerName) {
        mapping.set(team.team_name, ownerName);
      }
    }
    return mapping;
  }, [seasonSummary]);

  const allTime = useMemo(() => {
    const totals = new Map();
    for (const summary of allSummaries) {
      const ownerByTeam = new Map();
      for (const team of summary?.teams || []) {
        const ownerName = normalizeOwnerName(team.owner || team.display_name || team.username || team.team_name);
        if (ownerName) {
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
  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;
  const query = teamQuery.trim().toLowerCase();
  const filteredStandings = useMemo(() => {
    if (!query) return standings;
    return standings.filter((row) =>
      ownerLabel(seasonOwners.get(row.team) || row.team, row.team).toLowerCase().includes(query),
    );
  }, [standings, ownerLabel, query, seasonOwners]);

  const filteredAllTime = useMemo(() => {
    if (!query) return allTime;
    return allTime.filter((row) => ownerLabel(row.team, row.team).toLowerCase().includes(query));
  }, [allTime, ownerLabel, query]);

  if (loading || dataLoading) return <LoadingState label="Loading standings..." />;
  if (error || dataError) return <ErrorState message={error || fetchError?.message || "Error loading standings"} />;

  return (
    <PageTransition>
      <section>
        <h1 className="page-title">Standings</h1>
        <p className="page-subtitle">Season standings plus all-time franchise performance.</p>
      </section>

      <section className="section-card filters filters--sticky">
        <div>
          <label>Season</label>
          <select value={season} onChange={(event) => handleSeasonChange(event.target.value)}>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Team</label>
          <SearchBar value={teamQuery} onChange={setTeamQuery} placeholder="Filter by team..." />
        </div>
        <div className="tag">Teams: {standings.length || 0}</div>
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
                    <tr key={row.team}>
                      <td>
                        <div className="flex-row items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`favorite-button ${favorites.teams.includes(ownerLabel(seasonOwners.get(row.team) || row.team, row.team)) ? "active" : ""}`}
                            onClick={() => toggleTeam(ownerLabel(seasonOwners.get(row.team) || row.team, row.team))}
                          >
                            Fav
                          </Button>
                          <span>{ownerLabel(seasonOwners.get(row.team) || row.team, row.team)}</span>
                        </div>
                      </td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.ties}</td>
                      <td>{formatPoints(row.points_for)}</td>
                      <td>{formatPoints(row.points_against)}</td>
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
                    <tr key={row.team}>
                      <td>
                        <div className="flex-row items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`favorite-button ${favorites.teams.includes(ownerLabel(row.team, row.team)) ? "active" : ""}`}
                            onClick={() => toggleTeam(ownerLabel(row.team, row.team))}
                          >
                            Fav
                          </Button>
                          <span>{ownerLabel(row.team, row.team)}</span>
                        </div>
                      </td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.ties}</td>
                      <td>{formatPoints(row.points_for)}</td>
                      <td>{formatPoints(row.points_against)}</td>
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
