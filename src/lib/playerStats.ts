import type { PlayerSeasonWeek } from "../data/selectors";

export function mergeSeasonWeeks(
  baseWeeks: PlayerSeasonWeek[],
  nflverseWeeks: PlayerSeasonWeek[],
): PlayerSeasonWeek[] {
  const merged = new Map<number, PlayerSeasonWeek>();

  baseWeeks.forEach((week) => {
    merged.set(week.week, { ...week });
  });

  nflverseWeeks.forEach((week) => {
    const existing = merged.get(week.week);
    merged.set(week.week, {
      week: week.week,
      points: week.points,
      opponent: week.opponent ?? existing?.opponent ?? null,
      team: week.team ?? existing?.team ?? null,
      started: existing?.started ?? null,
      passingYards: week.passingYards ?? existing?.passingYards ?? null,
      passingTds: week.passingTds ?? existing?.passingTds ?? null,
      rushingYards: week.rushingYards ?? existing?.rushingYards ?? null,
      rushingTds: week.rushingTds ?? existing?.rushingTds ?? null,
      receptions: week.receptions ?? existing?.receptions ?? null,
      receivingYards: week.receivingYards ?? existing?.receivingYards ?? null,
      receivingTds: week.receivingTds ?? existing?.receivingTds ?? null,
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.week - b.week);
}
