import type { Matchup, SeasonData, Team } from "./schema";

export type SummaryStat = {
  label: string;
  value: string;
  caption?: string;
};

export type KpiStat = {
  label: string;
  value: string;
  change: string;
  caption?: string;
  trend: number[];
};

export type HighlightStat = {
  label: string;
  value: string;
  caption?: string;
};

export type StandingsHighlight = {
  label: string;
  value: string;
};

export type StandingsRow = {
  rank: number;
  team: string;
  owner: string;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
  streak: string;
  badges: string[];
};

export type MatchupCard = {
  week: string;
  home: string;
  away: string;
  kickoff: string;
  status: "Final" | "Upcoming";
  homeScore: number;
  awayScore: number;
};

const summaryCache = new WeakMap<SeasonData, string>();
const summaryStatsCache = new WeakMap<SeasonData, SummaryStat[]>();
const kpiStatsCache = new WeakMap<SeasonData, KpiStat[]>();
const highlightCache = new WeakMap<SeasonData, HighlightStat[]>();
const standingsCache = new WeakMap<SeasonData, StandingsRow[]>();
const standingsHighlightsCache = new WeakMap<SeasonData, StandingsHighlight[]>();
const matchupWeeksCache = new WeakMap<SeasonData, string[]>();
const matchupsCache = new WeakMap<SeasonData, MatchupCard[]>();

type TeamAggregate = {
  name: string;
  pointsFor: number;
  pointsAgainst: number;
  results: { week: number; result: "W" | "L" | "T" }[];
};

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatScore(value: number): string {
  return value.toFixed(1);
}

function parseRecord(record?: string | null): { wins: number; losses: number } | null {
  if (!record) {
    return null;
  }
  const match = record.match(/(\d+)-(\d+)/);
  if (!match) {
    return null;
  }
  return { wins: Number.parseInt(match[1], 10), losses: Number.parseInt(match[2], 10) };
}

function buildTeamAggregates(season: SeasonData): Map<string, TeamAggregate> {
  const aggregates = new Map<string, TeamAggregate>();
  season.teams.forEach((team) => {
    aggregates.set(team.team_name, {
      name: team.team_name,
      pointsFor: toNumber(team.points_for),
      pointsAgainst: toNumber(team.points_against),
      results: [],
    });
  });

  season.matchups.forEach((matchup) => {
    if (!matchup.home_team || !matchup.away_team || matchup.week == null) {
      return;
    }
    const homeScore = toNumber(matchup.home_score);
    const awayScore = toNumber(matchup.away_score);
    const homeAggregate = aggregates.get(matchup.home_team);
    const awayAggregate = aggregates.get(matchup.away_team);
    if (homeAggregate) {
      homeAggregate.pointsFor += homeScore;
      homeAggregate.pointsAgainst += awayScore;
    }
    if (awayAggregate) {
      awayAggregate.pointsFor += awayScore;
      awayAggregate.pointsAgainst += homeScore;
    }
    if (homeAggregate && awayAggregate) {
      let homeResult: "W" | "L" | "T" = "T";
      let awayResult: "W" | "L" | "T" = "T";
      if (homeScore > awayScore) {
        homeResult = "W";
        awayResult = "L";
      } else if (awayScore > homeScore) {
        homeResult = "L";
        awayResult = "W";
      }
      homeAggregate.results.push({ week: matchup.week, result: homeResult });
      awayAggregate.results.push({ week: matchup.week, result: awayResult });
    }
  });

  return aggregates;
}

function computeStreak(results: TeamAggregate["results"]): string {
  if (results.length === 0) {
    return "—";
  }
  const sorted = [...results].sort((a, b) => a.week - b.week);
  const last = sorted[sorted.length - 1];
  let count = 1;
  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    if (sorted[index].result !== last.result) {
      break;
    }
    count += 1;
  }
  return `${last.result}${count}`;
}

function sortTeamsForStandings(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => {
    const rankA = a.final_rank ?? a.regular_season_rank ?? Number.POSITIVE_INFINITY;
    const rankB = b.final_rank ?? b.regular_season_rank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const pointsA = toNumber(a.points_for);
    const pointsB = toNumber(b.points_for);
    return pointsB - pointsA;
  });
}

function collectWeeklyStats(matchups: Matchup[]) {
  const weekly = new Map<number, { totalPoints: number; totalMargin: number; count: number; maxScore: number }>();
  matchups.forEach((matchup) => {
    if (matchup.week == null) {
      return;
    }
    const homeScore = toNumber(matchup.home_score);
    const awayScore = toNumber(matchup.away_score);
    const totalPoints = homeScore + awayScore;
    const margin = Math.abs(homeScore - awayScore);
    const maxScore = Math.max(homeScore, awayScore);
    const entry = weekly.get(matchup.week) ?? { totalPoints: 0, totalMargin: 0, count: 0, maxScore: 0 };
    entry.totalPoints += totalPoints;
    entry.totalMargin += margin;
    entry.count += 1;
    entry.maxScore = Math.max(entry.maxScore, maxScore);
    weekly.set(matchup.week, entry);
  });
  return weekly;
}

function buildTrend(values: number[]): number[] {
  if (values.length === 0) {
    return [0];
  }
  return values.map((value) => Number.parseFloat(value.toFixed(1)));
}

function formatChange(current: number, previous: number, unit: string): string {
  const delta = current - previous;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta).toFixed(1)}${unit}`;
}

export function selectSeasonSummary(season: SeasonData): string {
  const cached = summaryCache.get(season);
  if (cached) {
    return cached;
  }
  const summary = `${season.teams.length} teams • ${season.matchups.length} matchups • ${season.transactions.length} transactions • ${season.draft.length} draft picks`;
  summaryCache.set(season, summary);
  return summary;
}

export function selectSummaryStats(season: SeasonData): SummaryStat[] {
  const cached = summaryStatsCache.get(season);
  if (cached) {
    return cached;
  }
  const stats: SummaryStat[] = [
    { label: "Season Year", value: `${season.year}`, caption: "Latest data refresh" },
    { label: "Active Teams", value: `${season.teams.length}`, caption: "Rostered franchises" },
    { label: "Matchups Logged", value: `${season.matchups.length}`, caption: "Regular + postseason" },
    { label: "Transactions", value: `${season.transactions.length}`, caption: "Moves captured" },
  ];
  summaryStatsCache.set(season, stats);
  return stats;
}

export function selectKpiStats(season: SeasonData): KpiStat[] {
  const cached = kpiStatsCache.get(season);
  if (cached) {
    return cached;
  }
  const weekly = collectWeeklyStats(season.matchups);
  const weeks = Array.from(weekly.keys()).sort((a, b) => a - b);
  const totals = weeks.map((week) => weekly.get(week)!);
  const avgTotals = totals.map((entry) => (entry.count ? entry.totalPoints / entry.count : 0));
  const avgMargins = totals.map((entry) => (entry.count ? entry.totalMargin / entry.count : 0));
  const maxScores = totals.map((entry) => entry.maxScore);
  const latestIndex = totals.length - 1;
  const previousIndex = totals.length - 2;
  const latestTotals = avgTotals[latestIndex] ?? 0;
  const previousTotals = avgTotals[previousIndex] ?? latestTotals;
  const latestMargins = avgMargins[latestIndex] ?? 0;
  const previousMargins = avgMargins[previousIndex] ?? latestMargins;
  const latestMax = maxScores[latestIndex] ?? 0;
  const previousMax = maxScores[previousIndex] ?? latestMax;
  const stats: KpiStat[] = [
    {
      label: "Avg Points / Matchup",
      value: formatScore(latestTotals),
      change: formatChange(latestTotals, previousTotals, " pts"),
      caption: "latest week trend",
      trend: buildTrend(avgTotals),
    },
    {
      label: "Average Margin",
      value: formatScore(latestMargins),
      change: formatChange(latestMargins, previousMargins, " pts"),
      caption: "competitive balance",
      trend: buildTrend(avgMargins),
    },
    {
      label: "Top Single Score",
      value: formatScore(latestMax),
      change: formatChange(latestMax, previousMax, " pts"),
      caption: "weekly high",
      trend: buildTrend(maxScores),
    },
  ];
  kpiStatsCache.set(season, stats);
  return stats;
}

export function selectSeasonHighlights(season: SeasonData): HighlightStat[] {
  const cached = highlightCache.get(season);
  if (cached) {
    return cached;
  }
  let topScore = 0;
  let topScoreLabel = "—";
  season.matchups.forEach((matchup) => {
    if (!matchup.home_team || !matchup.away_team) {
      return;
    }
    const homeScore = toNumber(matchup.home_score);
    const awayScore = toNumber(matchup.away_score);
    const localMax = Math.max(homeScore, awayScore);
    if (localMax > topScore) {
      const winner = homeScore >= awayScore ? matchup.home_team : matchup.away_team;
      const loser = homeScore >= awayScore ? matchup.away_team : matchup.home_team;
      topScore = localMax;
      topScoreLabel = `${winner} vs. ${loser}`;
    }
  });

  const mostPointsTeam = season.teams.reduce<Team | null>((best, team) => {
    if (!best) {
      return team;
    }
    return toNumber(team.points_for) > toNumber(best.points_for) ? team : best;
  }, null);
  const mostPointsValue = mostPointsTeam
    ? `${mostPointsTeam.team_name} (${formatScore(toNumber(mostPointsTeam.points_for))})`
    : "—";

  const transactionsByTeam = new Map<string, number>();
  season.transactions.forEach((transaction) => {
    transaction.entries.forEach((entry) => {
      if (!entry.team) {
        return;
      }
      transactionsByTeam.set(entry.team, (transactionsByTeam.get(entry.team) ?? 0) + 1);
    });
  });
  let mostMovesTeam = "—";
  let mostMovesCount = 0;
  transactionsByTeam.forEach((count, team) => {
    if (count > mostMovesCount) {
      mostMovesCount = count;
      mostMovesTeam = team;
    }
  });

  const highlights: HighlightStat[] = [
    {
      label: "Highest Score",
      value: topScore ? formatScore(topScore) : "—",
      caption: topScoreLabel,
    },
    {
      label: "Most Points For",
      value: mostPointsValue,
      caption: "season total",
    },
    {
      label: "Most Transactions",
      value: mostMovesCount ? `${mostMovesCount}` : "—",
      caption: mostMovesTeam,
    },
  ];
  highlightCache.set(season, highlights);
  return highlights;
}

export function selectStandings(season: SeasonData): StandingsRow[] {
  const cached = standingsCache.get(season);
  if (cached) {
    return cached;
  }
  const aggregates = buildTeamAggregates(season);
  const sortedTeams = sortTeamsForStandings(season.teams);
  const rows = sortedTeams.map((team, index) => {
    const aggregate = aggregates.get(team.team_name);
    const record = team.record ?? "—";
    const badges: string[] = [];
    if (team.final_rank === 1) {
      badges.push("Champion");
    }
    if (team.regular_season_rank === 1) {
      badges.push("Top Seed");
    }
    if (team.final_rank && team.final_rank <= 4) {
      badges.push("Playoffs");
    }
    return {
      rank: team.final_rank ?? team.regular_season_rank ?? index + 1,
      team: team.team_name,
      owner: team.owner ?? "—",
      record,
      pointsFor: aggregate?.pointsFor ?? toNumber(team.points_for),
      pointsAgainst: aggregate?.pointsAgainst ?? toNumber(team.points_against),
      streak: aggregate ? computeStreak(aggregate.results) : "—",
      badges,
    };
  });
  standingsCache.set(season, rows);
  return rows;
}

export function selectStandingsHighlights(season: SeasonData): StandingsHighlight[] {
  const cached = standingsHighlightsCache.get(season);
  if (cached) {
    return cached;
  }
  const standings = selectStandings(season);
  const bestRecord = standings.reduce<StandingsRow | null>((best, row) => {
    if (!best) {
      return row;
    }
    const current = parseRecord(row.record);
    const previous = parseRecord(best.record);
    if (!current || !previous) {
      return best;
    }
    const currentPct = current.wins / Math.max(current.wins + current.losses, 1);
    const previousPct = previous.wins / Math.max(previous.wins + previous.losses, 1);
    return currentPct > previousPct ? row : best;
  }, null);
  const mostPoints = standings.reduce<StandingsRow | null>((best, row) => {
    if (!best) {
      return row;
    }
    return row.pointsFor > best.pointsFor ? row : best;
  }, null);
  const leastPointsAllowed = standings.reduce<StandingsRow | null>((best, row) => {
    if (!best) {
      return row;
    }
    return row.pointsAgainst < best.pointsAgainst ? row : best;
  }, null);
  const longestStreak = standings.reduce<StandingsRow | null>((best, row) => {
    if (!best) {
      return row;
    }
    const currentStreak = Number.parseInt(row.streak.slice(1), 10) || 0;
    const bestStreak = Number.parseInt(best.streak.slice(1), 10) || 0;
    return currentStreak > bestStreak ? row : best;
  }, null);
  const highlights: StandingsHighlight[] = [
    {
      label: "Best Record",
      value: bestRecord ? `${bestRecord.team} (${bestRecord.record})` : "—",
    },
    {
      label: "Most Points",
      value: mostPoints ? `${mostPoints.team} (${formatScore(mostPoints.pointsFor)})` : "—",
    },
    {
      label: "Least Points Allowed",
      value: leastPointsAllowed
        ? `${leastPointsAllowed.team} (${formatScore(leastPointsAllowed.pointsAgainst)})`
        : "—",
    },
    {
      label: "Longest Streak",
      value: longestStreak ? `${longestStreak.team} (${longestStreak.streak})` : "—",
    },
  ];
  standingsHighlightsCache.set(season, highlights);
  return highlights;
}

export function selectStandingsFilters(season: SeasonData): string[] {
  const standings = selectStandings(season);
  const badges = new Set<string>();
  standings.forEach((row) => {
    row.badges.forEach((badge) => badges.add(badge));
  });
  return ["All Teams", ...Array.from(badges)];
}

export function selectMatchupWeeks(season: SeasonData): string[] {
  const cached = matchupWeeksCache.get(season);
  if (cached) {
    return cached;
  }
  const weeks = Array.from(
    new Set(
      season.matchups.map((matchup) => matchup.week).filter((week): week is number => week != null),
    ),
  ).sort((a, b) => a - b);
  const labels = weeks.map((week) => `Week ${week}`);
  matchupWeeksCache.set(season, labels);
  return labels;
}

export function selectMatchups(season: SeasonData): MatchupCard[] {
  const cached = matchupsCache.get(season);
  if (cached) {
    return cached;
  }
  const cards = season.matchups
    .filter((matchup) => matchup.home_team && matchup.away_team)
    .map((matchup) => {
      const homeScore = toNumber(matchup.home_score);
      const awayScore = toNumber(matchup.away_score);
      const status = homeScore || awayScore ? "Final" : "Upcoming";
      const weekLabel = matchup.week ? `Week ${matchup.week}` : "Week TBD";
      return {
        week: weekLabel,
        home: matchup.home_team ?? "Home",
        away: matchup.away_team ?? "Away",
        kickoff: weekLabel,
        status,
        homeScore,
        awayScore,
      };
    });
  matchupsCache.set(season, cards);
  return cards;
}
