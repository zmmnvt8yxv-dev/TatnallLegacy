import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";

export function DraftSection() {
  return (
    <SectionShell
      id="draft"
      title="Draft Results"
      actions={
        <input
          id="draftSearch"
          type="search"
          placeholder="Filter by player/team…"
          aria-label="Filter draft results"
          className="input"
        />
      }
    >
      <TableShell id="draftWrap" />
    </SectionShell>
  );
}
