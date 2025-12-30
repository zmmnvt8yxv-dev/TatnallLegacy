import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";

export function TransactionsSection() {
  return (
    <SectionShell
      id="transactions"
      title="Transactions"
      actions={
        <>
          <label htmlFor="txnWeekFilter" className="text-sm text-muted">
            Week:
          </label>
          <select id="txnWeekFilter" aria-label="Week filter" className="input" />
          <input
            id="txnSearch"
            type="search"
            placeholder="Filter by team/player/type…"
            aria-label="Filter transactions"
            className="input"
          />
        </>
      }
    >
      <TableShell id="txnsWrap" />
    </SectionShell>
  );
}
