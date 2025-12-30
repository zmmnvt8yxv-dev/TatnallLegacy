import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

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
          <div id="recordSummary" className="summary-cards grid-4" />
        </CardContent>
      </Card>

      <div className="filter-row" role="group" aria-label="Team filters">
        <label className="filter-pill">
          <input type="checkbox" id="filterChamp" /> Champions
        </label>
        <label className="filter-pill">
          <input type="checkbox" id="filterPlayoff" /> Top 4
        </label>
      </div>

      <div id="recordChips" className="record-chips" />
      <div id="teamsWrap" className="record-grid" />
    </section>
  );
}
