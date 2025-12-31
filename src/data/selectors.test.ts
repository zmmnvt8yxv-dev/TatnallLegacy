import { describe, expect, it } from "vitest";
import { selectPlayerProfile } from "./selectors";
import { SCHEMA_VERSION, type SeasonData } from "./schema";

const buildSeason = (overrides: Partial<SeasonData>): SeasonData => ({
  schemaVersion: SCHEMA_VERSION,
  year: 2024,
  league_id: null,
  generated_at: null,
  teams: [],
  matchups: [],
  transactions: [],
  draft: [],
  awards: [],
  ...overrides,
});

describe("selectPlayerProfile", () => {
  it("aggregates multi-season totals and timelines", () => {
    const season2023 = buildSeason({
      year: 2023,
      lineups: [
        { week: 1, player: "John Doe", team: "Team A", started: true, points: 10 },
        { week: 2, player: "John Doe", team: "Team A", started: true, points: 30 },
        { week: 3, player: "John Doe", team: "Team A", started: false, points: 99 },
      ],
      draft: [{ player: "John Doe", player_nfl: "NE" }],
    });

    const season2024 = buildSeason({
      year: 2024,
      lineups: [
        { week: 1, player: "John Doe", team: "Team B", started: true, points: 15 },
        { week: 2, player: "John Doe", team: "Team B", started: true, points: 25 },
      ],
      draft: [{ player: "John Doe", player_nfl: "KC" }],
      supplemental: {
        player_index: {
          "1": {
            full_name: "John Doe",
            team: "KC",
            pos: "WR",
          },
        },
      },
    });

    const profile = selectPlayerProfile([season2023, season2024], "John Doe");

    expect(profile).not.toBeNull();
    expect(profile?.position).toBe("WR");
    expect(profile?.currentTeam).toBe("KC");
    expect(profile?.totalPoints).toBe(80);
    expect(profile?.totalGames).toBe(4);
    expect(profile?.avgPoints).toBe(20);
    expect(profile?.maxPoints).toBe(30);
    expect(profile?.aboveThreshold).toBe(2);
    expect(profile?.pointsTrend).toEqual([40, 40]);
    expect(profile?.nflTeams).toEqual(["NE", "KC"]);
    expect(profile?.fantasyTeams).toEqual(["Team A", "Team B"]);
    expect(profile?.seasons).toEqual([
      {
        season: 2023,
        games: 2,
        totalPoints: 40,
        avgPoints: 20,
        maxPoints: 30,
        bestWeek: 2,
        aboveThreshold: 1,
        fantasyTeams: ["Team A"],
      },
      {
        season: 2024,
        games: 2,
        totalPoints: 40,
        avgPoints: 20,
        maxPoints: 25,
        bestWeek: 2,
        aboveThreshold: 1,
        fantasyTeams: ["Team B"],
      },
    ]);
    expect(profile?.fantasyTeamTimeline).toEqual([
      { team: "Team A", seasons: [2023] },
      { team: "Team B", seasons: [2024] },
    ]);
  });

  it("returns null when no player data exists", () => {
    const season = buildSeason({ year: 2022 });

    expect(selectPlayerProfile([season], "Missing Player")).toBeNull();
  });
});
