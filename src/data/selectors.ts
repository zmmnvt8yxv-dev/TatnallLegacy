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

export type PointsTrendRow = {
  week: string;
  pointsFor: number;
  pointsAgainst: number;
  net: number;
};

export type RivalryHeatmapRow = {
  team: string;
  values: Array<number | null>;
};

export type AwardCard = {
  title: string;
  value: string;
  detail: string;
  note?: string;
};

export type TransactionCard = {
  id: string;
  team: string;
  type: string;
  player: string;
  faab: number | null;
  detail: string;
  timestamp: string;
};

export type RosterPlayer = {
  id: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
};

export type TeamRoster = {
  team: string;
  owner: string;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
  roster: RosterPlayer[];
  sourceLabel: string;
};

export type TradeTeamSummary = {
  team: string;
  rosterId: number | null;
  playersIn: RosterPlayer[];
  playersOut: RosterPlayer[];
  netPoints: number | null;
  score: number | null;
};

export type TradeSummary = {
  id: string;
  week: number | null;
  executed: number | null;
  teams: TradeTeamSummary[];
};

export type DraftRow = {
  round: number;
  pick: number;
  player: string;
  nflTeam: string;
  team: string;
  manager: string;
  keeper: boolean;
};

export type MemberSummary = {
  id: string;
  owner: string;
  team: string;
  record: string;
  winPct: number | null;
  pointsFor: number;
  pointsAgainst: number;
  finalRank: number | null;
  regularSeasonRank: number | null;
};

export type PlayerSeasonSummary = {
  season: number;
  games: number;
  totalPoints: number;
  avgPoints: number;
  maxPoints: number;
  bestWeek: number | null;
  aboveThreshold: number;
  fantasyTeams: string[];
  weeks: PlayerSeasonWeek[];
};

export type PlayerSeasonWeek = {
  week: number;
  points: number;
  opponent: string | null;
  team: string | null;
  started: boolean | null;
};

export function summarizeSeasonWeeks(
  season: number,
  weeks: PlayerSeasonWeek[],
  fallbackFantasyTeams: string[] = [],
): PlayerSeasonSummary {
  const fantasyTeams = new Set(
    weeks.map((week) => week.team).filter((team): team is string => Boolean(team)),
  );
  const points = weeks.map((week) => week.points);
  const totalPoints = points.reduce((sum, value) => sum + value, 0);
  const games = weeks.length;
  const maxPoints = points.reduce((max, value) => Math.max(max, value), 0);
  const bestWeekEntry = weeks.reduce<PlayerSeasonWeek | null>(
    (best, entry) => (!best || entry.points > best.points ? entry : best),
    null,
  );
  const aboveThreshold = weeks.reduce(
    (count, entry) => count + (entry.points >= PLAYER_HIGH_SCORE_THRESHOLD ? 1 : 0),
    0,
  );

  return {
    season,
    games,
    totalPoints,
    avgPoints: games ? totalPoints / games : 0,
    maxPoints,
    bestWeek: bestWeekEntry ? bestWeekEntry.week : null,
    aboveThreshold,
    fantasyTeams: fantasyTeams.size ? Array.from(fantasyTeams) : fallbackFantasyTeams,
    weeks: weeks.slice().sort((a, b) => a.week - b.week),
  };
}

export type PlayerTeamTimeline = {
  team: string;
  seasons: number[];
};

export type PlayerSeasonTeam = {
  season: number;
  team: string;
};

export type PlayerRecentPerformance = {
  season: number;
  week: number;
  points: number;
};

export type PlayerMilestones = {
  bestGame: PlayerRecentPerformance | null;
  longestHighScoreStreak: {
    length: number;
    start: PlayerRecentPerformance | null;
    end: PlayerRecentPerformance | null;
  };
  bestSeason: {
    season: number;
    totalPoints: number;
  } | null;
  awards: string[];
};

export type PlayerProfile = {
  player: string;
  playerId: string | null;
  position: string | null;
  currentTeam: string | null;
  seasons: PlayerSeasonSummary[];
  totalPoints: number;
  totalGames: number;
  avgPoints: number;
  maxPoints: number;
  aboveThreshold: number;
  nflTeams: string[];
  nflTeamHistory: PlayerSeasonTeam[];
  fantasyTeams: string[];
  fantasyTeamTimeline: PlayerTeamTimeline[];
  pointsTrend: number[];
  recentPerformance: PlayerRecentPerformance | null;
  consensusRank: number | null;
  milestones: PlayerMilestones;
};

export type PlayerSearchEntry = {
  name: string;
  team?: string;
  position?: string;
  normalized: string;
  recentPerformance: PlayerRecentPerformance | null;
  consensusRank: number | null;
};

// Cache expensive selector results by season reference to avoid recalculating
// derived UI data when the underlying season object hasn't changed.
const summaryCache = new WeakMap<SeasonData, string>();
const summaryStatsCache = new WeakMap<SeasonData, SummaryStat[]>();
const kpiStatsCache = new WeakMap<SeasonData, KpiStat[]>();
const highlightCache = new WeakMap<SeasonData, HighlightStat[]>();
const standingsCache = new WeakMap<SeasonData, StandingsRow[]>();
const standingsHighlightsCache = new WeakMap<SeasonData, StandingsHighlight[]>();
const matchupWeeksCache = new WeakMap<SeasonData, string[]>();
const visibleWeeksCache = new WeakMap<SeasonData, number[]>();
const matchupsCache = new WeakMap<SeasonData, MatchupCard[]>();
const transactionFiltersCache = new WeakMap<SeasonData, string[]>();
const transactionWeeksCache = new WeakMap<SeasonData, string[]>();
const transactionsCache = new WeakMap<SeasonData, TransactionCard[]>();
const teamRosterCache = new WeakMap<SeasonData, TeamRoster[]>();
const tradesCache = new WeakMap<SeasonData, TradeSummary[]>();
const draftCache = new WeakMap<SeasonData, DraftRow[]>();
const memberSummariesCache = new WeakMap<SeasonData, MemberSummary[]>();
const pointsTrendCache = new WeakMap<SeasonData, PointsTrendRow[]>();
const rivalryHeatmapCache = new WeakMap<
  SeasonData,
  { teams: string[]; matrix: RivalryHeatmapRow[] }
>();
const awardsCache = new WeakMap<SeasonData, AwardCard[]>();

type TeamAggregate = {
  name: string;
  pointsFor: number;
  pointsAgainst: number;
  results: { week: number; result: "W" | "L" | "T" }[];
};

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function formatWeekLabel(week: number | null | undefined): string {
  return week != null ? `W${week}` : "W?";
}

function formatPoints(value: number): string {
  return value.toFixed(1);
}

function resolvePlayer(season: SeasonData, id: string): RosterPlayer {
  const playerIndex = season.supplemental?.player_index?.[id];
  const name =
    playerIndex?.full_name?.trim() ||
    playerIndex?.name?.trim() ||
    id;
  return {
    id,
    name,
    position: playerIndex?.pos ?? null,
    nflTeam: playerIndex?.team ?? null,
  };
}

function isWeekVisible(season: SeasonData, week: number | null | undefined): boolean {
  if (week == null) {
    return false;
  }
  if (season.year === 2025) {
    return week <= 17;
  }
  return true;
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

function formatTransactionType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (!normalized) {
    return "Transaction";
  }
  if (normalized === "add") {
    return "Add";
  }
  if (normalized === "drop") {
    return "Drop";
  }
  if (normalized === "trade") {
    return "Trade";
  }
  return type;
}

function extractWeekIndex(label: string): number | null {
  const match = label.match(/week\s+(\d+)/i);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

function normalizeTeamName(team: string | null | undefined): string {
  if (!team) {
    return "—";
  }
  const match = team.match(/^Team\((.*)\)$/);
  return match ? match[1] : team;
}

function buildOwnerLookup(season: SeasonData): Map<string, string> {
  const lookup = new Map<string, string>();
  season.teams.forEach((team) => {
    lookup.set(normalizeTeamName(team.team_name), team.owner ?? "—");
  });
  return lookup;
}

/** Build a one-line description of the season highlights for the summary header. */
export function selectSeasonSummary(season: SeasonData): string {
  const cached = summaryCache.get(season);
  if (cached) {
    return cached;
  }
  const summary = `${season.teams.length} teams • ${season.matchups.length} matchups • ${season.transactions.length} transactions • ${season.draft.length} draft picks`;
  summaryCache.set(season, summary);
  return summary;
}

/** Assemble the headline summary stats shown at the top of the summary section. */
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

/** Build KPI cards with trends for the summary dashboard. */
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

/** Return highlight callouts (best teams, streaks, etc.) for the summary view. */
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

/** Transform team records into sortable standings rows. */
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

/** Build team roster cards using supplemental roster data. */
export function selectTeamRosters(season: SeasonData): TeamRoster[] {
  const cached = teamRosterCache.get(season);
  if (cached) {
    return cached;
  }

  const rosterSource = (season.supplemental?.current_roster ??
    season.supplemental?.draft_day_roster ??
    {}) as Record<string, string[]>;
  const sourceLabel = season.supplemental?.current_roster
    ? "Current roster"
    : season.supplemental?.draft_day_roster
      ? "Draft day roster"
      : "Roster unavailable";
  const positionPriority = new Map([
    ["QB", 1],
    ["RB", 2],
    ["WR", 3],
    ["TE", 4],
    ["FLEX", 5],
    ["K", 6],
    ["DEF", 7],
  ]);

  const rows = season.teams.map((team) => {
    const rosterIds = rosterSource[String(team.team_id ?? "")] ?? [];
    const roster = rosterIds.map((id) => resolvePlayer(season, id));
    roster.sort((a, b) => {
      const posA = positionPriority.get(a.position ?? "") ?? 99;
      const posB = positionPriority.get(b.position ?? "") ?? 99;
      if (posA !== posB) {
        return posA - posB;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      team: team.team_name,
      owner: team.owner ?? "—",
      record: team.record ?? "—",
      pointsFor: toNumber(team.points_for),
      pointsAgainst: toNumber(team.points_against),
      roster,
      sourceLabel,
    };
  });

  teamRosterCache.set(season, rows);
  return rows;
}

/** Summarize notable standings achievements (top scorer, best defense, etc.). */
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

/** Provide filter labels for the standings view based on award badges. */
export function selectStandingsFilters(season: SeasonData): string[] {
  const standings = selectStandings(season);
  const badges = new Set<string>();
  standings.forEach((row) => {
    row.badges.forEach((badge) => badges.add(badge));
  });
  return ["All Teams", ...Array.from(badges)];
}

/** Build available matchup week labels for selector UI. */
export function selectMatchupWeeks(season: SeasonData): string[] {
  const cached = matchupWeeksCache.get(season);
  if (cached) {
    return cached;
  }
  const weeks = selectVisibleWeeks(season);
  const labels = weeks.map((week) => `Week ${week}`);
  matchupWeeksCache.set(season, labels);
  return labels;
}

/** Identify weeks that should be displayed (e.g., hide future postseason weeks). */
export function selectVisibleWeeks(season: SeasonData): number[] {
  const cached = visibleWeeksCache.get(season);
  if (cached) {
    return cached;
  }
  const weeks = Array.from(
    new Set(
      season.matchups
        .map((matchup) => matchup.week)
        .filter((week): week is number => week != null && isWeekVisible(season, week)),
    ),
  ).sort((a, b) => a - b);
  visibleWeeksCache.set(season, weeks);
  return weeks;
}

/** Normalize matchup data into cards for the weekly matchup panel. */
export function selectMatchups(season: SeasonData): MatchupCard[] {
  const cached = matchupsCache.get(season);
  if (cached) {
    return cached;
  }
  const cards = season.matchups
    .filter(
      (matchup) =>
        matchup.home_team &&
        matchup.away_team &&
        isWeekVisible(season, matchup.week ?? null),
    )
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

/** Aggregate weekly points for/against into a trend series. */
export function selectPointsTrend(season: SeasonData): PointsTrendRow[] {
  const cached = pointsTrendCache.get(season);
  if (cached) {
    return cached;
  }

  const weekly = new Map<number, { totalPoints: number; totalMargin: number; matchups: number }>();
  season.matchups.forEach((matchup) => {
    if (matchup.week == null) {
      return;
    }
    if (!isWeekVisible(season, matchup.week)) {
      return;
    }

    const homeScore = toNumber(matchup.home_score);
    const awayScore = toNumber(matchup.away_score);
    const entry = weekly.get(matchup.week) ?? { totalPoints: 0, totalMargin: 0, matchups: 0 };

    entry.totalPoints += homeScore + awayScore;
    entry.totalMargin += homeScore - awayScore;
    entry.matchups += 1;

    weekly.set(matchup.week, entry);
  });

  const rows = Array.from(weekly.entries())
    .sort(([weekA], [weekB]) => weekA - weekB)
    .map(([week, entry]) => {
      const teamCount = entry.matchups * 2;
      const pointsFor = teamCount ? entry.totalPoints / teamCount : 0;
      const pointsAgainst = teamCount ? entry.totalPoints / teamCount : 0;
      const net = entry.matchups ? entry.totalMargin / entry.matchups : 0;
      return {
        week: formatWeekLabel(week),
        pointsFor: Number(pointsFor.toFixed(1)),
        pointsAgainst: Number(pointsAgainst.toFixed(1)),
        net: Number(net.toFixed(1)),
      };
    });

  pointsTrendCache.set(season, rows);
  return rows;
}

/** Build a rivalry heatmap matrix based on matchup outcomes. */
export function selectRivalryHeatmap(
  season: SeasonData,
): { teams: string[]; matrix: RivalryHeatmapRow[] } {
  const cached = rivalryHeatmapCache.get(season);
  if (cached) {
    return cached;
  }
  const teams = season.teams
    .map((team) => team.team_name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const matchupTotals = new Map<string, { total: number; count: number }>();
  season.matchups.forEach((matchup) => {
        if (matchup.week == null) {
      return;
    }
    if (!isWeekVisible(season, matchup.week)) {
      return;
    }
    if (!matchup.home_team || !matchup.away_team) {
      return;
    }
    const teamA = matchup.home_team;
    const teamB = matchup.away_team;
    const key = [teamA, teamB].sort().join("||");
    const entry = matchupTotals.get(key) ?? { total: 0, count: 0 };
    entry.total += toNumber(matchup.home_score) + toNumber(matchup.away_score);
    entry.count += 1;
    matchupTotals.set(key, entry);
  });
  const matrix = teams.map((team) => {
    const values = teams.map((opponent) => {
      if (team === opponent) {
        return null;
      }
      const key = [team, opponent].sort().join("||");
      const entry = matchupTotals.get(key);
      if (!entry) {
        return null;
      }
      return entry.total / entry.count;
    });
    return { team, values };
  });
  const data = { teams, matrix };
  rivalryHeatmapCache.set(season, data);
  return data;
}

/** Prepare award cards for postseason awards and honors. */
export function selectAwardCards(season: SeasonData): AwardCard[] {
  const cached = awardsCache.get(season);
  if (cached) {
    return cached;
  }

  const awardsFromData = season.awards.map((award) => {
    const value =
      typeof award.value === "number" ? formatPoints(award.value) : award.value ? String(award.value) : "—";
    const detail = award.team ?? award.owner ?? "—";
    return {
      title: award.title || "Award",
      value,
      detail,
      note: award.description ?? undefined,
    };
  });

  if (awardsFromData.length > 0) {
    awardsCache.set(season, awardsFromData);
    return awardsFromData;
  }

    const matchups = season.matchups.filter(
    (matchup) =>
      matchup.home_team &&
      matchup.away_team &&
      matchup.week != null &&
      isWeekVisible(season, matchup.week),
  );
  if (matchups.length === 0) {
    awardsCache.set(season, []);
    return [];
  }

  let highestScore = matchups[0];
  let lowestScore = matchups[0];
  let closestFinish = matchups[0];
  let biggestBlowout = matchups[0];
  let highestTotal = matchups[0];

  matchups.forEach((matchup) => {
    const homeScore = toNumber(matchup.home_score);
    const awayScore = toNumber(matchup.away_score);
    const maxScore = Math.max(homeScore, awayScore);
    const minScore = Math.min(homeScore, awayScore);
    const margin = Math.abs(homeScore - awayScore);
    const total = homeScore + awayScore;

    const highestScoreMax =
      Math.max(toNumber(highestScore.home_score), toNumber(highestScore.away_score));
    if (maxScore > highestScoreMax) {
      highestScore = matchup;
    }

    const lowestScoreMin =
      Math.min(toNumber(lowestScore.home_score), toNumber(lowestScore.away_score));
    if (minScore < lowestScoreMin) {
      lowestScore = matchup;
    }

    const closestMargin = Math.abs(
      toNumber(closestFinish.home_score) - toNumber(closestFinish.away_score),
    );
    if (margin < closestMargin) {
      closestFinish = matchup;
    }

    const biggestMargin = Math.abs(
      toNumber(biggestBlowout.home_score) - toNumber(biggestBlowout.away_score),
    );
    if (margin > biggestMargin) {
      biggestBlowout = matchup;
    }

    const highestTotalCurrent =
      toNumber(highestTotal.home_score) + toNumber(highestTotal.away_score);
    if (total > highestTotalCurrent) {
      highestTotal = matchup;
    }
  });

  const cards: AwardCard[] = [
    {
      title: "Highest Score",
      value: formatPoints(
        Math.max(toNumber(highestScore.home_score), toNumber(highestScore.away_score)),
      ),
      detail: `${highestScore.home_team} vs. ${highestScore.away_team}`,
      note: `Week ${highestScore.week}`,
    },
    {
      title: "Lowest Score",
      value: formatPoints(
        Math.min(toNumber(lowestScore.home_score), toNumber(lowestScore.away_score)),
      ),
      detail: `${lowestScore.home_team} vs. ${lowestScore.away_team}`,
      note: `Week ${lowestScore.week}`,
    },
    {
      title: "Closest Finish",
      value: formatPoints(
        Math.abs(toNumber(closestFinish.home_score) - toNumber(closestFinish.away_score)),
      ),
      detail: `${closestFinish.home_team} vs. ${closestFinish.away_team}`,
      note: `Week ${closestFinish.week}`,
    },
    {
      title: "Largest Blowout",
      value: formatPoints(
        Math.abs(toNumber(biggestBlowout.home_score) - toNumber(biggestBlowout.away_score)),
      ),
      detail: `${biggestBlowout.home_team} vs. ${biggestBlowout.away_team}`,
      note: `Week ${biggestBlowout.week}`,
    },
    {
      title: "Highest Total Points",
      value: formatPoints(
        toNumber(highestTotal.home_score) + toNumber(highestTotal.away_score),
      ),
      detail: `${highestTotal.home_team} vs. ${highestTotal.away_team}`,
      note: `Week ${highestTotal.week}`,
    },
  ];

  awardsCache.set(season, cards);
  return cards;
}

/** Build filters for transaction history (trades, waivers, etc.). */
export function selectTransactionFilters(season: SeasonData): string[] {
  const cached = transactionFiltersCache.get(season);
  if (cached) {
    return cached;
  }
  const types = new Set<string>();
  season.transactions.forEach((transaction) => {
    transaction.entries.forEach((entry) => {
      if (entry.type) {
        types.add(formatTransactionType(entry.type));
      }
    });
  });
  const filters = ["All Transactions", ...Array.from(types).sort((a, b) => a.localeCompare(b))];
  transactionFiltersCache.set(season, filters);
  return filters;
}

/** Build week filter labels for transaction history. */
export function selectTransactionWeeks(season: SeasonData): string[] {
  const cached = transactionWeeksCache.get(season);
  if (cached) {
    return cached;
  }
  const dates = new Set<string>();
  season.transactions.forEach((transaction) => {
    if (transaction.date) {
      dates.add(transaction.date);
    }
  });
  const labels = ["All Weeks", ...Array.from(dates).sort((a, b) => {
    const weekA = extractWeekIndex(a);
    const weekB = extractWeekIndex(b);
    if (weekA != null && weekB != null) {
      return weekA - weekB;
    }
    if (weekA != null) {
      return -1;
    }
    if (weekB != null) {
      return 1;
    }
    return a.localeCompare(b);
  })];
  transactionWeeksCache.set(season, labels);
  return labels;
}

/** Normalize transaction logs into display-ready cards. */
export function selectTransactions(season: SeasonData): TransactionCard[] {
  const cached = transactionsCache.get(season);
  if (cached) {
    return cached;
  }
  const cards: TransactionCard[] = [];
  season.transactions.forEach((transaction, transactionIndex) => {
    const timestamp = transaction.date || "—";
    transaction.entries.forEach((entry, entryIndex) => {
      const team = normalizeTeamName(entry.team);
      const type = formatTransactionType(entry.type ?? "");
      const player = entry.player || "—";
      const faab = entry.faab ?? null;
      const detailParts = [type];
      if (faab != null) {
        detailParts.push(`FAAB $${faab}`);
      }
      const detail = detailParts.join(" · ");
      cards.push({
        id: `${transactionIndex}-${entryIndex}-${team}-${player}`,
        team,
        type,
        player,
        faab,
        detail,
        timestamp,
      });
    });
  });
  transactionsCache.set(season, cards);
  return cards;
}

/** Summarize trades with per-team assets and evaluation scores. */
export function selectTradeSummaries(season: SeasonData): TradeSummary[] {
  const cached = tradesCache.get(season);
  if (cached) {
    return cached;
  }
  const tradeEvals = Array.isArray(season.supplemental?.trade_evals)
    ? season.supplemental?.trade_evals
    : [];
  const trades = tradeEvals
    .map((trade, index) => {
      if (!isRecord(trade)) {
        return null;
      }
      const perRoster = Array.isArray(trade["per_roster"]) ? trade["per_roster"] : [];
      const teams = perRoster
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }
          const teamName =
            typeof entry["team_name"] === "string" ? entry["team_name"] : "Unknown Team";
          const playersIn = Array.isArray(entry["players_in"])
            ? entry["players_in"].map((id) => resolvePlayer(season, String(id)))
            : [];
          const playersOut = Array.isArray(entry["players_out"])
            ? entry["players_out"].map((id) => resolvePlayer(season, String(id)))
            : [];
          return {
            team: teamName,
            rosterId: typeof entry["roster_id"] === "number" ? entry["roster_id"] : null,
            playersIn,
            playersOut,
            netPoints:
              typeof entry["net_points_after"] === "number" ? entry["net_points_after"] : null,
            score: typeof entry["score_0_to_100"] === "number" ? entry["score_0_to_100"] : null,
          };
        })
        .filter((entry): entry is TradeTeamSummary => Boolean(entry));
      return {
        id: typeof trade["tx_id"] === "string" ? trade["tx_id"] : `trade-${index}`,
        week: typeof trade["week"] === "number" ? trade["week"] : null,
        executed: typeof trade["executed"] === "number" ? trade["executed"] : null,
        teams,
      };
    })
    .filter((trade): trade is TradeSummary => Boolean(trade));
  tradesCache.set(season, trades);
  return trades;
}

/** Convert draft rows into a table-friendly representation. */
export function selectDraftPicks(season: SeasonData): DraftRow[] {
  const cached = draftCache.get(season);
  if (cached) {
    return cached;
  }
  const ownerLookup = buildOwnerLookup(season);
  const rows = season.draft
    .map((pick) => {
      const teamName = normalizeTeamName(pick.team);
      return {
        round: pick.round ?? 0,
        pick: pick.overall ?? 0,
        player: pick.player ?? "—",
        nflTeam: pick.player_nfl ?? "—",
        team: teamName,
        manager: ownerLookup.get(teamName) ?? "—",
        keeper: Boolean(pick.keeper),
      };
    })
    .sort((a, b) => {
      if (a.round !== b.round) {
        return a.round - b.round;
      }
      return a.pick - b.pick;
    });
  draftCache.set(season, rows);
  return rows;
}

/** Summarize members across the league for the members view. */
export function selectMemberSummaries(season: SeasonData): MemberSummary[] {
  const cached = memberSummariesCache.get(season);
  if (cached) {
    return cached;
  }
  const summaries = season.teams.map((team) => {
    const record = team.record ?? "—";
    const parsed = parseRecord(record);
    const winPct = parsed ? parsed.wins / Math.max(parsed.wins + parsed.losses, 1) : null;
    return {
      id: `${team.owner ?? "member"}-${team.team_name}`,
      owner: team.owner ?? "—",
      team: team.team_name,
      record,
      winPct,
      pointsFor: toNumber(team.points_for),
      pointsAgainst: toNumber(team.points_against),
      finalRank: team.final_rank ?? null,
      regularSeasonRank: team.regular_season_rank ?? null,
    };
  });
  memberSummariesCache.set(season, summaries);
  return summaries;
}

const PLAYER_HIGH_SCORE_THRESHOLD = 20;
const PLAYER_NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Normalize player names so search and profile lookups are consistent. */
export function normalizePlayerName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9\\s-]/g, " ")
    .replace(/[-]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  const parts = cleaned.split(" ").filter((part) => !PLAYER_NAME_SUFFIXES.has(part));
  return parts.join(" ");
}

export type PlayerDirectoryEntry = {
  name: string;
  team?: string;
  position?: string;
};

/** Build a unique list of all players across seasons for search/autocomplete. */
export function selectPlayerDirectory(seasons: SeasonData[]): PlayerDirectoryEntry[] {
  const players = new Map<string, PlayerDirectoryEntry>();

  const ensureEntry = (name: string) => {
    const normalized = normalizePlayerName(name);
    if (!normalized) {
      return null;
    }
    const existing = players.get(normalized);
    if (existing) {
      return existing;
    }
    const entry = { name };
    players.set(normalized, entry);
    return entry;
  };

  seasons.forEach((season) => {
    season.lineups?.forEach((entry) => {
      if (entry.player) {
        ensureEntry(entry.player);
      }
    });
    season.draft.forEach((pick) => {
      if (pick.player) {
        const entry = ensureEntry(pick.player);
        if (entry && pick.player_nfl && !entry.team) {
          entry.team = pick.player_nfl;
        }
      }
    });
    season.transactions.forEach((transaction) => {
      transaction.entries.forEach((entry) => {
        if (entry.player) {
          ensureEntry(entry.player);
        }
      });
    });

    const playerIndex = season.supplemental?.player_index;
    if (playerIndex) {
      Object.values(playerIndex).forEach((player) => {
        const name = player.full_name ?? player.name;
        if (!name) {
          return;
        }
        const entry = ensureEntry(name);
        if (!entry) {
          return;
        }
        if (player.full_name && entry.name !== player.full_name) {
          entry.name = player.full_name;
        }
        if (player.team && !entry.team) {
          entry.team = player.team;
        }
        if (player.pos && !entry.position) {
          entry.position = player.pos;
        }
      });
    }
  });

  return Array.from(players.values()).sort((a, b) => a.name.localeCompare(b.name));
}

type PlayerConsensusRankMap = Map<string, number>;
type PlayerRecentPerformanceMap = Map<string, PlayerRecentPerformance>;

function buildConsensusRankMap(seasons: SeasonData[]): PlayerConsensusRankMap {
  const totals = new Map<string, { total: number; count: number }>();

  seasons.forEach((season) => {
    season.draft.forEach((pick) => {
      if (!pick.player || pick.overall === null || pick.overall === undefined) {
        return;
      }
      const normalized = normalizePlayerName(pick.player);
      if (!normalized) {
        return;
      }
      const existing = totals.get(normalized) ?? { total: 0, count: 0 };
      totals.set(normalized, {
        total: existing.total + pick.overall,
        count: existing.count + 1,
      });
    });
  });

  const ranked = Array.from(totals.entries())
    .map(([player, data]) => ({
      player,
      avgPick: data.total / data.count,
    }))
    .sort((a, b) => a.avgPick - b.avgPick);

  return new Map(ranked.map((entry, index) => [entry.player, index + 1]));
}

function buildRecentPerformanceMap(seasons: SeasonData[]): PlayerRecentPerformanceMap {
  const recent = new Map<string, PlayerRecentPerformance>();

  seasons.forEach((season) => {
    const entries = season.lineups ?? [];
    entries.forEach((entry) => {
      if (!entry.player || entry.week === null || entry.week === undefined) {
        return;
      }
      const normalized = normalizePlayerName(entry.player);
      if (!normalized) {
        return;
      }
      const week = entry.week ?? 0;
      const points = typeof entry.points === "number" ? entry.points : 0;
      const existing = recent.get(normalized);
      if (
        !existing ||
        season.year > existing.season ||
        (season.year === existing.season && week > existing.week)
      ) {
        recent.set(normalized, { season: season.year, week, points });
      }
    });
  });

  return recent;
}

export function selectPlayerSearchIndex(seasons: SeasonData[]): PlayerSearchEntry[] {
  const directory = selectPlayerDirectory(seasons);
  const consensusRankMap = buildConsensusRankMap(seasons);
  const recentPerformanceMap = buildRecentPerformanceMap(seasons);

  return directory.map((entry) => {
    const normalized = normalizePlayerName(entry.name);
    return {
      name: entry.name,
      team: entry.team,
      position: entry.position,
      normalized,
      recentPerformance: recentPerformanceMap.get(normalized) ?? null,
      consensusRank: consensusRankMap.get(normalized) ?? null,
    };
  });
}

/** Aggregate multi-season player stats for the player profile modal/page. */
export function selectPlayerProfile(
  seasons: SeasonData[],
  playerName: string,
): PlayerProfile | null {
  const normalized = normalizePlayerName(playerName);
  if (!normalized) {
    return null;
  }

  const sortedSeasonData = [...seasons].sort((a, b) => b.year - a.year);
  let position: string | null = null;
  let currentTeam: string | null = null;
  let playerId: string | null = null;

  for (const season of sortedSeasonData) {
    const playerIndex = season.supplemental?.player_index;
    if (!playerIndex) {
      continue;
    }
    for (const [id, player] of Object.entries(playerIndex)) {
      const name = player.full_name ?? player.name;
      if (!name) {
        continue;
      }
      if (normalizePlayerName(name) !== normalized) {
        continue;
      }
      position = player.pos ?? position;
      currentTeam = player.team ?? currentTeam;
      playerId = id;
      if (position || currentTeam) {
        break;
      }
    }
    if (position || currentTeam) {
      break;
    }
  }

  const seasonSummaries: PlayerSeasonSummary[] = [];
  const nflTeams = new Set<string>();
  const nflTeamHistory: PlayerSeasonTeam[] = [];
  const fantasyTeams = new Set<string>();
  const entriesBySeason: Array<{ season: number; entry: SeasonData["lineups"][number] }> = [];
  const awards: string[] = [];

  seasons.forEach((season) => {
    const matchupMap = new Map<string, string>();
    season.matchups.forEach((matchup) => {
      if (
        matchup.week === null ||
        matchup.week === undefined ||
        !matchup.home_team ||
        !matchup.away_team
      ) {
        return;
      }
      matchupMap.set(`${matchup.week}:${matchup.home_team}`, matchup.away_team);
      matchupMap.set(`${matchup.week}:${matchup.away_team}`, matchup.home_team);
    });

    const playerEntries =
      season.lineups?.filter((entry) => {
        if (!entry.player) {
          return false;
        }
        return normalizePlayerName(entry.player) === normalized;
      }) ?? [];

    const scoringEntries = playerEntries.filter((entry) => entry.started !== false);

    if (playerEntries.length === 0) {
      season.draft.forEach((pick) => {
        if (pick.player && normalizePlayerName(pick.player) === normalized && pick.player_nfl) {
          nflTeams.add(pick.player_nfl);
          nflTeamHistory.push({ season: season.year, team: pick.player_nfl });
        }
      });
      return;
    }

    let totalPoints = 0;
    let maxPoints = 0;
    let bestWeek: number | null = null;
    let aboveThreshold = 0;
    const seasonFantasyTeams = new Set<string>();
    const weeks: PlayerSeasonWeek[] = [];

    scoringEntries.forEach((entry) => {
      const points = toNumber(entry.points);
      totalPoints += points;
      if (points > maxPoints) {
        maxPoints = points;
        bestWeek = entry.week ?? null;
      }
      if (points >= PLAYER_HIGH_SCORE_THRESHOLD) {
        aboveThreshold += 1;
      }
    });

    playerEntries.forEach((entry) => {
      const points = toNumber(entry.points);
      if (entry.team) {
        seasonFantasyTeams.add(entry.team);
        fantasyTeams.add(entry.team);
      }
      if (entry.week !== null && entry.week !== undefined) {
        weeks.push({
          week: entry.week,
          points,
          opponent: entry.team ? matchupMap.get(`${entry.week}:${entry.team}`) ?? null : null,
          team: entry.team ?? null,
          started: entry.started ?? null,
        });
      }
      entriesBySeason.push({ season: season.year, entry });
    });

    season.draft.forEach((pick) => {
      if (pick.player && normalizePlayerName(pick.player) === normalized && pick.player_nfl) {
        nflTeams.add(pick.player_nfl);
        nflTeamHistory.push({ season: season.year, team: pick.player_nfl });
      }
    });

    const games = scoringEntries.length;
    seasonSummaries.push({
      season: season.year,
      games,
      totalPoints,
      avgPoints: games ? totalPoints / games : 0,
      maxPoints,
      bestWeek,
      aboveThreshold,
      fantasyTeams: Array.from(seasonFantasyTeams),
      weeks: weeks.sort((a, b) => a.week - b.week),
    });
  });

  if (seasonSummaries.length === 0) {
    return null;
  }

  const sortedSeasons = seasonSummaries.sort((a, b) => a.season - b.season);
  const totalPoints = sortedSeasons.reduce((sum, season) => sum + season.totalPoints, 0);
  const totalGames = sortedSeasons.reduce((sum, season) => sum + season.games, 0);
  const maxPoints = sortedSeasons.reduce((max, season) => Math.max(max, season.maxPoints), 0);
  const aboveThreshold = sortedSeasons.reduce((sum, season) => sum + season.aboveThreshold, 0);
  const pointsTrend = sortedSeasons.map((season) => season.totalPoints);
  const fantasyTeamTimelineMap = new Map<string, number[]>();

  sortedSeasons.forEach((season) => {
    season.fantasyTeams.forEach((team) => {
      const years = fantasyTeamTimelineMap.get(team) ?? [];
      years.push(season.season);
      fantasyTeamTimelineMap.set(team, years);
    });
  });

  const fantasyTeamTimeline = Array.from(fantasyTeamTimelineMap.entries())
    .map(([team, seasons]) => ({
      team,
      seasons: seasons.sort((a, b) => a - b),
    }))
    .sort((a, b) => a.team.localeCompare(b.team));

  const consensusRank = buildConsensusRankMap(seasons).get(normalized) ?? null;
  const recentPerformance =
    buildRecentPerformanceMap(seasons).get(normalized) ?? null;

  const bestSeason = sortedSeasons.reduce(
    (best, season) =>
      !best || season.totalPoints > best.totalPoints
        ? { season: season.season, totalPoints: season.totalPoints }
        : best,
    null as { season: number; totalPoints: number } | null,
  );

  const sortedEntries = entriesBySeason
    .filter((item) => item.entry.week !== null && item.entry.week !== undefined)
    .sort((a, b) => a.season - b.season || (a.entry.week ?? 0) - (b.entry.week ?? 0));

  let bestGame: PlayerRecentPerformance | null = null;
  let currentStreak = 0;
  let currentStart: PlayerRecentPerformance | null = null;
  let longestStreak = 0;
  let longestStart: PlayerRecentPerformance | null = null;
  let longestEnd: PlayerRecentPerformance | null = null;

  sortedEntries.forEach(({ season, entry }) => {
    const week = entry.week ?? 0;
    const points = toNumber(entry.points);
    if (!bestGame || points > bestGame.points) {
      bestGame = { season, week, points };
    }
    if (points >= PLAYER_HIGH_SCORE_THRESHOLD) {
      if (currentStreak === 0) {
        currentStart = { season, week, points };
      }
      currentStreak += 1;
      if (currentStreak >= longestStreak) {
        longestStreak = currentStreak;
        longestStart = currentStart;
        longestEnd = { season, week, points };
      }
    } else {
      currentStreak = 0;
      currentStart = null;
    }
  });

  seasons.forEach((season) => {
    season.awards.forEach((award) => {
      const title = award.title ?? "";
      const description = award.description ?? "";
      const combined = `${title} ${description}`.trim();
      if (!combined) {
        return;
      }
      if (normalizePlayerName(combined).includes(normalized)) {
        awards.push(title || description);
      }
    });
  });

  return {
    player: playerName,
    playerId,
    position,
    currentTeam,
    seasons: sortedSeasons,
    totalPoints,
    totalGames,
    avgPoints: totalGames ? totalPoints / totalGames : 0,
    maxPoints,
    aboveThreshold,
    nflTeams: Array.from(nflTeams),
    nflTeamHistory: nflTeamHistory
      .filter((entry) => entry.team)
      .reduce<PlayerSeasonTeam[]>((acc, entry) => {
        const existing = acc.find((item) => item.season === entry.season);
        if (!existing) {
          acc.push(entry);
        }
        return acc;
      }, [])
      .sort((a, b) => a.season - b.season),
    fantasyTeams: Array.from(fantasyTeams),
    fantasyTeamTimeline,
    pointsTrend,
    recentPerformance,
    consensusRank,
    milestones: {
      bestGame,
      longestHighScoreStreak: {
        length: longestStreak,
        start: longestStart,
        end: longestEnd,
      },
      bestSeason,
      awards,
    },
  };
}
