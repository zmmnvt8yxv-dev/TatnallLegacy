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
  const championRecord = champion?.record ?? "—";
  const championPointsFor = champion?.points_for;
  const championPointsAgainst = champion?.points_against;

  if (status !== "ready" || !season) {
    return null;
  }

  return (
    <section
      className={`champion-banner${isCurrentSeason ? " champion-banner--current" : ""}`}
      aria-label="Season champion spotlight"
    >
      <div className="champion-banner__glow" aria-hidden="true" />
      <div className="champion-banner__frame">
        <div className="champion-banner__badge">
          <span aria-hidden="true">🏆</span> Season {year} Champion
        </div>
        <div className="champion-banner__main">
          <div className="champion-banner__team">
            <h2 className="champion-banner__title">{champion?.team_name ?? "League Champion"}</h2>
            <p className="champion-banner__subtitle">
              {champion?.owner ? `Managed by ${champion.owner}` : "Celebrating a legendary run."}
            </p>
            <div className="champion-banner__meta">
              <div>
                <span className="champion-banner__meta-label">Record</span>
                <span className="champion-banner__meta-value">{championRecord}</span>
              </div>
              <div>
                <span className="champion-banner__meta-label">Points For</span>
                <span className="champion-banner__meta-value">
                  {formatScore(championPointsFor)}
                </span>
              </div>
              <div>
                <span className="champion-banner__meta-label">Points Against</span>
                <span className="champion-banner__meta-value">
                  {formatScore(championPointsAgainst)}
                </span>
              </div>
            </div>
          </div>
          <div className="champion-banner__scoreboard">
            <p className="champion-banner__scoreboard-title">Championship Scoreboard</p>
            {finalMatchup ? (
              <div className="champion-banner__score">
                <div>
                  <span className="champion-banner__team-name">
                    {finalMatchup.home_team ?? "—"}
                  </span>
                  <span className="champion-banner__points">
                    {formatScore(finalMatchup.home_score)}
                  </span>
                </div>
                <span className="champion-banner__vs">vs</span>
                <div>
                  <span className="champion-banner__team-name">
                    {finalMatchup.away_team ?? "—"}
                  </span>
                  <span className="champion-banner__points">
                    {formatScore(finalMatchup.away_score)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="champion-banner__empty">Playoff scores will appear here.</p>
            )}
          </div>
        </div>
        {isCurrentSeason ? (
          <div className="champion-banner__celebration">
            <p className="champion-banner__congrats">Congrats on an unforgettable title!</p>
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: CONFETTI_COUNT }).map((_, index) => (
                <span
                  key={`confetti-${index}`}
                  style={{
                    left: `${(index / CONFETTI_COUNT) * 100}%`,
                    animationDelay: `${(index % 6) * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
