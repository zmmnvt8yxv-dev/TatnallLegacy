import { useMemo, useState } from "react";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { selectMatchups, selectVisibleWeeks } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";
import { useSeasonSelection } from "../hooks/useSeasonSelection";

export function LiveSection() {
  const { year } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const weeks = useMemo(() => (season ? selectVisibleWeeks(season) : []), [season]);
  const latestWeek = weeks.length ? weeks[weeks.length - 1] : null;
  const activeWeek = selectedWeek ?? latestWeek;
  const matchups = useMemo(() => (season ? selectMatchups(season) : []), [season]);
  const liveMatchups = useMemo(() => {
    if (activeWeek == null) {
      return [];
    }
    return matchups.filter((matchup) => matchup.week === `Week ${activeWeek}`);
  }, [activeWeek, matchups]);

  if (status === "loading") {
    return <LoadingSection title="Live" subtitle="Loading the latest scoreboard…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell id="live" title="Live" subtitle="Follow the latest matchup action.">
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      id="live"
      title="Live"
      subtitle="Follow the latest matchup action."
      actions={
        weeks.length ? (
          <>
            <label htmlFor="liveWeek" className="text-sm text-muted">
              Week:
            </label>
            <select
              id="liveWeek"
              className="input"
              aria-label="Select week"
              value={activeWeek ?? undefined}
              onChange={(event) => setSelectedWeek(Number(event.target.value))}
            >
              {weeks.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </>
        ) : null
      }
    >
      {activeWeek == null ? (
        <p className="text-sm text-muted">Live scores are not available for this season yet.</p>
      ) : (
        <div className="live-grid">
          {liveMatchups.length === 0 ? (
            <p className="text-sm text-muted">No matchups have been recorded for this week yet.</p>
          ) : (
            liveMatchups.map((matchup) => {
              const homeWins = matchup.homeScore > matchup.awayScore;
              const awayWins = matchup.awayScore > matchup.homeScore;
              const isLive =
                activeWeek === latestWeek && (matchup.homeScore > 0 || matchup.awayScore > 0);
              return (
                <article key={`${matchup.home}-${matchup.away}`} className="live-card">
                  <div className="live-card__header">
                    <p className="live-card__week">{matchup.week}</p>
                    <span
                      className={`status-pill ${isLive ? "status-pill--live" : "status-pill--active"}`}
                    >
                      {isLive ? "Live" : matchup.status}
                    </span>
                  </div>
                  <div className="live-card__teams">
                    <div className={`live-card__team${awayWins ? " live-card__team--winner" : ""}`}>
                      <span>{matchup.away}</span>
                      <strong>{matchup.awayScore ? matchup.awayScore.toFixed(1) : "—"}</strong>
                    </div>
                    <div className={`live-card__team${homeWins ? " live-card__team--winner" : ""}`}>
                      <span>{matchup.home}</span>
                      <strong>{matchup.homeScore ? matchup.homeScore.toFixed(1) : "—"}</strong>
                    </div>
                  </div>
                  <p className="live-card__meta">
                    Updated {season.generated_at ? season.generated_at : "recently"}
                  </p>
                </article>
              );
            })
          )}
        </div>
      )}
    </SectionShell>
  );
}
