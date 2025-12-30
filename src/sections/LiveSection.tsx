import { SectionCard } from "../components/SectionCard";
import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";

export function LiveSection() {
  return (
    <>
      <SectionShell id="live" title="Live">
        <div id="liveWrap" />
      </SectionShell>
      <SectionCard id="liveMatchup" aria-labelledby="liveMatchup-title" style={{ display: "none" }}>
        <div className="section-header">
          <div className="space-y-1">
            <h2 id="liveMatchup-title" className="text-xl font-semibold">
              Matchup
            </h2>
          </div>
          <div className="controls row" style={{ gap: "0.5rem" }}>
            <button id="liveBackBtn" className="btn" type="button">
              ← Back to Live
            </button>
            <div id="liveMatchupMeta" className="muted" />
          </div>
        </div>
        <TableShell id="liveMatchupWrap" />
      </SectionCard>
    </>
  );
}
