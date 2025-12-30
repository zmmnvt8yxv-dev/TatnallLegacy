import { SectionShell } from "../components/SectionShell";
import { TableShell } from "../components/TableShell";

const draftRows = [
  {
    round: 1,
    pick: 1,
    player: "Breece Hall",
    position: "RB",
    team: "Midnight Riders",
    manager: "A. Johnson",
    value: 92,
  },
  {
    round: 1,
    pick: 2,
    player: "Justin Jefferson",
    position: "WR",
    team: "Neon Knights",
    manager: "T. Alvarez",
    value: 90,
  },
  {
    round: 1,
    pick: 3,
    player: "Ja'Marr Chase",
    position: "WR",
    team: "Emerald City",
    manager: "K. Rivera",
    value: 88,
  },
  {
    round: 1,
    pick: 4,
    player: "Christian McCaffrey",
    position: "RB",
    team: "Lightning Bolts",
    manager: "M. Chen",
    value: 87,
  },
  {
    round: 1,
    pick: 5,
    player: "Josh Allen",
    position: "QB",
    team: "Monarchs",
    manager: "S. Patel",
    value: 86,
  },
  {
    round: 1,
    pick: 6,
    player: "Tyreek Hill",
    position: "WR",
    team: "Ironclads",
    manager: "R. Gomez",
    value: 85,
  },
];

export function DraftSection() {
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
            <option value="value">Draft Value</option>
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
              <th>Pos</th>
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
              <th>
                <button type="button" className="table-sort" aria-sort="none">
                  Value
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {draftRows.map((row) => (
              <tr key={`${row.round}-${row.pick}`}>
                <td>{row.round}</td>
                <td>{row.pick}</td>
                <td>{row.player}</td>
                <td>{row.position}</td>
                <td>{row.team}</td>
                <td>{row.manager}</td>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </SectionShell>
  );
}
