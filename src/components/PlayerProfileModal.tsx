import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { selectPlayerProfile } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";
import { getNflTeamLogoUrl } from "../lib/playerAssets";
import { PlayerHeadshot } from "./PlayerHeadshot";
import { PlayerTrendChart } from "./PlayerTrendChart";

function formatNumber(value: number): string {
  return value.toFixed(1);
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
  const { status, seasons, loadAllSeasons } = useAllSeasonsData();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [metricView, setMetricView] = useState("ppr");
  const [logoFallback, setLogoFallback] = useState<Record<string, boolean>>({});
  const profile = useMemo(() => {
    if (!playerName || status !== "ready") {
      return null;
    }
    return selectPlayerProfile(seasons, playerName);
  }, [playerName, seasons, status]);

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
  }, [profile?.position]);

  useEffect(() => {
    if (!metricOptions.some((option) => option.id === metricView)) {
      setMetricView(metricOptions[0]?.id ?? "ppr");
    }
  }, [metricOptions, metricView]);

  const content = (() => {
    if (status === "loading" || status === "idle") {
      return <p className="text-sm text-muted">Loading player history…</p>;
    }
    if (status === "error") {
      return <p className="text-sm text-red-500">Unable to load player history.</p>;
    }
    if (!profile) {
      return (
        <p className="text-sm text-muted">
          No stats available yet. Try another player or season range.
        </p>
      );
    }

    const consistency = profile.totalGames
      ? Math.round((profile.aboveThreshold / profile.totalGames) * 100)
      : 0;
    const showScoring = metricView === "ppr" || metricView === "standard";
    const scoringLabel = metricView === "standard" ? "Standard points" : "PPR points";
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
            <p className="player-profile__value">{profile.seasons.length}</p>
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
            ? "Position-specific splits are not yet available for historical league data."
            : `Showing ${scoringLabel} derived from league scoring.`}
        </p>
      </div>

        <div className="player-profile__stats">
          {showScoring ? (
            <>
              <div className="stat">
                <h3>Total Points</h3>
                <p>{formatNumber(profile.totalPoints)}</p>
              </div>
              <div className="stat">
                <h3>Games Played</h3>
                <p>{profile.totalGames}</p>
              </div>
              <div className="stat">
                <h3>Avg Points</h3>
                <p>{formatNumber(profile.avgPoints)}</p>
              </div>
              <div className="stat">
                <h3>Peak Week</h3>
                <p>{formatNumber(profile.maxPoints)}</p>
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
            <p>{profile.aboveThreshold}</p>
          </div>
          <div className="stat">
            <h3>Consistency Rate</h3>
            <p>{consistency}%</p>
          </div>
          <div className="stat">
            <h3>Best Season Total</h3>
            <p>{formatNumber(Math.max(...profile.pointsTrend))}</p>
          </div>
        </div>

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
                </tr>
              </thead>
              <tbody>
                {profile.seasons.map((season) => (
                  <tr key={season.season}>
                    <td>{season.season}</td>
                    <td>{season.games}</td>
                    <td>{formatNumber(season.totalPoints)}</td>
                    <td>{formatNumber(season.avgPoints)}</td>
                    <td>{formatNumber(season.maxPoints)}</td>
                    <td>{season.bestWeek ? `W${season.bestWeek}` : "—"}</td>
                    <td>{season.aboveThreshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="section-heading">Historical Trend</h3>
          <p className="section-caption">Total fantasy points across seasons.</p>
          <PlayerTrendChart data={profile.seasons} />
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
