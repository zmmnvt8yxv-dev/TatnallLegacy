import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { selectMatchupWeeks, selectMatchups } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";

export function MatchupsSection() {
  const { status, season, error } = useSeasonData();
  const [searchText, setSearchText] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder] = useState("week");
  const matchupWeeks = useMemo(() => (season ? selectMatchupWeeks(season) : []), [season]);
  const matchups = useMemo(() => (season ? selectMatchups(season) : []), [season]);
  const activeWeek = matchupWeeks.includes(selectedWeek)
    ? selectedWeek
    : matchupWeeks[0] ?? "";
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMatchups = useMemo(() => {
    const filtered = matchups.filter((matchup) => {
      const matchesSearch =
        !normalizedSearch ||
        matchup.home.toLowerCase().includes(normalizedSearch) ||
        matchup.away.toLowerCase().includes(normalizedSearch);
      const matchesWeek = !activeWeek || matchup.week === activeWeek;
      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Live" ? matchup.status === "Final" : matchup.status === "Upcoming");
      return matchesSearch && matchesWeek && matchesStatus;
    });

    if (sortOrder === "week") {
      const getWeekNumber = (label: string) => {
        const match = label.match(/Week\s+(\d+)/i);
        return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
      };
      return [...filtered].sort((a, b) => getWeekNumber(a.week) - getWeekNumber(b.week));
    }

    return filtered;
  }, [activeWeek, matchups, normalizedSearch, sortOrder, statusFilter]);

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
          <select
            id="weekFilter"
            aria-label="Week filter"
            className="input"
            value={activeWeek}
            onChange={(event) => setSelectedWeek(event.target.value)}
          >
            {matchupWeeks.map((week) => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
          <div className="toggle-group" role="group" aria-label="Live filters">
            <button
              type="button"
              className={`btn toggle${statusFilter === "All" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("All")}
            >
              All
            </button>
            <button
              type="button"
              className={`btn toggle${statusFilter === "Live" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("Live")}
            >
              Live
            </button>
            <button
              type="button"
              className={`btn toggle${statusFilter === "Upcoming" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("Upcoming")}
            >
              Upcoming
            </button>
          </div>
          <input
            id="matchupSearch"
            type="search"
            placeholder="Filter by team…"
            aria-label="Filter matchups"
            className="input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </>
      }
    >
      <div className="matchups-grid">
        {filteredMatchups.map((matchup, index) => (
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
