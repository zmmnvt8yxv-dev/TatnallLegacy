import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDataContext } from "../data/DataContext.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useMatchupDetail } from "../hooks/useMatchupDetail.js";
import PageTransition from "../components/PageTransition.jsx";
import { getCanonicalPlayerId, resolvePlayerDisplay } from "../lib/playerName.js";
import { buildNameIndex, normalizeName } from "../lib/nameUtils.js";
import { formatPoints, safeNumber } from "../utils/format";
import { normalizeOwnerName } from "../utils/owners";
import { positionSort } from "../utils/positions";

export default function MatchupDetailPage() {
  const { season, week, matchupId } = useParams();
  const { loading: contextLoading, error: contextError, playerIndex, teams, espnNameMap, playerSearch } = useDataContext();

  const {
    weekData,
    fullStatsRows,
    isLoading: dataLoading,
    isError: dataError
  } = useMatchupDetail(season, week);

  const [search, setSearch] = useState("");

  const matchup = useMemo(() => {
    const list = (weekData?.matchups || []).map((item, index) => ({
      ...item,
      matchup_id: item.matchup_id ?? item.id ?? `m-${index}`,
    }));
    return list.find((item) => String(item.matchup_id) === String(matchupId));
  }, [weekData, matchupId]);

  const lineups = weekData?.lineups || [];
  const fullStatsIndex = useMemo(() => buildNameIndex(fullStatsRows), [fullStatsRows]);
  const searchIndex = useMemo(() => buildNameIndex(playerSearch), [playerSearch]);
  const query = search.toLowerCase().trim();

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

  const getLineupTeamKeys = (matchupSide, rosterId) => {
    const keys = new Set();
    if (matchupSide) keys.add(String(matchupSide));
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

  const getMatchupLabel = (teamValue, rosterId) => {
    const rosterName = rosterId != null ? teamsByRosterId.get(String(rosterId)) : null;
    return rosterName || teamValue || "—";
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
        displayName: display.name,
        position: display.position || merged.position || "—",
        nflTeam: display.team || merged.nfl_team || "—",
        canonicalPlayerId: canonicalId || "",
        linkName: display.name || merged.display_name || row.player || "",
        canLink,
        originalIndex,
      };
    });
    const filtered = mapped.filter((row) => {
      if (!query) return true;
      return String(row.displayName).toLowerCase().includes(query);
    });
    const sortedRows = Number(season) === 2025
      ? filtered
      : [...filtered].sort((a, b) => {
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

  if ((contextLoading || dataLoading) && !weekData) return <LoadingState label="Loading matchup details..." />;
  if (contextError || dataError) return <ErrorState message={contextError || "Error loading matchup details"} />;

  if (!matchup) {
    return (
      <PageTransition>
        <div className="section-card">
          <h1 className="page-title">Matchup Detail</h1>
          <p>No matchup data available for this selection.</p>
          <Link className="tag" to="/matchups">
            Back to matchups →
          </Link>
        </div>
      </PageTransition>
    );
  }

  const homeRoster = buildRoster(getLineupTeamKeys(matchup.home_team, matchup.home_roster_id));
  const awayRoster = buildRoster(getLineupTeamKeys(matchup.away_team, matchup.away_roster_id));
  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;

  return (
    <PageTransition>
      <section>
        <h1 className="page-title">
          Week {week} Matchup: {ownerLabel(getMatchupLabel(matchup.home_team, matchup.home_roster_id), matchup.home_team)}{" "}
          vs {ownerLabel(getMatchupLabel(matchup.away_team, matchup.away_roster_id), matchup.away_team)}
        </h1>
        <p className="page-subtitle">
          Matchup ID {matchupId} · {season} season
        </p>
      </section>

      <section className="section-card filters filters--sticky">
        <SearchBar value={search} onChange={setSearch} placeholder="Search players in this matchup..." />
      </section>

      <section className="detail-grid">
        {[
          { label: getMatchupLabel(matchup.home_team, matchup.home_roster_id), roster: homeRoster },
          { label: getMatchupLabel(matchup.away_team, matchup.away_roster_id), roster: awayRoster },
        ].map(
          ({ label, roster }) => (
            <div key={label} className="section-card">
              <h2 className="section-title">{ownerLabel(label, label)}</h2>
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
                                    <Link to={buildPlayerLink(row)}>{row.displayName}</Link>
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
                                    <Link to={buildPlayerLink(row)}>{row.displayName}</Link>
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
          ),
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Stat Coverage</h2>
        <p>
          Weekly fantasy points are shown when available. Rush/receiving/passing yards and TDs are not present in the
          current exports, so this matchup is displayed with points-only totals.
        </p>
      </section>
    </PageTransition>
  );
}
