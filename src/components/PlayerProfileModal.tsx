import { useEffect, useMemo, useRef, useState } from "react";
import { selectPlayerProfile } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";

const NFL_TEAM_LOGO_BASE = "https://static.www.nfl.com/league/api/clubs/logos";

function formatNumber(value: number): string {
  return value.toFixed(1);
}

function MiniSparkline({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data);
  return (
    <div className="sparkline" role="img" aria-label={`${label} trend`}>
      {data.map((value, index) => (
        <span
          key={`${label}-${index}`}
          className="sparkline__bar"
          style={{ height: `${Math.max((value / (max || 1)) * 100, 12)}%` }}
        />
      ))}
    </div>
  );
}

type PlayerProfileModalProps = {
  isOpen: boolean;
  playerName: string | null;
  onClose: () => void;
};

export function PlayerProfileModal({ isOpen, playerName, onClose }: PlayerProfileModalProps) {
  const { status, seasons } = useAllSeasonsData();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
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
  }, [isOpen, onClose]);

  if (!isOpen || !playerName) {
    return null;
  }

  const titleId = "player-profile-title";
  const initials =
    playerName
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2) ?? "";

  const content = (() => {
    if (status === "loading") {
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

    return (
      <div className="space-y-6">
        <div className="player-profile__meta">
          <div>
            <p className="player-profile__label">NFL Teams</p>
            <div className="player-profile__value player-profile__teams">
              {profile.nflTeams.length ? (
                profile.nflTeams.map((team) => (
                  <span key={team} className="team-pill">
                    {!logoFallback[team] ? (
                      <img
                        src={`${NFL_TEAM_LOGO_BASE}/${team}.svg`}
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
            <p className="player-profile__label">Fantasy Teams</p>
            <p className="player-profile__value">
              {profile.fantasyTeams.length ? profile.fantasyTeams.join(", ") : "—"}
            </p>
          </div>
          <div>
            <p className="player-profile__label">Seasons Tracked</p>
            <p className="player-profile__value">{profile.seasons.length}</p>
          </div>
        </div>

        <div className="player-profile__stats">
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
          <MiniSparkline data={profile.pointsTrend} label={`${profile.player} points`} />
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
            <div className="player-avatar" aria-hidden="true">
              <span className="player-avatar__initials">{initials || "?"}</span>
            </div>
            <div>
              <p className="modal-kicker">Player Profile</p>
              <h2 id={titleId} className="modal-title">
                {playerName}
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close player profile"
          >
            Close
          </button>
        </header>
        <div className="modal-body">{content}</div>
      </div>
      <button type="button" className="modal-backdrop__close" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
