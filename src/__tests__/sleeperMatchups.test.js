import {
  buildSleeperScoreFeed,
  officialSleeperScore,
  sleeperScoreStatus,
} from "../hooks/useSleeperMatchups";

describe("Sleeper matchup score feed", () => {
  const empty = [
    { matchup_id: 1, roster_id: 1, points: 0, players_points: { one: 0 } },
    { matchup_id: 1, roster_id: 2, points: 0, players_points: { two: 0 } },
  ];
  const active = [
    { matchup_id: 1, roster_id: 1, points: 21.44, players_points: { one: 21.44 } },
    { matchup_id: 1, roster_id: 2, points: 17.1, custom_points: 18.5, players_points: { two: 17.1 } },
  ];

  test("official totals honor commissioner overrides", () => {
    expect(officialSleeperScore(active[0])).toBe(21.44);
    expect(officialSleeperScore(active[1])).toBe(18.5);
  });

  test("future zeroes stay scheduled while scoring becomes live", () => {
    expect(sleeperScoreStatus(empty, 1, 1, "pre")).toBe("scheduled");
    expect(sleeperScoreStatus(empty, 2, 1, "regular")).toBe("scheduled");
    expect(sleeperScoreStatus(active, 1, 1, "regular")).toBe("live");
    expect(sleeperScoreStatus(empty, 1, 2, "regular")).toBe("final");
  });

  test("feed indexes official scores by roster", () => {
    const feed = buildSleeperScoreFeed(active, 1, 1, "regular", "2026-09-10T20:00:00Z");
    expect(feed.status).toBe("live");
    expect(feed.statusByMatchup).toEqual({ 1: "live" });
    expect(feed.scores).toEqual({ 1: 21.44, 2: 18.5 });
    expect(feed.source).toBe("direct");
  });
});
