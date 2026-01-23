/**
 * Tests for Zod schema validation
 */
import {
  ManifestSchema,
  PlayerSchema,
  PlayersArraySchema,
  PlayerIdSchema,
  PlayerIdsArraySchema,
  TeamSchema,
  TeamsArraySchema,
  MatchupSchema,
  LineupEntrySchema,
  WeeklyChunkSchema,
  SeasonSummarySchema,
  PlayerSearchSchema,
  validate,
  validateWithWarnings,
  validateOrThrow,
} from "../schemas/index";

describe("Schema Validation", () => {
  describe("ManifestSchema", () => {
    it("should validate a valid manifest", () => {
      const manifest = {
        schemaVersion: "2.0.0",
        generatedAt: "2026-01-19T02:48:51.796661+00:00",
        seasons: [2024, 2025],
        weeksBySeason: {
          "2024": [1, 2, 3],
          "2025": [1, 2],
        },
        paths: {
          players: "data/players.json",
          teams: "data/teams.json",
        },
      };

      const result = validate(ManifestSchema, manifest, "manifest");
      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should fail for manifest missing required fields", () => {
      const invalidManifest = {
        schemaVersion: "2.0.0",
        // missing generatedAt, seasons, weeksBySeason, paths
      };

      const result = validate(ManifestSchema, invalidManifest, "manifest");
      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe("PlayerSchema", () => {
    it("should validate a valid player", () => {
      const player = {
        id: "6462",
        name: "Ellis Richardson",
        position: "TE",
        team: "NYG",
        identifiers: {
          sleeper_id: "6462",
          espn_id: "3926590",
          gsis_id: "00-0035057",
        },
        height: "75",
        weight: "245",
        college: "Georgia Southern",
        age: "26.0",
        years_exp: "3.0",
        birth_date: "1995-02-12",
      };

      const result = validate(PlayerSchema, player, "player");
      expect(result.success).toBe(true);
    });

    it("should validate a player with minimal data", () => {
      const minimalPlayer = {
        id: "123",
        name: "Test Player",
        position: "WR",
        team: "",
      };

      const result = validate(PlayerSchema, minimalPlayer, "player");
      expect(result.success).toBe(true);
    });

    it("should fail for player missing id", () => {
      const invalidPlayer = {
        name: "Test Player",
        position: "WR",
        team: "",
      };

      const result = validate(PlayerSchema, invalidPlayer, "player");
      expect(result.success).toBe(false);
    });
  });

  describe("PlayerIdSchema", () => {
    it("should validate a valid player ID entry", () => {
      const playerId = {
        player_uid: "p_95a7110e6342859d",
        id_type: "sleeper",
        id_value: "11560",
      };

      const result = validate(PlayerIdSchema, playerId, "playerId");
      expect(result.success).toBe(true);
    });
  });

  describe("TeamSchema", () => {
    it("should validate a valid team", () => {
      const team = {
        team_key: "sleeper:1262418074540195841:2025:1",
        platform: "sleeper",
        league_id: "1262418074540195841",
        season: 2025,
        team_id: "1",
        roster_id: "1",
        owner_user_id: "866330097534279680",
        display_name: "Test Team",
      };

      const result = validate(TeamSchema, team, "team");
      expect(result.success).toBe(true);
    });
  });

  describe("MatchupSchema", () => {
    it("should validate a valid matchup", () => {
      const matchup = {
        week: 1,
        home_team: "Team A",
        home_score: 132.04,
        away_team: "Team B",
        away_score: 171.04,
        is_playoff: false,
      };

      const result = validate(MatchupSchema, matchup, "matchup");
      expect(result.success).toBe(true);
    });
  });

  describe("LineupEntrySchema", () => {
    it("should validate a valid lineup entry", () => {
      const lineupEntry = {
        week: 1,
        team: "Mayo Clinic",
        player: "Puka Nacua",
        points: 6.2,
        started: true,
        season: 2024,
        source: "league",
        player_id: "9493",
        sleeper_id: "9493",
        espn_id: "4426515",
        gsis_id: "00-0039075",
        position: "WR",
        nfl_team: "LAR",
      };

      const result = validate(LineupEntrySchema, lineupEntry, "lineupEntry");
      expect(result.success).toBe(true);
    });
  });

  describe("WeeklyChunkSchema", () => {
    it("should validate a valid weekly chunk", () => {
      const weeklyChunk = {
        season: 2024,
        week: 1,
        matchups: [
          {
            week: 1,
            home_team: "Team A",
            home_score: 100,
            away_team: "Team B",
            away_score: 110,
          },
        ],
        lineups: [
          {
            week: 1,
            team: "Team A",
            player: "Player 1",
            points: 15.5,
            started: true,
            season: 2024,
          },
        ],
      };

      const result = validate(WeeklyChunkSchema, weeklyChunk, "weeklyChunk");
      expect(result.success).toBe(true);
    });
  });

  describe("SeasonSummarySchema", () => {
    it("should validate a valid season summary", () => {
      const seasonSummary = {
        season: 2024,
        teams: [
          {
            team_name: "Team A",
            owner: "Owner 1",
            record: "11-3",
            points_for: 2328.86,
            points_against: 2086.64,
            regular_season_rank: 1,
            final_rank: 2,
          },
        ],
        standings: [
          {
            team: "Team A",
            wins: 12,
            losses: 4,
            ties: 0,
            points_for: 2703.2,
            points_against: 2487.68,
            rank: 2,
          },
        ],
      };

      const result = validate(SeasonSummarySchema, seasonSummary, "seasonSummary");
      expect(result.success).toBe(true);
    });
  });

  describe("PlayerSearchSchema", () => {
    it("should validate a valid player search response", () => {
      const playerSearch = {
        generatedAt: "2026-01-18T20:40:56.029827+00:00",
        rows: [
          {
            id: "3218",
            id_type: "sleeper",
            name: "A'Shawn Robinson",
            position: "DE",
            team: "DET",
          },
        ],
      };

      const result = validate(PlayerSearchSchema, playerSearch, "playerSearch");
      expect(result.success).toBe(true);
    });
  });
});

describe("Validation Utilities", () => {
  describe("validate", () => {
    it("should return success true for valid data", () => {
      const result = validate(PlayerSchema, { id: "1", name: "Test", position: "WR", team: "" }, "test");
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.issues).toHaveLength(0);
    });

    it("should return success false for invalid data", () => {
      const result = validate(PlayerSchema, { name: "Test" }, "test");
      expect(result.success).toBe(false);
      expect(result.error).not.toBeNull();
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("should include context in error messages", () => {
      const result = validate(PlayerSchema, {}, "myContext");
      expect(result.issues[0]).toContain("[myContext]");
    });
  });

  describe("validateWithWarnings", () => {
    it("should return data even when validation fails", () => {
      const invalidData = { name: "Test" };
      const result = validateWithWarnings(PlayerSchema, invalidData, "test", false);
      expect(result).toBe(invalidData);
    });
  });

  describe("validateOrThrow", () => {
    it("should return validated data for valid input", () => {
      const validData = { id: "1", name: "Test", position: "WR", team: "" };
      const result = validateOrThrow(PlayerSchema, validData, "test");
      expect(result).toEqual(validData);
    });

    it("should throw for invalid data", () => {
      expect(() => {
        validateOrThrow(PlayerSchema, {}, "test");
      }).toThrow(/Data validation failed/);
    });

    it("should include validation issues in thrown error", () => {
      try {
        validateOrThrow(PlayerSchema, {}, "test");
      } catch (err) {
        expect(err.validationIssues).toBeDefined();
        expect(err.validationIssues.length).toBeGreaterThan(0);
      }
    });
  });
});
