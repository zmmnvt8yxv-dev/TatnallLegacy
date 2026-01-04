import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadWeekData } from "../data/loader.js";
import { resolvePlayerDisplay } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";
import { positionSort } from "../utils/positions.js";

export default function MatchupDetailPage() {
  const { season, week, matchupId } = useParams();
  const { loading, error, playerIndex, teams } = useDataContext();
  const [weekData, setWeekData] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    if (!season || !week) return undefined;
    loadWeekData(Number(season), Number(week)).then((payload) => {
      if (active) setWeekData(payload);
    });
    return () => {
      active = false;
    };
  }, [season, week]);

  const matchup = useMemo(() => {
    return (weekData?.matchups || []).find((item) => String(item.matchup_id) === String(matchupId));
  }, [weekData, matchupId]);

  const lineups = weekData?.lineups || [];
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
    const mapped = rows.map((row) => {
      const display = resolvePlayerDisplay(row.player_id, { row, playerIndex });
      return {
        ...row,
        displayName: display.name,
        position: display.position,
        nflTeam: display.team,
      };
    });
    const filtered = mapped.filter((row) => {
      if (!query) return true;
      return String(row.displayName).toLowerCase().includes(query);
    });
    const totals = filtered.reduce(
      (acc, row) => {
        acc.points += safeNumber(row.points);
        acc.starters += row.started ? 1 : 0;
        return acc;
      },
      { points: 0, starters: 0 },
    );
    const positionalTotals = filtered.reduce((acc, row) => {
      const position = row.position || "—";
      acc[position] = (acc[position] || 0) + safeNumber(row.points);
      return acc;
    }, {});
    return { rows: filtered, totals, positionalTotals };
  };

  if (loading && !weekData) return <LoadingState label="Loading matchup details..." />;
  if (error) return <ErrorState message={error} />;

  if (!matchup) {
    return (
      <div className="section-card">
        <h1 className="page-title">Matchup Detail</h1>
        <p>No matchup data available for this selection.</p>
        <Link className="tag" to="/matchups">
          Back to matchups →
        </Link>
      </div>
    );
  }

  const homeRoster = buildRoster(getLineupTeamKeys(matchup.home_team, matchup.home_roster_id));
  const awayRoster = buildRoster(getLineupTeamKeys(matchup.away_team, matchup.away_roster_id));
  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;

  return (
    <>
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
                      {roster.rows.map((row, idx) => (
                        <tr key={`${row.player_id || row.player}-${idx}`}>
                          <td>
                            {row.player_id ? (
                              <Link to={`/players/${row.player_id}`}>{row.displayName}</Link>
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
    </>
  );
}
