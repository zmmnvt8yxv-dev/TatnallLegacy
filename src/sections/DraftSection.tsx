import { SectionShell } from "../components/SectionShell";

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
      <div className="tablewrap" id="draftWrap" />
    </SectionShell>
  );
}
