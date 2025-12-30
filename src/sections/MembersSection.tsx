import { useMemo } from "react";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";
import { selectMemberSummaries } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";

export function MembersSection() {
  const { status, season, error } = useSeasonData();
  const members = useMemo(() => (season ? selectMemberSummaries(season) : []), [season]);

  if (status === "loading") {
    return <LoadingSection title="Member Summary" subtitle="Loading member rollups…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell id="members" title="Member Summary (All Years)">
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      id="members"
      title="Member Summary (All Years)"
      actions={
        <>
          <label htmlFor="memberSelect" className="text-sm text-muted">
            Member:
          </label>
          <select id="memberSelect" aria-label="Member" className="input">
            <option value="all">All Members</option>
            {members.map((member) => (
              <option key={member.id} value={member.owner}>
                {member.owner}
              </option>
            ))}
          </select>
        </>
      }
    >
      {members.length === 0 ? (
        <p className="text-sm text-muted">No member data available for this season.</p>
      ) : (
        <>
          <div id="memberSummary" className="grid-4">
            {members.map((member) => (
              <div key={member.id} className="highlight-card">
                <p className="highlight-card__label">{member.owner}</p>
                <p className="highlight-card__value">{member.team}</p>
                <p className="text-xs text-muted">
                  Record {member.record} ·
                  {member.winPct != null ? ` ${(member.winPct * 100).toFixed(1)}% Win` : " Win % —"}
                </p>
              </div>
            ))}
          </div>
          <TableShell id="memberTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Team</th>
                  <th>Record</th>
                  <th>Win %</th>
                  <th>Points For</th>
                  <th>Points Against</th>
                  <th>Final Rank</th>
                  <th>Regular Season</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={`row-${member.id}`}>
                    <td>{member.owner}</td>
                    <td>{member.team}</td>
                    <td>{member.record}</td>
                    <td>{member.winPct != null ? (member.winPct * 100).toFixed(1) : "—"}</td>
                    <td>{member.pointsFor.toFixed(1)}</td>
                    <td>{member.pointsAgainst.toFixed(1)}</td>
                    <td>{member.finalRank ?? "—"}</td>
                    <td>{member.regularSeasonRank ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}
    </SectionShell>
  );
}
