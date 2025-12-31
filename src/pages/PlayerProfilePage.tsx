import { useNavigate, useParams } from "react-router-dom";
import { PlayerProfileContent } from "../components/PlayerProfileContent";

export function PlayerProfilePage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const playerName = name ? decodeURIComponent(name) : "";

  if (!playerName) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Select a player to view their profile.</p>
        <button type="button" className="btn" onClick={() => navigate("/")}>
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Player Profile</p>
          <h2 className="text-2xl font-semibold text-foreground">{playerName}</h2>
        </div>
        <button type="button" className="btn" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
      <PlayerProfileContent playerName={playerName} />
    </div>
  );
}
