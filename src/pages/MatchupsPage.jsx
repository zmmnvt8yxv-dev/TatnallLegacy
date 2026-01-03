import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import Modal from "../components/Modal.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadWeekData } from "../data/loader.js";
import { resolvePlayerDisplay } from "../lib/playerName.js";
import { formatPoints, filterRegularSeasonWeeks, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { positionSort } from "../utils/positions.js";

export default function MatchupsPage() {
  const { manifest, loading, error, playerIndex, teams } = useDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("");
  const [weekData, setWeekData] = useState(null);
  const [activeMatchup, setActiveMatchup] = useState(null);
  const [activePlayer, setActivePlayer] = useState(null);
  const isDev = import.meta.env.DEV;

  const availableWeeks = useMemo(() => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week);
  }, [manifest, season]);

  useEffect(() => {
    if (!seasons.length) return;
    const param = Number(searchParams.get("season"));
    if (Number.isFinite(param) && seasons.includes(param)) {
      if (param !== season) setSeason(param);
    } else if (!season) {
      setSeason(seasons[0]);
    }
  }, [seasons, season, searchParams]);

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
  }, [availableWeeks, week, searchParams]);

  useEffect(() => {
    if (!season) return;
    const next = new URLSearchParams(searchParams);
    const seasonValue = String(season);
    const weekValue = week ? String(week) : "";
    const currentSeason = searchParams.get("season") || "";
    const currentWeek = searchParams.get("week") || "";
    if (currentSeason === seasonValue && currentWeek === weekValue) return;
    next.set("season", seasonValue);
    if (weekValue) next.set("week", weekValue);
    else next.delete("week");
    setSearchParams(next, { replace: true });
  }, [season, week, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    if (!season || !week) return undefined;
    loadWeekData(season, week).then((payload) => {
      if (active) setWeekData(payload);
    });
    return () => {
      active = false;
    };
  }, [season, week]);

  useEffect(() => {
    setActiveMatchup(null);
    setActivePlayer(null);
  }, [season, week]);

  const matchups = weekData?.matchups || [];
  const lineups = weekData?.lineups || [];

  const teamsByRosterId = useMemo(() => {
    const map = new Map();
    for (const team of teams || []) {
      if (season && Number(team?.season) !== Number(season)) continue;
      const key = team?.roster_id ?? team?.team_id;
      if (key == null) continue;
      const name = team?.display_name || team?.team_name || team?.name;
      if (name) map.set(String(key), name);
    }
    return map;
  }, [teams, season]);

  const getLineupTeamKeys = (matchup, side) => {
    const keys = new Set();
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

  const getMatchupLabel = (matchup, side) => {
    const teamValue = side === "home" ? matchup?.home_team : matchup?.away_team;
    const rosterId = side === "home" ? matchup?.home_roster_id : matchup?.away_roster_id;
    const rosterName = rosterId != null ? teamsByRosterId.get(String(rosterId)) : null;
    return rosterName || teamValue || (side === "home" ? "Home" : "Away");
  };

  const buildRoster = (teamKeys) => {
    const rows = lineups.filter((row) => teamKeys.has(String(row.team)));
    const mapped = rows.map((row) => {
      const display = resolvePlayerDisplay(row.player_id, { row, playerIndex });
      return {
        ...row,
        displayName: display.name,
        position: display.position,
        nflTeam: display.team,
      };
    });
    const totals = mapped.reduce(
      (acc, row) => {
        acc.points += safeNumber(row.points);
        acc.starters += row.started ? 1 : 0;
        return acc;
      },
      { points: 0, starters: 0 },
    );
    const positionalTotals = mapped.reduce((acc, row) => {
      const position = row.position || "—";
      acc[position] = (acc[position] || 0) + safeNumber(row.points);
      return acc;
    }, {});
    return { rows: mapped, totals, positionalTotals };
  };

  const activeRoster = useMemo(() => {
    if (!activeMatchup) return null;
    return {
      home: buildRoster(getLineupTeamKeys(activeMatchup, "home")),
      away: buildRoster(getLineupTeamKeys(activeMatchup, "away")),
    };
  }, [activeMatchup, lineups, playerIndex, teamsByRosterId]);

  if (loading) return <LoadingState label="Loading matchups..." />;
  if (error) return <ErrorState message={error} />;

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;

  const diagnostics = useMemo(() => {
    if (!isDev || !weekData) return null;
    let resolvedNames = 0;
    let missingIds = 0;
    const starters = lineups.filter((row) => row.started).length;
    for (const row of lineups) {
      if (!row.player_id && !row.sleeper_id && !row.gsis_id && !row.espn_id) missingIds += 1;
      const display = resolvePlayerDisplay(row.player_id, { row, playerIndex });
      if (display.name && display.name !== "(Unknown Player)") resolvedNames += 1;
    }
    return {
      total: lineups.length,
      starters,
      resolvedNames,
      missingIds,
    };
  }, [isDev, weekData, lineups, playerIndex]);

  return (
    <>
      <section>
        <h1 className="page-title">Matchups</h1>
        <p className="page-subtitle">Filter by season and week, then open a matchup to see roster details.</p>
      </section>

      <section className="section-card filters">
        <div>
          <label>Season</label>
          <select value={season} onChange={(event) => setSeason(Number(event.target.value))}>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Week</label>
          <select value={week} onChange={(event) => setWeek(Number(event.target.value))}>
            {availableWeeks.map((value) => (
              <option key={value} value={value}>
                Week {value}
              </option>
            ))}
          </select>
        </div>
        <div className="tag">Matchups loaded: {matchups.length || 0}</div>
      </section>

      {diagnostics ? (
        <section className="section-card">
          <h2 className="section-title">Diagnostics (DEV)</h2>
          <div className="flex-row">
            <div className="tag">Lineups: {diagnostics.total}</div>
            <div className="tag">Starters loaded: {diagnostics.starters}</div>
            <div className="tag">Resolved names: {diagnostics.resolvedNames}</div>
            <div className="tag">Missing player ids: {diagnostics.missingIds}</div>
          </div>
        </section>
      ) : null}

      {matchups.length ? (
        <section className="matchup-grid">
          {matchups.map((matchup) => {
            const homeWin = matchup.home_score > matchup.away_score;
            const awayWin = matchup.away_score > matchup.home_score;
            const homeLabel = ownerLabel(getMatchupLabel(matchup, "home"), matchup.home_team || "Home");
            const awayLabel = ownerLabel(getMatchupLabel(matchup, "away"), matchup.away_team || "Away");
            return (
              <div key={matchup.matchup_id} className="matchup-card">
                <div className="matchup-row">
                  <strong>{homeLabel}</strong>
                  <span className="pill">{homeWin ? "Winner" : awayWin ? "—" : "Tie"}</span>
                  <span>{formatPoints(matchup.home_score)}</span>
                </div>
                <div className="matchup-row">
                  <strong>{awayLabel}</strong>
                  <span className="pill">{awayWin ? "Winner" : homeWin ? "—" : "Tie"}</span>
                  <span>{formatPoints(matchup.away_score)}</span>
                </div>
                <div className="flex-row">
                  <button type="button" className="tag" onClick={() => setActiveMatchup(matchup)}>
                    Quick view →
                  </button>
                  <Link to={`/matchups/${season}/${week}/${matchup.matchup_id}`} className="tag">
                    Full matchup →
                  </Link>
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <div className="section-card">No matchups available for this week.</div>
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
          <div className="detail-grid">
            {[
              { label: getMatchupLabel(activeMatchup, "home"), roster: activeRoster.home },
              { label: getMatchupLabel(activeMatchup, "away"), roster: activeRoster.away },
            ].map(({ label, roster }) => (
              <div key={label} className="section-card">
                <h3 className="section-title">{ownerLabel(label, label)}</h3>
                <div className="flex-row">
                  <div className="tag">Team total: {formatPoints(roster.totals.points)}</div>
                  <div className="tag">Starters tracked: {roster.totals.starters}</div>
                </div>
                <div className="flex-row">
                  {Object.entries(roster.positionalTotals)
                    .sort(([a], [b]) => positionSort(a, b))
                    .map(([position, total]) => (
                      <div key={position} className="tag">
                        {position}: {formatPoints(total)}
                      </div>
                    ))}
                </div>
                {roster.rows.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Pos</th>
                        <th>Starter</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.rows.map((row, idx) => (
                        <tr key={`${row.player_id || row.player}-${idx}`}>
                          <td>
                            {row.player_id ? (
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => setActivePlayer(row.player_id)}
                              >
                                {row.displayName}
                              </button>
                            ) : (
                              row.displayName
                            )}
                          </td>
                          <td>{row.position}</td>
                          <td>{row.started ? "Yes" : "No"}</td>
                          <td>{formatPoints(row.points)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div>No roster data available for this team.</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>No matchup details available.</div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(activePlayer)}
        title="Player Profile"
        onClose={() => setActivePlayer(null)}
      >
        {activePlayer ? (
          (() => {
            const display = resolvePlayerDisplay(activePlayer, { row: { player_id: activePlayer }, playerIndex });
            return (
              <div className="section-card">
                <h3 className="section-title">{display.name}</h3>
                <div className="flex-row">
                  <div className="tag">Position: {display.position}</div>
                  <div className="tag">NFL Team: {display.team}</div>
                </div>
                <p>Open the full player profile for weekly WAR, z-scores, and career summaries.</p>
                <Link to={`/players/${activePlayer}`} className="tag" onClick={() => setActivePlayer(null)}>
                  View full profile →
                </Link>
              </div>
            );
          })()
        ) : (
          <div>No player selected.</div>
        )}
      </Modal>
    </>
  );
}
