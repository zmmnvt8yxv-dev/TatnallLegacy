import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadWeekData } from "../data/loader.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { positionSort } from "../utils/positions.js";

export default function MatchupDetailPage() {
  const { season, week, matchupId } = useParams();
  const { loading, error, playerIdLookup } = useDataContext();
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

  const getPlayerInfo = (playerId) => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    const player = uid ? playerIdLookup.byUid.get(uid) : null;
    return player || null;
  };

  const buildRoster = (teamName) => {
    const rows = lineups.filter((row) => String(row.team) === String(teamName));
    const mapped = rows.map((row) => {
      const player = getPlayerInfo(row.player_id);
      return {
        ...row,
        displayName: player?.full_name || row.player || row.player_id,
        position: player?.position || "—",
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

  const homeRoster = buildRoster(matchup.home_team);
  const awayRoster = buildRoster(matchup.away_team);

  return (
    <>
      <section>
        <h1 className="page-title">
          Week {week} Matchup: {matchup.home_team} vs {matchup.away_team}
        </h1>
        <p className="page-subtitle">
          Matchup ID {matchupId} · {season} season
        </p>
      </section>

      <section className="section-card">
        <SearchBar value={search} onChange={setSearch} placeholder="Search players in this matchup..." />
      </section>

      <section className="detail-grid">
        {[{ label: matchup.home_team, roster: homeRoster }, { label: matchup.away_team, roster: awayRoster }].map(
          ({ label, roster }) => (
            <div key={label} className="section-card">
              <h2 className="section-title">{label}</h2>
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
                      <tr key={`${row.player_id}-${idx}`}>
                        <td>
                          <Link to={`/players/${row.player_id}`}>{row.displayName}</Link>
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
