import { SectionShell } from "../components/SectionShell";

export function MostDraftedSection() {
  return (
    <SectionShell
      id="mostDrafted"
      title="Most Drafted Players (Across Seasons)"
      actions={
        <>
          <label htmlFor="mdTeamFilter" className="text-sm text-muted">
            Current team:
          </label>
          <select id="mdTeamFilter" aria-label="Filter by current team" className="input" />
          <input
            id="mdSearch"
            type="search"
            placeholder="Filter by player…"
            aria-label="Filter most-drafted players"
            className="input"
          />
        </>
      }
    >
      <div className="tablewrap" id="mostDraftedWrap" />
    </SectionShell>
  );
}
