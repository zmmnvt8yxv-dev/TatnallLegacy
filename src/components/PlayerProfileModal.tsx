import { useEffect, useId, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PlayerProfileContent } from "./PlayerProfileContent";

type PlayerProfileModalProps = {
  isOpen: boolean;
  playerName: string | null;
  onClose: () => void;
};

export function PlayerProfileModal({ isOpen, playerName, onClose }: PlayerProfileModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const titleId = useId();

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

  const initials =
    playerName
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2) ?? "";

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
          <div className="modal-header__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigate(`/player/${encodeURIComponent(playerName)}`);
                onClose();
              }}
            >
              Full profile
            </button>
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
        <div className="modal-body">
          <PlayerProfileContent playerName={playerName} />
        </div>
      </div>
      <button type="button" className="modal-backdrop__close" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
