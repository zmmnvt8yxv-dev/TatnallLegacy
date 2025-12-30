import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

const standingsHighlights = [
  { label: "Best Record", value: "Midnight Riders (7-1)" },
  { label: "Most Points", value: "Neon Knights (1,014)" },
  { label: "Least Points Allowed", value: "Golden State (742)" },
  { label: "Longest Streak", value: "Emerald City (W4)" },
];

const standings = [
  {
    rank: 1,
    team: "Midnight Riders",
    owner: "A. Johnson",
    record: "7-1",
    pointsFor: 1012.4,
    pointsAgainst: 812.8,
    streak: "W5",
    badges: ["Division A", "Clinched"],
  },
  {
    rank: 2,
    team: "Neon Knights",
    owner: "T. Alvarez",
    record: "6-2",
    pointsFor: 1014.0,
    pointsAgainst: 845.1,
    streak: "W2",
    badges: ["Division A"],
  },
  {
    rank: 3,
    team: "Emerald City",
    owner: "K. Rivera",
    record: "6-2",
    pointsFor: 986.3,
    pointsAgainst: 811.4,
    streak: "W4",
    badges: ["Division B"],
  },
  {
    rank: 4,
    team: "Lightning Bolts",
    owner: "M. Chen",
    record: "5-3",
    pointsFor: 948.2,
    pointsAgainst: 904.6,
    streak: "L1",
    badges: ["Division B"],
  },
  {
    rank: 5,
    team: "Monarchs",
    owner: "S. Patel",
    record: "4-4",
    pointsFor: 902.7,
    pointsAgainst: 918.3,
    streak: "W1",
    badges: ["Wildcard"],
  },
  {
    rank: 6,
    team: "Ironclads",
    owner: "R. Gomez",
    record: "4-4",
    pointsFor: 876.5,
    pointsAgainst: 910.9,
    streak: "L2",
    badges: ["Wildcard"],
  },
];

const filters = [
  "Division A",
  "Division B",
  "Clinched",
  "Wildcard Race",
  "Risers",
  "Sliders",
];

export function TeamsSection() {
  return (
    <section id="teams" className="panel" aria-labelledby="teams-title">
      <div className="section-header">
        <div className="space-y-1">
          <h2 id="teams-title" className="text-xl font-semibold">
            Teams
          </h2>
          <p className="section-subtitle">Season records, ranks, and quick highlights.</p>
        </div>
        <div className="controls row">
          <label className="sr-only" htmlFor="teamSearch">
            Search teams
          </label>
          <input
            id="teamSearch"
            type="search"
            placeholder="Search team or owner…"
            aria-label="Search teams or owners"
            className="input"
          />
          <label htmlFor="teamSort" className="text-sm text-muted">
            Sort:
          </label>
          <select id="teamSort" aria-label="Sort teams" className="input">
            <option value="final_rank">Standings</option>
            <option value="winPct">Win %</option>
            <option value="points_for">Points For</option>
            <option value="points_against">Points Against</option>
            <option value="regular_season_rank">Regular Season Rank</option>
            <option value="team_name">Team Name (A–Z)</option>
            <option value="owner">Owner (A–Z)</option>
          </select>
          <div className="toggle-group" role="group" aria-label="Team view">
            <button className="btn toggle is-active" type="button" data-team-view="grid">
              Cards
            </button>
            <button className="btn toggle" type="button" data-team-view="list">
              Compact
            </button>
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Standings Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid-4">
            {standingsHighlights.map((item) => (
              <div key={item.label} className="highlight-card">
                <p className="highlight-card__label">{item.label}</p>
                <p className="highlight-card__value">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="filter-row" role="group" aria-label="Team filters">
        {filters.map((filter) => (
          <button key={filter} type="button" className="filter-pill">
            {filter}
          </button>
        ))}
      </div>

      <div className="standings-grid">
        {standings.map((team) => (
          <article key={team.team} className="standings-card">
            <div className="standings-card__header">
              <div>
                <p className="standings-card__rank">#{team.rank}</p>
                <h3 className="standings-card__team">{team.team}</h3>
                <p className="standings-card__owner">{team.owner}</p>
              </div>
              <div className="standings-card__record">
                <span>{team.record}</span>
                <span className="standings-card__streak">{team.streak}</span>
              </div>
            </div>
            <div className="standings-card__stats">
              <div>
                <p className="standings-card__label">Points For</p>
                <p className="standings-card__value">{team.pointsFor.toFixed(1)}</p>
              </div>
              <div>
                <p className="standings-card__label">Points Against</p>
                <p className="standings-card__value">{team.pointsAgainst.toFixed(1)}</p>
              </div>
            </div>
            <div className="standings-card__badges">
              {team.badges.map((badge) => (
                <span key={badge} className="badge">
                  {badge}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
