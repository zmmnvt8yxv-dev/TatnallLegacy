import { SectionShell } from "../components/SectionShell";

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
      <div className="tablewrap" id="txnsWrap" />
    </SectionShell>
  );
}
