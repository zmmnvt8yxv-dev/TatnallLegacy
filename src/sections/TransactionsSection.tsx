import { SectionShell } from "../components/SectionShell";

const transactionWeeks = ["All Weeks", "Week 6", "Week 7", "Week 8"];

const transactionFilters = ["Waivers", "Trades", "Free Agency", "IR Moves", "Completed", "Pending"];

const transactions = [
  {
    id: "txn-1",
    team: "Neon Knights",
    type: "Trade",
    player: "C. Lamb",
    detail: "Sent for 2025 2nd-round pick",
    timestamp: "Today · 1:12 PM",
  },
  {
    id: "txn-2",
    team: "Monarchs",
    type: "Waiver",
    player: "Z. Moss",
    detail: "Claimed · $18 FAAB",
    timestamp: "Yesterday · 9:03 AM",
  },
  {
    id: "txn-3",
    team: "Midnight Riders",
    type: "Free Agency",
    player: "K. Bourne",
    detail: "Added to bench",
    timestamp: "Yesterday · 7:41 AM",
  },
  {
    id: "txn-4",
    team: "Emerald City",
    type: "IR Move",
    player: "T. Pollard",
    detail: "Moved to IR",
    timestamp: "Tue · 5:22 PM",
  },
  {
    id: "txn-5",
    team: "Lightning Bolts",
    type: "Trade",
    player: "J. Hurts",
    detail: "Received for A. Jones + 2025 1st",
    timestamp: "Mon · 2:10 PM",
  },
];

export function TransactionsSection() {
  return (
    <SectionShell
      id="transactions"
      title="Transactions"
      subtitle="Track roster churn with search and quick filters."
      actions={
        <>
          <label htmlFor="txnWeekFilter" className="text-sm text-muted">
            Week:
          </label>
          <select id="txnWeekFilter" aria-label="Week filter" className="input">
            {transactionWeeks.map((week) => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
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
      <div className="filter-row" role="group" aria-label="Transaction filters">
        {transactionFilters.map((filter) => (
          <button key={filter} type="button" className="filter-pill">
            {filter}
          </button>
        ))}
      </div>
      <div className="transaction-list">
        {transactions.map((transaction) => (
          <article key={transaction.id} className="transaction-card">
            <div>
              <p className="transaction-card__team">{transaction.team}</p>
              <p className="transaction-card__player">{transaction.player}</p>
              <p className="transaction-card__detail">{transaction.detail}</p>
            </div>
            <div className="transaction-card__meta">
              <span className="transaction-card__type">{transaction.type}</span>
              <span className="transaction-card__time">{transaction.timestamp}</span>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
