import { useMemo } from "react";
import { motion } from "framer-motion";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { selectTransactionFilters, selectTransactions, selectTransactionWeeks } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";

export function TransactionsSection() {
  const { status, season, error } = useSeasonData();
  const transactionWeeks = useMemo(
    () => (season ? selectTransactionWeeks(season) : []),
    [season],
  );
  const transactionFilters = useMemo(
    () => (season ? selectTransactionFilters(season) : []),
    [season],
  );
  const transactions = useMemo(() => (season ? selectTransactions(season) : []), [season]);

  if (status === "loading") {
    return <LoadingSection title="Transactions" subtitle="Loading transaction log…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell
        id="transactions"
        title="Transactions"
        subtitle="Track roster churn with search and quick filters."
      >
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

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
      {transactions.length === 0 ? (
        <p className="text-sm text-muted">No transactions have been logged for this season yet.</p>
      ) : (
        <div className="transaction-list">
          {transactions.map((transaction, index) => (
            <motion.article
              key={transaction.id}
              className="transaction-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              whileHover={{ y: -3 }}
            >
              <div>
                <p className="transaction-card__team">{transaction.team}</p>
                <p className="transaction-card__player">{transaction.player}</p>
                <p className="transaction-card__detail">{transaction.detail}</p>
              </div>
              <div className="transaction-card__meta">
                <span className="transaction-card__type">{transaction.type}</span>
                <span className="transaction-card__time">{transaction.timestamp}</span>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
