import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type SeasonData } from "../data/schema";
import { runAiHelperQuery } from "./aiHelper";

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
  lineups: [],
  ...overrides,
});

const season2023 = buildSeason({
  year: 2023,
  teams: [
    {
      team_name: "Dragons",
      owner: "Alex",
      record: "8-6",
      points_for: 1400,
      points_against: 1200,
      regular_season_rank: 2,
      final_rank: 3,
    },
    {
      team_name: "Tigers",
      owner: "Blake",
      record: "4-10",
      points_for: 1100,
      points_against: 1300,
      regular_season_rank: 9,
      final_rank: 9,
    },
  ],
  matchups: [
    {
      week: 1,
      home_team: "Dragons",
      away_team: "Tigers",
      home_score: 150,
      away_score: 90,
      is_playoff: false,
    },
    {
      week: 2,
      home_team: "Dragons",
      away_team: "Tigers",
      home_score: 130,
      away_score: 129,
      is_playoff: false,
    },
  ],
  lineups: [
    { week: 1, player: "Jane Smith", team: "Dragons", started: true, points: 12 },
    { week: 2, player: "Jane Smith", team: "Dragons", started: true, points: 28 },
  ],
  draft: [{ player: "Jane Smith", player_nfl: "NYJ" }],
  supplemental: {
    player_index: {
      "10": {
        full_name: "Jane Smith",
        team: "NYJ",
        pos: "RB",
      },
    },
  },
});

const season2024 = buildSeason({
  year: 2024,
  teams: [
    {
      team_name: "Dragons",
      owner: "Alex",
      record: "9-5",
      points_for: 1500,
      points_against: 1250,
      regular_season_rank: 1,
      final_rank: 2,
    },
  ],
  matchups: [
    {
      week: 1,
      home_team: "Dragons",
      away_team: "Tigers",
      home_score: 180,
      away_score: 100,
      is_playoff: false,
    },
    {
      week: 3,
      home_team: "Dragons",
      away_team: "Hawks",
      home_score: 95,
      away_score: 110,
      is_playoff: false,
    },
  ],
  lineups: [
    { week: 1, player: "Jane Smith", team: "Dragons", started: true, points: 35 },
    { week: 3, player: "Jane Smith", team: "Dragons", started: true, points: 18 },
  ],
  draft: [{ player: "Jane Smith", player_nfl: "NYJ" }],
  supplemental: {
    player_index: {
      "10": {
        full_name: "Jane Smith",
        team: "NYJ",
        pos: "RB",
      },
    },
  },
});

const seasons = [season2023, season2024];

describe("runAiHelperQuery", () => {
  it("returns player history", () => {
    const result = runAiHelperQuery(seasons, "show player history for Jane Smith");
    expect(result.status).toBe("ok");
    expect(result.intent).toBe("player_history");
    const data = result.results as { player: string };
    expect(data.player).toBe("Jane Smith");
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it("returns best weeks", () => {
    const result = runAiHelperQuery(seasons, "best weeks for Jane Smith");
    expect(result.status).toBe("ok");
    expect(result.intent).toBe("best_weeks");
    const data = result.results as { weeks: Array<{ points: number }> };
    expect(data.weeks[0].points).toBe(35);
  });

  it("returns team record", () => {
    const result = runAiHelperQuery(seasons, "team record in 2023 for Dragons");
    expect(result.status).toBe("ok");
    expect(result.intent).toBe("team_record");
    const data = result.results as { record: string | null };
    expect(data.record).toBe("8-6");
  });

  it("returns biggest blowouts", () => {
    const result = runAiHelperQuery(seasons, "biggest blowouts in 2024");
    expect(result.status).toBe("ok");
    expect(result.intent).toBe("biggest_blowouts");
    const data = result.results as { games: Array<{ margin: number }> };
    expect(data.games[0].margin).toBe(80);
  });

  it("returns head-to-head results", () => {
    const result = runAiHelperQuery(seasons, "head-to-head between Dragons and Tigers");
    expect(result.status).toBe("ok");
    expect(result.intent).toBe("head_to_head");
    const data = result.results as { totalGames: number; teamAWins: number };
    expect(data.totalGames).toBe(3);
    expect(data.teamAWins).toBe(3);
  });

  it("handles unsupported intent", () => {
    const result = runAiHelperQuery(seasons, "who is the best team");
    expect(result.status).toBe("unsupported");
  });

  it("handles missing player data", () => {
    const result = runAiHelperQuery(seasons, "show player history for Unknown Player");
    expect(result.status).toBe("no_data");
  });

  it("handles missing best weeks data", () => {
    const result = runAiHelperQuery(seasons, "best weeks for Unknown Player");
    expect(result.status).toBe("no_data");
  });

  it("handles missing team record data", () => {
    const result = runAiHelperQuery(seasons, "team record in 2022 for Dragons");
    expect(result.status).toBe("no_data");
  });

  it("handles missing head-to-head data", () => {
    const result = runAiHelperQuery(seasons, "head-to-head between Dragons and Sharks");
    expect(result.status).toBe("no_data");
  });
});
