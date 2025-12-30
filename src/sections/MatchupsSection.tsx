import { motion } from "framer-motion";
import { SectionShell } from "../components/SectionShell";

const matchupWeeks = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8"];

const matchups = [
  {
    week: "Week 8",
    home: "Midnight Riders",
    away: "Lightning Bolts",
    kickoff: "Sunday 1:00 PM",
    status: "Live",
    homeScore: 86.4,
    awayScore: 78.9,
  },
  {
    week: "Week 8",
    home: "Neon Knights",
    away: "Monarchs",
    kickoff: "Sunday 4:05 PM",
    status: "In Progress",
    homeScore: 63.2,
    awayScore: 69.7,
  },
  {
    week: "Week 8",
    home: "Emerald City",
    away: "Ironclads",
    kickoff: "Sunday 8:20 PM",
    status: "Upcoming",
    homeScore: 0,
    awayScore: 0,
  },
  {
    week: "Week 8",
    home: "Golden State",
    away: "Coastal Kings",
    kickoff: "Monday 8:15 PM",
    status: "Upcoming",
    homeScore: 0,
    awayScore: 0,
  },
];

export function MatchupsSection() {
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
                  matchup.status === "Live"
                    ? "status-pill--live"
                    : matchup.status === "In Progress"
                      ? "status-pill--active"
                      : "status-pill--upcoming"
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
