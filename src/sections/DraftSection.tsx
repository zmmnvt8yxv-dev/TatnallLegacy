import { useMemo } from "react";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";
import { selectDraftPicks } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";

export function DraftSection() {
  const { status, season, error } = useSeasonData();
  const draftRows = useMemo(() => (season ? selectDraftPicks(season) : []), [season]);

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
          <select id="draftSort" aria-label="Sort draft table" className="input">
            <option value="round">Round</option>
            <option value="pick">Pick</option>
            <option value="player">Player</option>
            <option value="team">Team</option>
            <option value="manager">Manager</option>
          </select>
          <input
            id="draftSearch"
            type="search"
            placeholder="Filter by player/team…"
            aria-label="Filter draft results"
            className="input"
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
            {draftRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-sm text-muted">
                  No draft picks available for this season yet.
                </td>
              </tr>
            ) : (
              draftRows.map((row) => (
                <tr key={`${row.round}-${row.pick}-${row.team}-${row.player}`}>
                  <td>{row.round || "—"}</td>
                  <td>{row.pick || "—"}</td>
                  <td>{row.player}</td>
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
