import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { selectPlayerProfile, summarizeSeasonWeeks } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";
import { usePlayerNflverseSeasonWeeklyStats } from "../hooks/usePlayerNflverseSeasonWeeklyStats";
import { getNflTeamLogoUrl } from "../lib/playerAssets";
import { DataLoadErrorPanel } from "./DataLoadErrorPanel";
import { PlayerHeadshot } from "./PlayerHeadshot";
import { PlayerTrendChart } from "./PlayerTrendChart";

function formatNumber(value: number): string {
  return value.toFixed(1);
}

function formatStatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function formatSeasonSpan(seasons: number[]) {
  if (!seasons.length) {
    return "";
  }
  const ranges: Array<[number, number]> = [];
  let start = seasons[0];
  let end = seasons[0];
  seasons.slice(1).forEach((season) => {
    if (season === end + 1) {
      end = season;
    } else {
      ranges.push([start, end]);
      start = season;
      end = season;
    }
  });
  ranges.push([start, end]);
  return ranges
    .map(([rangeStart, rangeEnd]) =>
      rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`,
    )
    .join(", ");
}

type PlayerProfileModalProps = {
  isOpen: boolean;
  playerName: string | null;
  onClose: () => void;
};

export function PlayerProfileModal({ isOpen, playerName, onClose }: PlayerProfileModalProps) {
  const { status, seasons, loadAllSeasons, error, errorStatus, errorUrl } = useAllSeasonsData();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [metricView, setMetricView] = useState("ppr");
  const [logoFallback, setLogoFallback] = useState<Record<string, boolean>>({});
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>({});
  const profile = useMemo(() => {
    if (!playerName || status !== "ready") {
      return null;
    }
    return selectPlayerProfile(seasons, playerName);
  }, [playerName, seasons, status]);

  const metricOptions = useMemo(() => {
    if (profile?.position === "QB") {
      return [
        { id: "ppr", label: "PPR Scoring" },
        { id: "standard", label: "Standard Scoring" },
        { id: "passing", label: "Passing/Rushing" },
      ];
    }
    if (["RB", "WR", "TE"].includes(profile?.position ?? "")) {
      return [
        { id: "ppr", label: "PPR Scoring" },
        { id: "standard", label: "Standard Scoring" },
        { id: "rushing", label: "Rushing/Receiving" },
      ];
    }
    return [{ id: "ppr", label: "Scoring Snapshot" }];
  }, [profile]);

  useEffect(() => {
    if (!metricOptions.some((option) => option.id === metricView)) {
      setMetricView(metricOptions[0]?.id ?? "ppr");
    }
  }, [metricOptions, metricView]);

  const liveSeason = 2025;
  const seasonYears = useMemo(() => {
    if (!profile) {
      return [];
    }
    const years = profile.seasons.map((season) => season.season);
    if (!years.includes(liveSeason)) {
      years.push(liveSeason);
    }
    return years;
  }, [profile, liveSeason]);
  const nflverseWeeklyStats = usePlayerNflverseSeasonWeeklyStats(
    profile?.player ?? null,
    seasonYears,
  );
  const externalSeasonSummaries = useMemo(() => {
    if (!profile || nflverseWeeklyStats.status !== "ready") {
      return null;
    }
    const fantasyTeamsBySeason = new Map(
      profile.seasons.map((season) => [season.season, season.fantasyTeams]),
    );
    const summaries = Object.entries(nflverseWeeklyStats.weeksBySeason)
      .map(([seasonKey, weeks]) => {
        const seasonNumber = Number(seasonKey);
        const summary = summarizeSeasonWeeks(seasonNumber, weeks);
        const fallbackTeams = fantasyTeamsBySeason.get(seasonNumber) ?? [];
        return fallbackTeams.length
          ? { ...summary, fantasyTeams: fallbackTeams }
          : summary;
      })
      .sort((a, b) => a.season - b.season);
    return summaries;
  }, [profile, nflverseWeeklyStats.status, nflverseWeeklyStats.weeksBySeason]);
  const seasonsToDisplay = useMemo(() => {
    if (!profile) {
      return [];
    }
    if (externalSeasonSummaries === null) {
      return profile.seasons;
    }
    return externalSeasonSummaries;
  }, [externalSeasonSummaries, profile]);
  const liveStatTotals = useMemo(() => {
    const liveWeeks =
      seasonsToDisplay.find((season) => season.season === liveSeason)?.weeks ?? [];
    if (liveWeeks.length === 0) {
      return null;
    }
    let hasStats = false;
    const totals = liveWeeks.reduce(
      (acc, week) => {
        const statKeys = [
          "passingYards",
          "passingTds",
          "rushingYards",
          "rushingTds",
          "receptions",
          "receivingYards",
          "receivingTds",
        ] as const;
        statKeys.forEach((key) => {
          const value = week[key];
          if (value !== null && value !== undefined) {
            hasStats = true;
            acc[key] += value;
          }
        });
        return acc;
      },
      {
        passingYards: 0,
        passingTds: 0,
        rushingYards: 0,
        rushingTds: 0,
        receptions: 0,
        receivingYards: 0,
        receivingTds: 0,
      },
    );
    return { hasStats, totals };
  }, [liveSeason, seasonsToDisplay]);
  const seasonTotals = useMemo(() => {
    if (!profile) {
      return null;
    }
    const seasons = seasonsToDisplay.length ? seasonsToDisplay : profile.seasons;
    const totalPoints = seasons.reduce((sum, season) => sum + season.totalPoints, 0);
    const totalGames = seasons.reduce((sum, season) => sum + season.games, 0);
    const maxPoints = seasons.reduce((max, season) => Math.max(max, season.maxPoints), 0);
    const aboveThreshold = seasons.reduce(
      (sum, season) => sum + season.aboveThreshold,
      0,
    );
    return {
      totalPoints,
      totalGames,
      avgPoints: totalGames ? totalPoints / totalGames : 0,
      maxPoints,
      aboveThreshold,
      pointsTrend: seasons.map((season) => season.totalPoints),
    };
  }, [profile, seasonsToDisplay]);

  useEffect(() => {
    setExpandedSeasons({});
  }, [playerName]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    loadAllSeasons();

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        focusableSelector,
      );
      if (!focusableElements || focusableElements.length === 0) {
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, loadAllSeasons, onClose]);

  if (!isOpen || !playerName) {
    return null;
  }

  const titleId = "player-profile-title";

  const content = (() => {
    if (status === "loading" || status === "idle") {
      return <p className="text-sm text-muted">Loading player history…</p>;
    }
    if (status === "error") {
      return (
        <DataLoadErrorPanel
          title="Unable to load player history."
          message={error}
          url={errorUrl}
          status={errorStatus}
        />
      );
    }
    if (!profile) {
      return (
        <p className="text-sm text-muted">
          No stats available yet. Try another player or season range.
        </p>
      );
    }

    const consistency = seasonTotals?.totalGames
      ? Math.round((seasonTotals.aboveThreshold / seasonTotals.totalGames) * 100)
      : 0;
    const showScoring = metricView === "ppr" || metricView === "standard";
    const scoringLabel = metricView === "standard" ? "Standard points" : "PPR points";
    const positionRankLabel =
      profile.position && profile.positionRank
        ? `${profile.position}${profile.positionRank}`
        : null;
    return (
      <div className="space-y-6">
        <div className="player-profile__hero">
          <div className="player-profile__hero-main">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Career snapshot</p>
              <h3 className="text-2xl font-semibold text-foreground">{profile.player}</h3>
              <p className="text-sm text-muted">
                {[profile.position ?? "—", profile.currentTeam ?? "—"].join(" · ")}
              </p>
              <div className="player-profile__hero-stats">
                {profile.recentPerformance ? (
                  <span>
                    Recent: {profile.recentPerformance.season} W
                    {profile.recentPerformance.week} (
                    {profile.recentPerformance.points.toFixed(1)} pts)
                  </span>
                ) : (
                  <span>Recent: —</span>
                )}
                {positionRankLabel ? (
                  <span>
                    Pos Rank: {positionRankLabel}
                    {profile.positionRankSeason ? ` (${profile.positionRankSeason})` : ""}
                  </span>
                ) : (
                  <span>Pos Rank: —</span>
                )}
                <span>Consensus #{profile.consensusRank ?? "—"}</span>
              </div>
            </div>
          </div>
          <div>
            <p className="player-profile__label">NFL Team Timeline</p>
            <div className="player-profile__season-logos">
              {profile.nflTeamHistory.length ? (
                profile.nflTeamHistory.map((entry) => (
                  <div key={`${entry.season}-${entry.team}`} className="season-logo">
                    {!logoFallback[`${entry.season}-${entry.team}`] ? (
                      <img
                        src={getNflTeamLogoUrl(entry.team)}
                        alt={`${entry.team} logo`}
                        className="season-logo__img"
                        onError={() =>
                          setLogoFallback((prev) => ({
                            ...prev,
                            [`${entry.season}-${entry.team}`]: true,
                          }))
                        }
                      />
                    ) : null}
                    <span>{entry.season}</span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-muted">No team history available.</span>
              )}
            </div>
          </div>
        </div>
        <div className="player-profile__meta">
          <div>
            <p className="player-profile__label">NFL Teams</p>
            <div className="player-profile__value player-profile__teams">
            {profile.nflTeams.length ? (
              profile.nflTeams.map((team) => (
                <span key={team} className="team-pill">
                  {!logoFallback[team] ? (
                    <img
                      src={getNflTeamLogoUrl(team)}
                      alt={`${team} logo`}
                      className="team-pill__logo"
                      onError={() =>
                        setLogoFallback((prev) => ({ ...prev, [team]: true }))
                        }
                      />
                    ) : null}
                    <span>{team}</span>
                  </span>
                ))
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
          <div>
            <p className="player-profile__label">Position</p>
            <p className="player-profile__value">{profile.position ?? "—"}</p>
          </div>
          <div>
            <p className="player-profile__label">Fantasy Teams</p>
            <p className="player-profile__value">
              {profile.fantasyTeamTimeline.length
                ? profile.fantasyTeamTimeline
                    .map(
                      (team) => `${team.team} (${formatSeasonSpan(team.seasons) || "—"})`,
                    )
                    .join(", ")
                : "—"}
            </p>
          </div>
          <div>
            <p className="player-profile__label">Seasons Tracked</p>
            <p className="player-profile__value">{seasonsToDisplay.length}</p>
          </div>
        </div>

        <div>
          <p className="player-profile__label">Metric Filters</p>
          <div className="player-profile__filters">
            {metricOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`btn ${metricView === option.id ? "btn-primary" : ""}`}
                onClick={() => setMetricView(option.id)}
              >
                {option.label}
              </button>
            ))}
        </div>
        <p className="text-xs text-muted">
          {!showScoring
            ? "Position-specific splits are not yet available for external stat feeds."
            : `Showing ${scoringLabel} derived from external scoring feeds.`}
        </p>
      </div>

        <div className="player-profile__stats">
          {showScoring ? (
            <>
              <div className="stat">
                <h3>Total Points</h3>
                <p>{formatNumber(seasonTotals?.totalPoints ?? 0)}</p>
              </div>
              <div className="stat">
                <h3>Games Played</h3>
                <p>{seasonTotals?.totalGames ?? 0}</p>
              </div>
              <div className="stat">
                <h3>Avg Points</h3>
                <p>{formatNumber(seasonTotals?.avgPoints ?? 0)}</p>
              </div>
              <div className="stat">
                <h3>Peak Week</h3>
                <p>{formatNumber(seasonTotals?.maxPoints ?? 0)}</p>
              </div>
            </>
        ) : (
          <div className="stat">
            <h3>Position Splits</h3>
            <p className="text-muted">No split data available.</p>
          </div>
        )}
      </div>

        <div className="player-profile__advanced">
          <div className="stat">
            <h3>20+ Point Games</h3>
            <p>{seasonTotals?.aboveThreshold ?? 0}</p>
          </div>
          <div className="stat">
            <h3>Consistency Rate</h3>
            <p>{consistency}%</p>
          </div>
          <div className="stat">
            <h3>Best Season Total</h3>
            <p>
              {seasonTotals?.pointsTrend.length
                ? formatNumber(Math.max(...seasonTotals.pointsTrend))
                : "0.0"}
            </p>
          </div>
        </div>

        {liveStatTotals?.hasStats ? (
          <div>
            <h3 className="section-heading">{liveSeason} Stat Totals</h3>
            <p className="section-caption">Live weekly stats for the current season.</p>
            <div className="player-profile__advanced">
              <div className="stat">
                <h3>Pass Yds</h3>
                <p>{formatStatValue(liveStatTotals.totals.passingYards)}</p>
              </div>
              <div className="stat">
                <h3>Pass TD</h3>
                <p>{formatStatValue(liveStatTotals.totals.passingTds)}</p>
              </div>
              <div className="stat">
                <h3>Rush Yds</h3>
                <p>{formatStatValue(liveStatTotals.totals.rushingYards)}</p>
              </div>
              <div className="stat">
                <h3>Rush TD</h3>
                <p>{formatStatValue(liveStatTotals.totals.rushingTds)}</p>
              </div>
              <div className="stat">
                <h3>Receptions</h3>
                <p>{formatStatValue(liveStatTotals.totals.receptions)}</p>
              </div>
              <div className="stat">
                <h3>Rec Yds</h3>
                <p>{formatStatValue(liveStatTotals.totals.receivingYards)}</p>
              </div>
              <div className="stat">
                <h3>Rec TD</h3>
                <p>{formatStatValue(liveStatTotals.totals.receivingTds)}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="section-heading">Season Breakdown</h3>
          <p className="section-caption">Year-over-year performance with advanced splits.</p>
          <div className="tablewrap player-profile__table">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Games</th>
                  <th>Total</th>
                  <th>Avg</th>
                  <th>High</th>
                  <th>Best Week</th>
                  <th>20+</th>
                  <th aria-label="Season drilldown">Details</th>
                </tr>
              </thead>
              <tbody>
                {seasonsToDisplay.map((season) => {
                  const expanded = Boolean(expandedSeasons[season.season]);
                  const detailId = `season-${season.season}-weeks`;
                  return (
                    <Fragment key={season.season}>
                      <tr>
                        <td>{season.season}</td>
                        <td>{season.games}</td>
                        <td>{formatNumber(season.totalPoints)}</td>
                        <td>{formatNumber(season.avgPoints)}</td>
                        <td>{formatNumber(season.maxPoints)}</td>
                        <td>{season.bestWeek ? `W${season.bestWeek}` : "—"}</td>
                        <td>{season.aboveThreshold}</td>
                        <td>
                          <button
                            type="button"
                            className="btn text-xs"
                            onClick={() =>
                              setExpandedSeasons((prev) => ({
                                ...prev,
                                [season.season]: !prev[season.season],
                              }))
                            }
                            aria-expanded={expanded}
                            aria-controls={detailId}
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={8}>
                            <div id={detailId} className="tablewrap player-profile__table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Week</th>
                                    <th>Pass Yds</th>
                                    <th>Pass TD</th>
                                    <th>Rush Yds</th>
                                    <th>Rush TD</th>
                                    <th>Rec</th>
                                    <th>Rec Yds</th>
                                    <th>Rec TD</th>
                                    <th>Opponent</th>
                                    <th>Team</th>
                                    <th>Started</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {season.weeks.length ? (
                                    season.weeks.map((week) => (
                                      <tr key={`season-${season.season}-week-${week.week}`}>
                                        <td>W{week.week}</td>
                                        <td>{formatStatValue(week.passingYards)}</td>
                                        <td>{formatStatValue(week.passingTds)}</td>
                                        <td>{formatStatValue(week.rushingYards)}</td>
                                        <td>{formatStatValue(week.rushingTds)}</td>
                                        <td>{formatStatValue(week.receptions)}</td>
                                        <td>{formatStatValue(week.receivingYards)}</td>
                                        <td>{formatStatValue(week.receivingTds)}</td>
                                        <td>{week.opponent ?? "—"}</td>
                                        <td>{week.team ?? "—"}</td>
                                        <td>
                                          {week.started === null
                                            ? "—"
                                            : week.started
                                              ? "Yes"
                                              : "No"}
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={11} className="text-sm text-muted">
                                        No weekly stats available.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="section-heading">Historical Trend</h3>
          <p className="section-caption">Total fantasy points across seasons.</p>
          <PlayerTrendChart data={seasonsToDisplay} />
        </div>

        <div>
          <h3 className="section-heading">Milestones & Records</h3>
          <p className="section-caption">Career highs, streaks, and accolades.</p>
          <div className="player-profile__milestones">
            <div className="stat">
              <h3>Highest Game Score</h3>
              <p>
                {profile.milestones.bestGame
                  ? `${formatNumber(profile.milestones.bestGame.points)} pts (W${profile.milestones.bestGame.week}, ${profile.milestones.bestGame.season})`
                  : "—"}
              </p>
            </div>
            <div className="stat">
              <h3>Longest 20+ Pt Streak</h3>
              <p>
                {profile.milestones.longestHighScoreStreak.length
                  ? `${profile.milestones.longestHighScoreStreak.length} games`
                  : "—"}
              </p>
            </div>
            <div className="stat">
              <h3>Best Season</h3>
              <p>
                {profile.milestones.bestSeason
                  ? `${profile.milestones.bestSeason.season} (${formatNumber(profile.milestones.bestSeason.totalPoints)} pts)`
                  : "—"}
              </p>
            </div>
            <div className="stat">
              <h3>Awards</h3>
              <p>
                {profile.milestones.awards.length
                  ? profile.milestones.awards.join(", ")
                  : "No awards logged"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div className="modal-backdrop" aria-hidden="false">
      <div
        ref={modalRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <div className="modal-header__title">
            {playerName ? (
              <PlayerHeadshot
                playerId={profile?.playerId}
                playerName={playerName}
                className="player-profile__headshot"
              />
            ) : null}
            <div>
              <p className="modal-kicker">Player Profile</p>
              <h2 id={titleId} className="modal-title">
                {playerName}
              </h2>
            </div>
          </div>
          <div className="modal-header__actions">
            <Link to={`/player/${encodeURIComponent(playerName)}`} className="btn" onClick={onClose}>
              Full Profile
            </Link>
            <button
              ref={closeButtonRef}
              type="button"
              className="btn"
              onClick={onClose}
              aria-label="Close player profile"
            >
              Close
            </button>
          </div>
        </header>
        <div className="modal-body">{content}</div>
      </div>
      <button type="button" className="modal-backdrop__close" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
