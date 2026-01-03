import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadSeasonSummary } from "../data/loader.js";
import { formatPoints } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";

export default function StandingsPage() {
  const { manifest, loading, error } = useDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const seasons = (manifest?.seasons || []).slice().sort((a, b) => b - a);
  const [season, setSeason] = useState(seasons[0] || "");
  const [seasonSummary, setSeasonSummary] = useState(null);
  const [allSummaries, setAllSummaries] = useState([]);

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
    if (!season) return;
    const seasonValue = String(season);
    if ((searchParams.get("season") || "") === seasonValue) return;
    const next = new URLSearchParams(searchParams);
    next.set("season", seasonValue);
    setSearchParams(next, { replace: true });
  }, [season, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    if (!season) return undefined;
    loadSeasonSummary(season).then((payload) => {
      if (active) setSeasonSummary(payload);
    });
    return () => {
      active = false;
    };
  }, [season]);

  useEffect(() => {
    let active = true;
    if (!seasons.length) return undefined;
    Promise.all(seasons.map((year) => loadSeasonSummary(year))).then((payloads) => {
      if (active) setAllSummaries(payloads.filter(Boolean));
    });
    return () => {
      active = false;
    };
  }, [seasons]);

  const allTime = useMemo(() => {
    const totals = new Map();
    for (const summary of allSummaries) {
      for (const row of summary?.standings || []) {
        const key = row.team;
        const cur = totals.get(key) || { team: key, wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 };
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

  if (loading) return <LoadingState label="Loading standings..." />;
  if (error) return <ErrorState message={error} />;

  const standings = seasonSummary?.standings || [];
  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;

  return (
    <>
      <section>
        <h1 className="page-title">Standings</h1>
        <p className="page-subtitle">Season standings plus all-time franchise performance.</p>
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
        <div className="tag">Teams: {standings.length || 0}</div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Season Standings</h2>
        {standings.length ? (
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
              {standings.map((row) => (
                <tr key={row.team}>
                  <td>{ownerLabel(row.team, row.team)}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.ties}</td>
                  <td>{formatPoints(row.points_for)}</td>
                  <td>{formatPoints(row.points_against)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>No standings data available for this season.</div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">All-Time Franchise Summary</h2>
        {allTime.length ? (
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
              {allTime.map((row) => (
                <tr key={row.team}>
                  <td>{ownerLabel(row.team, row.team)}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.ties}</td>
                  <td>{formatPoints(row.points_for)}</td>
                  <td>{formatPoints(row.points_against)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>No historical standings data available.</div>
        )}
      </section>
    </>
  );
}
