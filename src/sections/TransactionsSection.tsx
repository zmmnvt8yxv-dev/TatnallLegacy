import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LoadingSection } from "../components/LoadingSection";
import { PlayerName } from "../components/PlayerName";
import { SectionShell } from "../components/SectionShell";
import {
  selectTradeSummaries,
  selectTransactionFilters,
  selectTransactions,
  selectTransactionWeeks,
} from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";
import { useSeasonSelection } from "../hooks/useSeasonSelection";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

export function TransactionsSection() {
  const { year } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
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
  const trades = useMemo(() => (season ? selectTradeSummaries(season) : []), [season]);
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

  const formatTradeTimestamp = (timestamp: number | null) => {
    if (!timestamp) {
      return "Date unavailable";
    }
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return formatter.format(new Date(timestamp));
  };

  const formatPlayerMeta = (position: string | null, nflTeam: string | null) => {
    const parts = [position, nflTeam].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };

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
      {trades.length > 0 ? (
        <Card className="trade-card">
          <CardHeader>
            <CardTitle>Trade Spotlight</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="trade-grid">
              {trades.map((trade) => (
                <article key={trade.id} className="trade-card__entry">
                  <div className="trade-card__meta">
                    <p className="trade-card__week">
                      {trade.week ? `Week ${trade.week}` : "Week TBD"}
                    </p>
                    <p className="trade-card__date">{formatTradeTimestamp(trade.executed)}</p>
                    {trade.status ? (
                      <span className="trade-card__status">{trade.status}</span>
                    ) : null}
                  </div>
                  <div className="trade-card__teams">
                    {trade.teams.map((team) => (
                      <div key={`${trade.id}-${team.team}`} className="trade-card__team">
                        <div className="trade-card__team-header">
                          <div>
                            <p className="trade-card__team-name">{team.team}</p>
                            {team.rosterId != null ? (
                              <p className="trade-card__roster">Roster {team.rosterId}</p>
                            ) : null}
                          </div>
                          {team.score != null ? (
                            <span className="trade-card__score">Value {team.score}</span>
                          ) : null}
                        </div>
                        <div className="trade-card__assets">
                          <div>
                            <p className="trade-card__label">Received</p>
                            {team.playersIn.length || team.picksIn.length ? (
                              <ul className="trade-card__list">
                                {team.playersIn.map((player) => (
                                  <li key={`${trade.id}-${team.team}-in-${player.id}`}>
                                    <PlayerName name={player.name} />
                                    {formatPlayerMeta(player.position, player.nflTeam) ? (
                                      <span className="trade-card__player-meta">
                                        {formatPlayerMeta(player.position, player.nflTeam)}
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                                {team.picksIn.map((pick, pickIndex) => (
                                  <li key={`${trade.id}-${team.team}-pick-in-${pickIndex}`}>
                                    <span className="trade-card__pick">{pick}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted">No players listed</p>
                            )}
                          </div>
                          <div>
                            <p className="trade-card__label">Sent</p>
                            {team.playersOut.length || team.picksOut.length ? (
                              <ul className="trade-card__list">
                                {team.playersOut.map((player) => (
                                  <li key={`${trade.id}-${team.team}-out-${player.id}`}>
                                    <PlayerName name={player.name} />
                                    {formatPlayerMeta(player.position, player.nflTeam) ? (
                                      <span className="trade-card__player-meta">
                                        {formatPlayerMeta(player.position, player.nflTeam)}
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                                {team.picksOut.map((pick, pickIndex) => (
                                  <li key={`${trade.id}-${team.team}-pick-out-${pickIndex}`}>
                                    <span className="trade-card__pick">{pick}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted">No players listed</p>
                            )}
                          </div>
                        </div>
                        {team.netPoints != null ? (
                          <p className="trade-card__net">
                            Net points impact: {team.netPoints.toFixed(1)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
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
                <PlayerName name={transaction.player} className="transaction-card__player" />
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
