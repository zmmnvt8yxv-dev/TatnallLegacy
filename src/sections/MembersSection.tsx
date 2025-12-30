import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";

export function MembersSection() {
  return (
    <SectionShell
      id="members"
      title="Member Summary (All Years)"
      actions={
        <>
          <label htmlFor="memberSelect" className="text-sm text-muted">
            Member:
          </label>
          <select id="memberSelect" aria-label="Member" className="input" />
        </>
      }
    >
      <div id="memberSummary" className="grid-4" />
      <TableShell id="memberTableWrap" style={{ display: "none" }} />
    </SectionShell>
  );
}
