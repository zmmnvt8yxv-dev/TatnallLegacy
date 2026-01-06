import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import Modal from "../components/Modal.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadPlayerStatsFull, loadWeekData } from "../data/loader.js";
import SearchBar from "../components/SearchBar.jsx";
import { getCanonicalPlayerId, resolvePlayerDisplay } from "../lib/playerName.js";
import { buildNameIndex, normalizeName } from "../lib/nameUtils.js";
import { formatPoints, filterRegularSeasonWeeks, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { positionSort } from "../utils/positions.js";
import { readStorage, writeStorage } from "../utils/persistence.js";

export default function MatchupsPage() {
  const { manifest, loading, error, playerIndex, teams, espnNameMap, playerSearch } = useDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const didInitRef = useRef(false);
  const seasons = useMemo(() => (manifest?.seasons || []).slice().sort((a, b) => b - a), [manifest]);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("");
  const [weekData, setWeekData] = useState(null);
  const [fullStatsRows, setFullStatsRows] = useState([]);
  const [activeMatchup, setActiveMatchup] = useState(null);
  const [teamQuery, setTeamQuery] = useState("");
  const MATCHUPS_PREF_KEY = "tatnall-pref-matchups";
  const isDev = import.meta.env.DEV;

  const availableWeeks = useMemo(() => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week);
  }, [manifest, season]);

  useEffect(() => {
    if (!seasons.length || !manifest) return;
    if (didInitRef.current) return;
    const params = new URLSearchParams(searchParams);
    const stored = readStorage(MATCHUPS_PREF_KEY, {});
    const storedSeason = Number(stored?.season);
    const storedWeek = Number(stored?.week);
    const paramSeason = Number(searchParams.get("season"));
    let nextSeason = Number.isFinite(paramSeason) && seasons.includes(paramSeason) ? paramSeason : seasons[0];
    if (!searchParams.get("season") && Number.isFinite(storedSeason) && seasons.includes(storedSeason)) {
      nextSeason = storedSeason;
    }
    const weeksForSeason = manifest?.weeksBySeason?.[String(nextSeason)] || [];
    const regularWeeks = filterRegularSeasonWeeks(weeksForSeason.map((value) => ({ week: value }))).map(
      (row) => row.week,
    );
    const paramWeek = Number(searchParams.get("week"));
    let nextWeek =
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

  const updateSearchParams = (nextSeason, nextWeek) => {
    const params = new URLSearchParams(searchParams);
    params.set("season", String(nextSeason));
    if (nextWeek) params.set("week", String(nextWeek));
    else params.delete("week");
    setSearchParams(params, { replace: true });
    writeStorage(MATCHUPS_PREF_KEY, { season: nextSeason, week: nextWeek });
  };

  const handleSeasonChange = (value) => {
    const nextSeason = Number(value);
    setSeason(nextSeason);
    const weeksForSeason = manifest?.weeksBySeason?.[String(nextSeason)] || [];
    const regularWeeks = filterRegularSeasonWeeks(weeksForSeason.map((w) => ({ week: w }))).map((row) => row.week);
    const nextWeek = regularWeeks.includes(Number(week)) ? Number(week) : regularWeeks[0] || "";
    setWeek(nextWeek);
    updateSearchParams(nextSeason, nextWeek);
  };

  const handleWeekChange = (value) => {
    const nextWeek = Number(value);
    setWeek(nextWeek);
    updateSearchParams(season, nextWeek);
  };

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
    let active = true;
    if (!season) return undefined;
    loadPlayerStatsFull(season).then((payload) => {
      if (!active) return;
      const rows = payload?.rows || payload || [];
      setFullStatsRows(rows);
    });
    return () => {
      active = false;
    };
  }, [season]);

  useEffect(() => {
    setActiveMatchup(null);
  }, [season, week]);

  const matchups = weekData?.matchups || [];
  const lineups = weekData?.lineups || [];
  const fullStatsIndex = useMemo(() => buildNameIndex(fullStatsRows), [fullStatsRows]);
  const searchIndex = useMemo(() => buildNameIndex(playerSearch), [playerSearch]);

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
    const mapped = rows.map((row, originalIndex) => {
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
      };
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

          const rank = (pos, isFlex) => {
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

          const pA = safeNumber(a.points);
          const pB = safeNumber(b.points);
          if (pA !== pB) return pB - pA;

          return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
        });
    const totals = sortedRows.reduce(
      (acc, row) => {
        acc.points += safeNumber(row.points);
        acc.starters += row.started ? 1 : 0;
        return acc;
      },
      { points: 0, starters: 0 },
    );
    const positionalTotals = sortedRows.reduce((acc, row) => {
      const position = row.position || "—";
      acc[position] = (acc[position] || 0) + safeNumber(row.points);
      return acc;
    }, {});
    return { rows: sortedRows, totals, positionalTotals };
  };

  const buildPlayerLink = (row) => {
    const name = row.linkName || row.displayName;
    if (name) return `/players/${row.canonicalPlayerId}?name=${encodeURIComponent(name)}`;
    return `/players/${row.canonicalPlayerId}`;
  };

  const activeRoster = useMemo(() => {
    if (!activeMatchup) return null;
    return {
      home: buildRoster(getLineupTeamKeys(activeMatchup, "home")),
      away: buildRoster(getLineupTeamKeys(activeMatchup, "away")),
    };
  }, [activeMatchup, lineups, playerIndex, teamsByRosterId, fullStatsIndex, searchIndex, espnNameMap]);

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;
  const query = teamQuery.trim().toLowerCase();

  const filteredMatchups = useMemo(() => {
    if (!query) return matchups;
    return matchups.filter((matchup) => {
      const homeLabel = ownerLabel(getMatchupLabel(matchup, "home"), matchup.home_team || "Home");
      const awayLabel = ownerLabel(getMatchupLabel(matchup, "away"), matchup.away_team || "Away");
      return homeLabel.toLowerCase().includes(query) || awayLabel.toLowerCase().includes(query);
    });
  }, [matchups, ownerLabel, query]);

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
  }, [isDev, weekData, lineups, playerIndex]);

  if (loading) return <LoadingState label="Loading matchups..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <section>
        <h1 className="page-title">Matchups</h1>
        <p className="page-subtitle">Filter by season and week, then open a matchup to see roster details.</p>
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
          <label>Week</label>
          <select value={week} onChange={(event) => handleWeekChange(event.target.value)}>
            {availableWeeks.map((value) => (
              <option key={value} value={value}>
                Week {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Team</label>
          <SearchBar value={teamQuery} onChange={setTeamQuery} placeholder="Filter by team..." />
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

      {filteredMatchups.length ? (
        <section className="matchup-grid">
          {filteredMatchups.map((matchup) => {
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
                  <div className="table-wrap">
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
                        {(() => {
                          const starters = roster.rows.filter((r) => r.started);
                          const bench = roster.rows.filter((r) => !r.started);
                          const startersTotal = starters.reduce((acc, r) => acc + safeNumber(r.points), 0);
                          const benchTotal = bench.reduce((acc, r) => acc + safeNumber(r.points), 0);

                          return (
                            <>
                              {starters.map((row, idx) => (
                                <tr key={`${row.player_id || row.player}-starter-${idx}`}>
                                  <td>
                                    {row.canLink ? (
                                      <Link className="link-button" to={buildPlayerLink(row)}>
                                        {row.displayName}
                                      </Link>
                                    ) : (
                                      row.displayName
                                    )}
                                  </td>
                                  <td>{row.position}</td>
                                  <td>{row.started ? "Yes" : "No"}</td>
                                  <td>{formatPoints(row.points)}</td>
                                </tr>
                              ))}

                              {starters.length ? (
                                <tr className="table-total">
                                  <td colSpan={3}>
                                    <strong>Starters total</strong>
                                  </td>
                                  <td>
                                    <strong>{formatPoints(startersTotal)}</strong>
                                  </td>
                                </tr>
                              ) : null}

                              {bench.map((row, idx) => (
                                <tr key={`${row.player_id || row.player}-bench-${idx}`}>
                                  <td>
                                    {row.canLink ? (
                                      <Link className="link-button" to={buildPlayerLink(row)}>
                                        {row.displayName}
                                      </Link>
                                    ) : (
                                      row.displayName
                                    )}
                                  </td>
                                  <td>{row.position}</td>
                                  <td>{row.started ? "Yes" : "No"}</td>
                                  <td>{formatPoints(row.points)}</td>
                                </tr>
                              ))}

                              {bench.length ? (
                                <tr className="table-total">
                                  <td colSpan={3}>
                                    <strong>Bench total</strong>
                                  </td>
                                  <td>
                                    <strong>{formatPoints(benchTotal)}</strong>
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
                  <div>No roster data available for this team.</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>No matchup details available.</div>
        )}
      </Modal>

    </>
  );
}
