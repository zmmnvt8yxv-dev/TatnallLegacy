import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { usePlayerProfile } from "../components/PlayerProfileProvider";
import { selectTransactionFilters, selectTransactions, selectTransactionWeeks } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";
import { useSeasonSelection } from "../hooks/useSeasonSelection";

export function TransactionsSection() {
  const { year } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
  const { openProfile } = usePlayerProfile();
  const [searchText, setSearchText] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("All Weeks");
  const [selectedFilter, setSelectedFilter] = useState("All Transactions");
  const [sortOrder] = useState("recent");
  const transactionWeeks = useMemo(
    () => (season ? selectTransactionWeeks(season) : []),
    [season],
  );
  const transactionFilters = useMemo(
    () => (season ? selectTransactionFilters(season) : []),
    [season],
  );
  const transactions = useMemo(() => (season ? selectTransactions(season) : []), [season]);
  const activeWeek = transactionWeeks.includes(selectedWeek)
    ? selectedWeek
    : transactionWeeks[0] ?? "All Weeks";
  const activeFilter = transactionFilters.includes(selectedFilter)
    ? selectedFilter
    : transactionFilters[0] ?? "All Transactions";
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter((transaction) => {
      const matchesWeek = activeWeek === "All Weeks" || transaction.timestamp === activeWeek;
      const matchesFilter =
        activeFilter === "All Transactions" || transaction.type === activeFilter;
      const matchesSearch =
        !normalizedSearch ||
        transaction.team.toLowerCase().includes(normalizedSearch) ||
        transaction.player.toLowerCase().includes(normalizedSearch) ||
        transaction.type.toLowerCase().includes(normalizedSearch) ||
        transaction.detail.toLowerCase().includes(normalizedSearch);
      return matchesWeek && matchesFilter && matchesSearch;
    });

    if (sortOrder === "recent") {
      return [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    return filtered;
  }, [activeFilter, activeWeek, normalizedSearch, sortOrder, transactions]);

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
          <select
            id="txnWeekFilter"
            aria-label="Week filter"
            className="input"
            value={activeWeek}
            onChange={(event) => setSelectedWeek(event.target.value)}
          >
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
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </>
      }
    >
      <div className="filter-row" role="group" aria-label="Transaction filters">
        {transactionFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`filter-pill${filter === activeFilter ? " is-active" : ""}`}
            onClick={() => setSelectedFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      {filteredTransactions.length === 0 ? (
        <p className="text-sm text-muted">No transactions have been logged for this season yet.</p>
      ) : (
        <div className="transaction-list">
          {filteredTransactions.map((transaction, index) => (
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
                {transaction.player === "—" ? (
                  <p className="transaction-card__player">{transaction.player}</p>
                ) : (
                  <button
                    type="button"
                    className="transaction-card__player player-link"
                    onClick={() => openProfile(transaction.player)}
                  >
                    {transaction.player}
                  </button>
                )}
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
