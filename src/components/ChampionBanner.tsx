import { useMemo } from "react";
import { useSeasonData } from "../hooks/useSeasonData";
import { useSeasonSelection } from "../hooks/useSeasonSelection";

const CONFETTI_COUNT = 18;

export function ChampionBanner() {
  const { year, years } = useSeasonSelection();
  const { status, season } = useSeasonData(year);

  const champion = useMemo(() => {
    if (!season) {
      return null;
    }
    const byFinalRank = season.teams.find((team) => team.final_rank === 1);
    if (byFinalRank) {
      return byFinalRank;
    }
    const sorted = [...season.teams].sort(
      (a, b) => (a.regular_season_rank ?? 99) - (b.regular_season_rank ?? 99),
    );
    return sorted[0] ?? null;
  }, [season]);

  const finalMatchup = useMemo(() => {
    if (!season) {
      return null;
    }
    const playoffMatchups = season.matchups.filter((matchup) => matchup.is_playoff);
    if (playoffMatchups.length === 0) {
      return null;
    }
    const latestWeek = Math.max(...playoffMatchups.map((matchup) => matchup.week ?? 0));
    const finalWeekMatchups = playoffMatchups.filter(
      (matchup) => (matchup.week ?? 0) === latestWeek,
    );
    return finalWeekMatchups
      .map((matchup) => ({
        ...matchup,
        total: (matchup.home_score ?? 0) + (matchup.away_score ?? 0),
      }))
      .sort((a, b) => b.total - a.total)[0];
  }, [season]);

  const isCurrentSeason = year != null && years.length > 0 && year === Math.max(...years);
  const formatScore = (value: number | null | undefined) =>
    typeof value === "number" ? value.toFixed(1) : "—";

  if (status !== "ready" || !season) {
    return null;
  }

  return (
    <section
      className={`champion-banner${isCurrentSeason ? " champion-banner--current" : ""}`}
      aria-label="Season champion spotlight"
    >
      <div className="champion-banner__content">
        <div>
          <p className="champion-banner__kicker">Season {year} Champion</p>
          <h2 className="champion-banner__title">{champion?.team_name ?? "League Champion"}</h2>
          <p className="champion-banner__subtitle">
            {champion?.owner ? `Managed by ${champion.owner}` : "Celebrating a legendary run."}
          </p>
        </div>
        <div className="champion-banner__scoreboard">
          <p className="champion-banner__scoreboard-title">Championship Scoreboard</p>
          {finalMatchup ? (
            <div className="champion-banner__score">
              <div>
                <span className="champion-banner__team">{finalMatchup.home_team ?? "—"}</span>
                <span className="champion-banner__points">
                  {formatScore(finalMatchup.home_score)}
                </span>
              </div>
              <span className="champion-banner__vs">vs</span>
              <div>
                <span className="champion-banner__team">{finalMatchup.away_team ?? "—"}</span>
                <span className="champion-banner__points">
                  {formatScore(finalMatchup.away_score)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No playoff matchup data available.</p>
          )}
        </div>
      </div>
      {isCurrentSeason ? (
        <div className="champion-banner__celebration">
          <p className="champion-banner__congrats">Congrats on an unforgettable title!</p>
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: CONFETTI_COUNT }).map((_, index) => (
              <span key={`confetti-${index}`} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
