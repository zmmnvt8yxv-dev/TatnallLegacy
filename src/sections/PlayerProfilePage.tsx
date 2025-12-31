import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PlayerProfileContent } from "../components/PlayerProfileContent";
import { SectionShell } from "../components/SectionShell";

export function PlayerProfilePage() {
  const navigate = useNavigate();
  const { playerName } = useParams();
  const decodedName = playerName ? decodeURIComponent(playerName) : "";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [decodedName]);

  if (!decodedName) {
    return (
      <SectionShell
        id="playerProfile"
        title="Player Profile"
        subtitle="Select a player to view their profile."
        actions={
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Back
          </button>
        }
      >
        <p className="text-sm text-muted">No player selected.</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      id="playerProfile"
      title={decodedName}
      subtitle="Full profile view with multi-season stats."
      actions={
        <div className="row">
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate("/")}
          >
            Return to dashboard
          </button>
        </div>
      }
    >
      <div className="player-profile-page">
        <PlayerProfileContent playerName={decodedName} />
      </div>
    </SectionShell>
  );
}
