import { useMemo, useState } from "react";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";
import { PlayerName } from "../components/PlayerName";
import { selectDraftPicks } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";
import { useSeasonSelection } from "../hooks/useSeasonSelection";

export function DraftSection() {
  const { year } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState("round");
  const [selectedRound, setSelectedRound] = useState("All Rounds");
  const draftRows = useMemo(() => (season ? selectDraftPicks(season) : []), [season]);
  const rounds = useMemo(
    () =>
      Array.from(new Set(draftRows.map((row) => row.round).filter((round) => round > 0))).sort(
        (a, b) => a - b,
      ),
    [draftRows],
  );
  const normalizedSearch = searchText.trim().toLowerCase();
  const activeRound = rounds.includes(Number.parseInt(selectedRound, 10))
    ? Number.parseInt(selectedRound, 10)
    : null;
  const filteredRows = useMemo(() => {
    const filtered = draftRows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        row.player.toLowerCase().includes(normalizedSearch) ||
        row.team.toLowerCase().includes(normalizedSearch) ||
        row.manager.toLowerCase().includes(normalizedSearch);
      const matchesRound = activeRound == null || row.round === activeRound;
      return matchesSearch && matchesRound;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "pick":
          return a.pick - b.pick;
        case "player":
          return a.player.localeCompare(b.player);
        case "team":
          return a.team.localeCompare(b.team);
        case "manager":
          return a.manager.localeCompare(b.manager);
        case "round":
        default:
          return a.round - b.round;
      }
    });

    return sorted;
  }, [activeRound, draftRows, normalizedSearch, sortKey]);

  if (status === "loading") {
    return <LoadingSection title="Draft Results" subtitle="Loading draft selections…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell
        id="draft"
        title="Draft Results"
        subtitle="Sortable board with round-by-round results."
      >
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      id="draft"
      title="Draft Results"
      subtitle="Sortable board with round-by-round results."
      actions={
        <>
          <label htmlFor="draftSort" className="text-sm text-muted">
            Sort:
          </label>
          <select
            id="draftSort"
            aria-label="Sort draft table"
            className="input"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            <option value="round">Round</option>
            <option value="pick">Pick</option>
            <option value="player">Player</option>
            <option value="team">Team</option>
            <option value="manager">Manager</option>
          </select>
          <label htmlFor="draftRound" className="text-sm text-muted">
            Round:
          </label>
          <select
            id="draftRound"
            aria-label="Filter by round"
            className="input"
            value={selectedRound}
            onChange={(event) => setSelectedRound(event.target.value)}
          >
            <option value="All Rounds">All Rounds</option>
            {rounds.map((round) => (
              <option key={round} value={String(round)}>
                Round {round}
              </option>
            ))}
          </select>
          <input
            id="draftSearch"
            type="search"
            placeholder="Filter by player/team…"
            aria-label="Filter draft results"
            className="input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </>
      }
    >
      <TableShell id="draftWrap">
        <table>
          <thead>
            <tr>
              <th>
                <button type="button" className="table-sort" aria-sort="ascending">
                  Round
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" aria-sort="none">
                  Pick
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" aria-sort="none">
                  Player
                </button>
              </th>
              <th>NFL</th>
              <th>
                <button type="button" className="table-sort" aria-sort="none">
                  Team
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" aria-sort="none">
                  Manager
                </button>
              </th>
              <th>Keeper</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-sm text-muted">
                  No draft picks available for this season yet.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={`${row.round}-${row.pick}-${row.team}-${row.player}`}>
                  <td>{row.round || "—"}</td>
                  <td>{row.pick || "—"}</td>
                  <td>
                    <PlayerName name={row.player} />
                  </td>
                  <td>{row.nflTeam}</td>
                  <td>{row.team}</td>
                  <td>{row.manager}</td>
                  <td>{row.keeper ? "Yes" : "No"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>
    </SectionShell>
  );
}
