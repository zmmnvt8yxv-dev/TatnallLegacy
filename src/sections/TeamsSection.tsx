import { useMemo, useState } from "react";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { selectStandings, selectStandingsFilters, selectStandingsHighlights } from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { useSeasonSelection } from "../hooks/useSeasonSelection";

export function TeamsSection() {
  const { year } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
  const [searchText, setSearchText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All Teams");
  const [sortKey, setSortKey] = useState("final_rank");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const standingsHighlights = useMemo(
    () => (season ? selectStandingsHighlights(season) : []),
    [season],
  );
  const standings = useMemo(() => (season ? selectStandings(season) : []), [season]);
  const filters = useMemo(() => (season ? selectStandingsFilters(season) : []), [season]);
  const activeFilter = filters.includes(selectedFilter) ? selectedFilter : filters[0] ?? "All Teams";
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredStandings = useMemo(() => {
    const filtered = standings.filter((team) => {
      const matchesSearch =
        !normalizedSearch ||
        team.team.toLowerCase().includes(normalizedSearch) ||
        team.owner.toLowerCase().includes(normalizedSearch);
      const matchesFilter =
        activeFilter === "All Teams" || team.badges.includes(activeFilter);
      return matchesSearch && matchesFilter;
    });

    const parseRecord = (record: string) => {
      const match = record.match(/(\d+)-(\d+)/);
      if (!match) {
        return null;
      }
      return { wins: Number.parseInt(match[1], 10), losses: Number.parseInt(match[2], 10) };
    };
    const winPct = (record: string) => {
      const parsed = parseRecord(record);
      if (!parsed) {
        return 0;
      }
      return parsed.wins / Math.max(parsed.wins + parsed.losses, 1);
    };

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "winPct":
          return winPct(b.record) - winPct(a.record);
        case "points_for":
          return b.pointsFor - a.pointsFor;
        case "points_against":
          return b.pointsAgainst - a.pointsAgainst;
        case "regular_season_rank":
        case "final_rank":
          return a.rank - b.rank;
        case "team_name":
          return a.team.localeCompare(b.team);
        case "owner":
          return a.owner.localeCompare(b.owner);
        default:
          return a.rank - b.rank;
      }
    });

    return sorted;
  }, [activeFilter, normalizedSearch, sortKey, standings]);

  if (status === "loading") {
    return <LoadingSection title="Teams" subtitle="Loading season standings…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell
        id="teams"
        title="Teams"
        subtitle="Season records, ranks, and quick highlights."
      >
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      id="teams"
      title="Teams"
      subtitle="Season records, ranks, and quick highlights."
      actions={
        <>
          <label className="sr-only" htmlFor="teamSearch">
            Search teams
          </label>
          <input
            id="teamSearch"
            type="search"
            placeholder="Search team or owner…"
            aria-label="Search teams or owners"
            className="input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <label htmlFor="teamSort" className="text-sm text-muted">
            Sort:
          </label>
          <select
            id="teamSort"
            aria-label="Sort teams"
            className="input"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            <option value="final_rank">Standings</option>
            <option value="winPct">Win %</option>
            <option value="points_for">Points For</option>
            <option value="points_against">Points Against</option>
            <option value="regular_season_rank">Regular Season Rank</option>
            <option value="team_name">Team Name (A–Z)</option>
            <option value="owner">Owner (A–Z)</option>
          </select>
          <div className="toggle-group" role="group" aria-label="Team view">
            <button
              className={`btn toggle ${viewMode === "grid" ? "is-active" : ""}`}
              type="button"
              data-team-view="grid"
              onClick={() => setViewMode("grid")}
            >
              Cards
            </button>
            <button
              className={`btn toggle ${viewMode === "list" ? "is-active" : ""}`}
              type="button"
              data-team-view="list"
              onClick={() => setViewMode("list")}
            >
              Compact
            </button>
          </div>
        </>
      }
    >
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

      <div className={`standings-grid ${viewMode === "list" ? "standings-grid--list" : ""}`}>
        {filteredStandings.map((team) => (
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
    </SectionShell>
  );
}
