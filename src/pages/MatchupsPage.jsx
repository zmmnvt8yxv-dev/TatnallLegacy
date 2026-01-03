import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import Modal from "../components/Modal.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadWeekData } from "../data/loader.js";
import { formatPoints, filterRegularSeasonWeeks, safeNumber } from "../utils/format.js";
import { resolveOwnerName } from "../utils/owners.js";
import { positionSort } from "../utils/positions.js";

export default function MatchupsPage() {
  const { manifest, loading, error, playerIdLookup } = useDataContext();
  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("");
  const [weekData, setWeekData] = useState(null);
  const [activeMatchup, setActiveMatchup] = useState(null);
  const [activePlayer, setActivePlayer] = useState(null);

  const availableWeeks = useMemo(() => {
    if (!season) return [];
    const weeks = manifest?.weeksBySeason?.[String(season)] || [];
    return filterRegularSeasonWeeks(weeks.map((value) => ({ week: value }))).map((row) => row.week);
  }, [manifest, season]);

  useEffect(() => {
    if (!season && seasons.length) setSeason(seasons[0]);
  }, [seasons, season]);

  useEffect(() => {
    if (!week && availableWeeks.length) setWeek(availableWeeks[0]);
  }, [availableWeeks, week]);

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

  const buildRoster = (teamName) => {
    const rows = lineups.filter((row) => String(row.team) === String(teamName));
    const mapped = rows.map((row) => {
      const uid = playerIdLookup.bySleeper.get(String(row.player_id));
      const player = uid ? playerIdLookup.byUid.get(uid) : null;
      return {
        ...row,
        displayName: player?.full_name || row.player || row.player_id,
        position: player?.position || "—",
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
      home: buildRoster(activeMatchup.home_team),
      away: buildRoster(activeMatchup.away_team),
    };
  }, [activeMatchup, lineups]);

  if (loading) return <LoadingState label="Loading matchups..." />;
  if (error) return <ErrorState message={error} />;

  const ownerLabel = (value, fallback = "—") => resolveOwnerName(value) || fallback;

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

      {matchups.length ? (
        <section className="matchup-grid">
          {matchups.map((matchup) => {
            const homeWin = matchup.home_score > matchup.away_score;
            const awayWin = matchup.away_score > matchup.home_score;
            const homeLabel = ownerLabel(matchup.home_team, matchup.home_team || "Home");
            const awayLabel = ownerLabel(matchup.away_team, matchup.away_team || "Away");
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
            ? `Week ${week} · ${ownerLabel(activeMatchup.home_team, activeMatchup.home_team)} vs ${ownerLabel(
                activeMatchup.away_team,
                activeMatchup.away_team,
              )}`
            : "Matchup"
        }
        onClose={() => setActiveMatchup(null)}
      >
        {activeMatchup && activeRoster ? (
          <div className="detail-grid">
            {[
              { label: activeMatchup.home_team, roster: activeRoster.home },
              { label: activeMatchup.away_team, roster: activeRoster.away },
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
                        <tr key={`${row.player_id}-${idx}`}>
                          <td>
                            <button type="button" className="link-button" onClick={() => setActivePlayer(row.player_id)}>
                              {row.displayName}
                            </button>
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
            const uid = playerIdLookup.bySleeper.get(String(activePlayer));
            const player = uid ? playerIdLookup.byUid.get(uid) : null;
            return (
              <div className="section-card">
                <h3 className="section-title">{player?.full_name || `Player ${activePlayer}`}</h3>
                <div className="flex-row">
                  <div className="tag">Position: {player?.position || "—"}</div>
                  <div className="tag">NFL Team: {player?.nfl_team || "—"}</div>
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
