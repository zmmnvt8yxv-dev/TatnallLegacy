import type { SeasonData } from "./schema";

const summaryCache = new WeakMap<SeasonData, string>();

export function selectSeasonSummary(season: SeasonData): string {
  const cached = summaryCache.get(season);
  if (cached) {
    return cached;
  }
  const summary = `${season.teams.length} teams • ${season.matchups.length} matchups • ${season.transactions.length} transactions • ${season.draft.length} draft picks`;
  summaryCache.set(season, summary);
  return summary;
}
