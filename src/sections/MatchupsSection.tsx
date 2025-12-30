import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";

export function MatchupsSection() {
  return (
    <SectionShell
      id="matchups"
      title="Matchups"
      actions={
        <>
          <label htmlFor="weekFilter" className="text-sm text-muted">
            Week:
          </label>
          <select id="weekFilter" aria-label="Week filter" className="input" />
          <input
            id="matchupSearch"
            type="search"
            placeholder="Filter by team…"
            aria-label="Filter matchups"
            className="input"
          />
        </>
      }
    >
      <TableShell id="matchupsWrap" />
    </SectionShell>
  );
}
