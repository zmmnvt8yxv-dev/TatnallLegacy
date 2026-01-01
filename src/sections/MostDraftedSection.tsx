import { useMemo } from "react";
import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";
import { selectNflTeams } from "../data/selectors";
import { useNflTeamsData } from "../hooks/useNflTeamsData";

export function MostDraftedSection() {
  const { status, teams } = useNflTeamsData();
  const teamOptions = useMemo(() => (teams ? selectNflTeams(teams) : []), [teams]);

  return (
    <SectionShell
      id="mostDrafted"
      title="Most Drafted Players (Across Seasons)"
      actions={
        <>
          <label htmlFor="mdTeamFilter" className="text-sm text-muted">
            Current team:
          </label>
          <select
            id="mdTeamFilter"
            aria-label="Filter by current team"
            className="input"
            disabled={status !== "ready"}
          >
            <option value="">All teams</option>
            {teamOptions.map((team) => (
              <option key={team.abbr} value={team.abbr}>
                {team.abbr} — {team.name}
              </option>
            ))}
          </select>
          <input
            id="mdSearch"
            type="search"
            placeholder="Filter by player…"
            aria-label="Filter most-drafted players"
            className="input"
          />
        </>
      }
    >
      <TableShell id="mostDraftedWrap" />
    </SectionShell>
  );
}
