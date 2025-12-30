import { SectionShell } from "../components/SectionShell";

export function LiveSection() {
  return (
    <>
      <SectionShell id="live" title="Live">
        <div id="liveWrap" />
      </SectionShell>
      <section
        id="liveMatchup"
        className="panel"
        aria-labelledby="liveMatchup-title"
        style={{ display: "none" }}
      >
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
        <div className="tablewrap" id="liveMatchupWrap" />
      </section>
    </>
  );
}
