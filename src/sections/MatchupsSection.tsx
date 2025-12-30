import { useMemo } from "react";
import { motion } from "framer-motion";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { selectMatchupWeeks, selectMatchups } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";

export function MatchupsSection() {
  const { status, season, error } = useSeasonData();
  const matchupWeeks = useMemo(() => (season ? selectMatchupWeeks(season) : []), [season]);
  const matchups = useMemo(() => (season ? selectMatchups(season) : []), [season]);

  if (status === "loading") {
    return <LoadingSection title="Matchups" subtitle="Loading weekly matchups…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell
        id="matchups"
        title="Matchups"
        subtitle="Track weekly matchups and live scoring swings."
      >
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      id="matchups"
      title="Matchups"
      subtitle="Track weekly matchups and live scoring swings."
      actions={
        <>
          <label htmlFor="weekFilter" className="text-sm text-muted">
            Week:
          </label>
          <select id="weekFilter" aria-label="Week filter" className="input">
            {matchupWeeks.map((week) => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
          <div className="toggle-group" role="group" aria-label="Live filters">
            <button type="button" className="btn toggle is-active">
              All
            </button>
            <button type="button" className="btn toggle">
              Live
            </button>
            <button type="button" className="btn toggle">
              Upcoming
            </button>
          </div>
          <input
            id="matchupSearch"
            type="search"
            placeholder="Filter by team…"
            aria-label="Filter matchups"
            className="input"
          />
        </>
      }
    >
      <div className="matchups-grid">
        {matchups.map((matchup, index) => (
          <motion.article
            key={`${matchup.home}-${matchup.away}`}
            className="matchup-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ y: -3 }}
          >
            <div className="matchup-card__header">
              <p className="matchup-card__week">{matchup.week}</p>
              <span
                className={`status-pill ${
                  matchup.status === "Final" ? "status-pill--active" : "status-pill--upcoming"
                }`}
              >
                {matchup.status}
              </span>
            </div>
            <div className="matchup-card__body">
              <div className="matchup-card__team">
                <span>{matchup.away}</span>
                <strong>{matchup.awayScore ? matchup.awayScore.toFixed(1) : "—"}</strong>
              </div>
              <div className="matchup-card__team">
                <span>{matchup.home}</span>
                <strong>{matchup.homeScore ? matchup.homeScore.toFixed(1) : "—"}</strong>
              </div>
            </div>
            <p className="matchup-card__kickoff">{matchup.kickoff}</p>
          </motion.article>
        ))}
      </div>
    </SectionShell>
  );
}
