import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadWeekData } from "../data/loader.js";
import { formatPoints, filterRegularSeasonWeeks } from "../utils/format.js";

export default function MatchupsPage() {
  const { manifest, loading, error } = useDataContext();
  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);
  const [season, setSeason] = useState(seasons[0] || "");
  const [week, setWeek] = useState("");
  const [weekData, setWeekData] = useState(null);

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

  const matchups = weekData?.matchups || [];

  if (loading) return <LoadingState label="Loading matchups..." />;
  if (error) return <ErrorState message={error} />;

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
            return (
              <div key={matchup.matchup_id} className="matchup-card">
                <div className="matchup-row">
                  <strong>{matchup.home_team || "Home"}</strong>
                  <span className="pill">{homeWin ? "Winner" : awayWin ? "—" : "Tie"}</span>
                  <span>{formatPoints(matchup.home_score)}</span>
                </div>
                <div className="matchup-row">
                  <strong>{matchup.away_team || "Away"}</strong>
                  <span className="pill">{awayWin ? "Winner" : homeWin ? "—" : "Tie"}</span>
                  <span>{formatPoints(matchup.away_score)}</span>
                </div>
                <Link to={`/matchups/${season}/${week}/${matchup.matchup_id}`} className="tag">
                  View matchup →
                </Link>
              </div>
            );
          })}
        </section>
      ) : (
        <div className="section-card">No matchups available for this week.</div>
      )}
    </>
  );
}
