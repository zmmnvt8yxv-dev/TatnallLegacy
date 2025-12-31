import { useState } from "react";
import { getPlayerInitials, getSleeperHeadshotUrl } from "../lib/playerAssets";

type PlayerHeadshotProps = {
  playerId?: string | null;
  playerName: string;
  className?: string;
};

export function PlayerHeadshot({ playerId, playerName, className }: PlayerHeadshotProps) {
  const [hasError, setHasError] = useState(false);
  const initials = getPlayerInitials(playerName);

  if (!playerId || hasError) {
    return (
      <div className={["player-avatar", className].filter(Boolean).join(" ")}>
        <span className="player-avatar__initials">{initials || "?"}</span>
      </div>
    );
  }

  return (
    <div className={["player-avatar player-avatar--photo", className].filter(Boolean).join(" ")}>
      <img
        src={getSleeperHeadshotUrl(playerId)}
        alt={`${playerName} headshot`}
        className="player-avatar__image"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
