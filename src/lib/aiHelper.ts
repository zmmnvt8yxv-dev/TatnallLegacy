import { selectPlayerProfile } from "../data/selectors";
import type { SeasonData } from "../data/schema";
import { normalizeName } from "./playerIdentity";

type Citation = {
  year: number;
  week?: number | null;
  gameId?: string | null;
  note?: string;
};

type PlayerHistorySeason = {
  season: number;
  games: number;
  totalPoints: number;
  avgPoints: number;
  maxPoints: number;
  bestWeek: number | null;
};

type PlayerHistoryResult = {
  player: string;
  seasons: PlayerHistorySeason[];
};

type BestWeekResult = {
  season: number;
  week: number;
  points: number;
  team: string | null;
  opponent: string | null;
};

type BestWeeksResult = {
  player: string;
  weeks: BestWeekResult[];
};

type TeamRecordResult = {
  team: string;
  year: number;
  record: string | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  regularSeasonRank: number | null;
  finalRank: number | null;
};

type BlowoutResult = {
  year: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  margin: number;
  isPlayoff: boolean | null;
};

type BlowoutsResult = {
  year: number;
  games: BlowoutResult[];
};

type HeadToHeadGame = {
  year: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  winner: string | null;
  isPlayoff: boolean | null;
};

type HeadToHeadResult = {
  teamA: string;
  teamB: string;
  totalGames: number;
  teamAWins: number;
  teamBWins: number;
  ties: number;
  games: HeadToHeadGame[];
};

type AiHelperIntent =
  | "player_history"
  | "best_weeks"
  | "team_record"
  | "biggest_blowouts"
  | "head_to_head";

type AiHelperResponse = {
  status: "ok" | "no_data" | "unsupported";
  intent: AiHelperIntent | "unknown";
  query: string;
  results?:
    | PlayerHistoryResult
    | BestWeeksResult
    | TeamRecordResult
    | BlowoutsResult
    | HeadToHeadResult;
  citations: Citation[];
  message?: string;
};

type ParsedIntent =
  | { intent: "player_history"; player: string }
  | { intent: "best_weeks"; player: string }
  | { intent: "team_record"; team: string; year: number }
  | { intent: "biggest_blowouts"; year: number }
  | { intent: "head_to_head"; teamA: string; teamB: string };

const MAX_RESULTS = 5;

const normalizeTeam = (input: string) => normalizeName(input);

const cleanQueryTerm = (value: string) =>
  value.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();

const buildGameId = (
  year: number,
  week: number | null | undefined,
  homeTeam?: string | null,
  awayTeam?: string | null,
) => {
  if (!week) {
    return null;
  }
  const home = homeTeam ? normalizeTeam(homeTeam).replace(/\s+/g, "-") : "home";
  const away = awayTeam ? normalizeTeam(awayTeam).replace(/\s+/g, "-") : "away";
  return `${year}-w${week}-${home}-vs-${away}`;
};

const parseIntent = (question: string): ParsedIntent | null => {
  const trimmed = question.trim();
  if (!trimmed) {
    return null;
  }

  const playerHistoryPatterns = [
    /(?:show\s+)?player history\s+(?:for|of)\s+(.+)/i,
    /history\s+(?:for|of)\s+(.+)/i,
  ];

  for (const pattern of playerHistoryPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return { intent: "player_history", player: cleanQueryTerm(match[1]) };
    }
  }

  const bestWeeksPatterns = [/best weeks\s+for\s+(.+)/i, /top weeks\s+for\s+(.+)/i];
  for (const pattern of bestWeeksPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return { intent: "best_weeks", player: cleanQueryTerm(match[1]) };
    }
  }

  const recordMatch = trimmed.match(/team record\s+(?:for\s+)?(.+?)\s+in\s+(\d{4})/i);
  if (recordMatch?.[1] && recordMatch?.[2]) {
    const year = Number(recordMatch[2]);
    const team = cleanQueryTerm(recordMatch[1]);
    if (team && Number.isFinite(year)) {
      return { intent: "team_record", team, year };
    }
  }

  const recordMatchAlt = trimmed.match(/team record\s+in\s+(\d{4})\s+(?:for\s+)?(.+)/i);
  if (recordMatchAlt?.[1] && recordMatchAlt?.[2]) {
    const year = Number(recordMatchAlt[1]);
    const team = cleanQueryTerm(recordMatchAlt[2]);
    if (team && Number.isFinite(year)) {
      return { intent: "team_record", team, year };
    }
  }

  const blowoutsMatch = trimmed.match(/biggest blowouts\s+in\s+(\d{4})/i);
  if (blowoutsMatch?.[1]) {
    return { intent: "biggest_blowouts", year: Number(blowoutsMatch[1]) };
  }

  const headToHeadMatch = trimmed.match(/head[-\s]?to[-\s]?head\s+between\s+(.+?)\s+and\s+(.+)/i);
  if (headToHeadMatch?.[1] && headToHeadMatch?.[2]) {
    return {
      intent: "head_to_head",
      teamA: cleanQueryTerm(headToHeadMatch[1]),
      teamB: cleanQueryTerm(headToHeadMatch[2]),
    };
  }

  return null;
};

const resolveTeamDisplayName = (seasons: SeasonData[], input: string): string | null => {
  const normalizedInput = normalizeTeam(input);
  if (!normalizedInput) {
    return null;
  }
  const teams: string[] = [];
  seasons.forEach((season) => {
    season.teams.forEach((team) => {
      if (team.team_name) {
        teams.push(team.team_name);
      }
      if (team.owner) {
        teams.push(team.owner);
      }
    });
  });

  const exact = teams.find((team) => normalizeTeam(team) === normalizedInput);
  if (exact) {
    return exact;
  }

  const partial = teams.find((team) => normalizeTeam(team).includes(normalizedInput));
  if (partial) {
    return partial;
  }

  const reversePartial = teams.find((team) => normalizedInput.includes(normalizeTeam(team)));
  return reversePartial ?? null;
};

const findTeamInSeason = (season: SeasonData, input: string) => {
  const normalizedInput = normalizeTeam(input);
  return (
    season.teams.find((team) => team.team_name && normalizeTeam(team.team_name) === normalizedInput) ??
    season.teams.find((team) => team.owner && normalizeTeam(team.owner) === normalizedInput) ??
    season.teams.find(
      (team) =>
        team.team_name &&
        (normalizeTeam(team.team_name).includes(normalizedInput) ||
          normalizedInput.includes(normalizeTeam(team.team_name))),
    ) ??
    season.teams.find(
      (team) =>
        team.owner &&
        (normalizeTeam(team.owner).includes(normalizedInput) ||
          normalizedInput.includes(normalizeTeam(team.owner))),
    ) ??
    null
  );
};

const buildPlayerHistoryResult = (
  seasons: SeasonData[],
  player: string,
): AiHelperResponse => {
  const profile = selectPlayerProfile(seasons, player);
  if (!profile) {
    return {
      status: "no_data",
      intent: "player_history",
      query: player,
      citations: [],
      message: "No data found.",
    };
  }

  const seasonsResult = profile.seasons.map((season) => ({
    season: season.season,
    games: season.games,
    totalPoints: season.totalPoints,
    avgPoints: season.avgPoints,
    maxPoints: season.maxPoints,
    bestWeek: season.bestWeek ?? null,
  }));

  const citations = profile.seasons
    .map((season) => {
      if (!season.bestWeek) {
        return null;
      }
      const weekEntry = season.weeks.find((week) => week.week === season.bestWeek);
      return {
        year: season.season,
        week: season.bestWeek,
        gameId: buildGameId(season.season, season.bestWeek, weekEntry?.team ?? null, weekEntry?.opponent ?? null),
        note: "Best week",
      } satisfies Citation;
    })
    .filter(Boolean) as Citation[];

  return {
    status: "ok",
    intent: "player_history",
    query: player,
    results: {
      player: profile.player,
      seasons: seasonsResult,
    },
    citations,
  };
};

const buildBestWeeksResult = (seasons: SeasonData[], player: string): AiHelperResponse => {
  const profile = selectPlayerProfile(seasons, player);
  if (!profile) {
    return {
      status: "no_data",
      intent: "best_weeks",
      query: player,
      citations: [],
      message: "No data found.",
    };
  }

  const weekEntries = profile.seasons.flatMap((season) =>
    season.weeks.map((week) => ({
      season: season.season,
      week: week.week,
      points: week.points,
      team: week.team,
      opponent: week.opponent,
    })),
  );

  const sortedWeeks = weekEntries
    .filter((week) => week.points !== null && week.points !== undefined)
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_RESULTS);

  if (sortedWeeks.length === 0) {
    return {
      status: "no_data",
      intent: "best_weeks",
      query: player,
      citations: [],
      message: "No data found.",
    };
  }

  const citations = sortedWeeks.map((week) => ({
    year: week.season,
    week: week.week,
    gameId: buildGameId(week.season, week.week, week.team ?? null, week.opponent ?? null),
    note: "Player week",
  }));

  return {
    status: "ok",
    intent: "best_weeks",
    query: player,
    results: {
      player: profile.player,
      weeks: sortedWeeks,
    },
    citations,
  };
};

const buildTeamRecordResult = (
  seasons: SeasonData[],
  team: string,
  year: number,
): AiHelperResponse => {
  const season = seasons.find((item) => item.year === year);
  if (!season) {
    return {
      status: "no_data",
      intent: "team_record",
      query: `${team} ${year}`,
      citations: [],
      message: "No data found.",
    };
  }

  const teamEntry = findTeamInSeason(season, team);
  if (!teamEntry || !teamEntry.team_name) {
    return {
      status: "no_data",
      intent: "team_record",
      query: `${team} ${year}`,
      citations: [],
      message: "No data found.",
    };
  }

  return {
    status: "ok",
    intent: "team_record",
    query: `${team} ${year}`,
    results: {
      team: teamEntry.team_name,
      year,
      record: teamEntry.record ?? null,
      pointsFor: teamEntry.points_for ?? null,
      pointsAgainst: teamEntry.points_against ?? null,
      regularSeasonRank: teamEntry.regular_season_rank ?? null,
      finalRank: teamEntry.final_rank ?? null,
    },
    citations: [
      {
        year,
        note: "Season team record",
      },
    ],
  };
};

const buildBiggestBlowoutsResult = (seasons: SeasonData[], year: number): AiHelperResponse => {
  const season = seasons.find((item) => item.year === year);
  if (!season) {
    return {
      status: "no_data",
      intent: "biggest_blowouts",
      query: `${year}`,
      citations: [],
      message: "No data found.",
    };
  }

  const games = season.matchups
    .filter(
      (matchup) =>
        matchup.week !== null &&
        matchup.week !== undefined &&
        matchup.home_team &&
        matchup.away_team &&
        matchup.home_score !== null &&
        matchup.home_score !== undefined &&
        matchup.away_score !== null &&
        matchup.away_score !== undefined,
    )
    .map((matchup) => {
      const margin = Math.abs(matchup.home_score - matchup.away_score);
      return {
        year,
        week: matchup.week ?? 0,
        homeTeam: matchup.home_team ?? "",
        awayTeam: matchup.away_team ?? "",
        homeScore: matchup.home_score ?? 0,
        awayScore: matchup.away_score ?? 0,
        margin,
        isPlayoff: matchup.is_playoff ?? null,
      } satisfies BlowoutResult;
    })
    .sort((a, b) => b.margin - a.margin)
    .slice(0, MAX_RESULTS);

  if (games.length === 0) {
    return {
      status: "no_data",
      intent: "biggest_blowouts",
      query: `${year}`,
      citations: [],
      message: "No data found.",
    };
  }

  const citations = games.map((game) => ({
    year: game.year,
    week: game.week,
    gameId: buildGameId(game.year, game.week, game.homeTeam, game.awayTeam),
    note: "Matchup",
  }));

  return {
    status: "ok",
    intent: "biggest_blowouts",
    query: `${year}`,
    results: {
      year,
      games,
    },
    citations,
  };
};

const buildHeadToHeadResult = (
  seasons: SeasonData[],
  teamA: string,
  teamB: string,
): AiHelperResponse => {
  const displayA = resolveTeamDisplayName(seasons, teamA) ?? teamA;
  const displayB = resolveTeamDisplayName(seasons, teamB) ?? teamB;
  const normalizedA = normalizeTeam(displayA);
  const normalizedB = normalizeTeam(displayB);

  const games: HeadToHeadGame[] = [];

  seasons.forEach((season) => {
    season.matchups.forEach((matchup) => {
      if (
        matchup.week === null ||
        matchup.week === undefined ||
        !matchup.home_team ||
        !matchup.away_team ||
        matchup.home_score === null ||
        matchup.home_score === undefined ||
        matchup.away_score === null ||
        matchup.away_score === undefined
      ) {
        return;
      }
      const homeNormalized = normalizeTeam(matchup.home_team);
      const awayNormalized = normalizeTeam(matchup.away_team);
      const isMatch =
        (homeNormalized === normalizedA && awayNormalized === normalizedB) ||
        (homeNormalized === normalizedB && awayNormalized === normalizedA);
      if (!isMatch) {
        return;
      }

      let winner: string | null = null;
      if (matchup.home_score > matchup.away_score) {
        winner = matchup.home_team;
      } else if (matchup.away_score > matchup.home_score) {
        winner = matchup.away_team;
      }

      games.push({
        year: season.year,
        week: matchup.week ?? 0,
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        homeScore: matchup.home_score ?? 0,
        awayScore: matchup.away_score ?? 0,
        winner,
        isPlayoff: matchup.is_playoff ?? null,
      });
    });
  });

  if (games.length === 0) {
    return {
      status: "no_data",
      intent: "head_to_head",
      query: `${teamA} vs ${teamB}`,
      citations: [],
      message: "No data found.",
    };
  }

  const sortedGames = games.sort((a, b) => a.year - b.year || a.week - b.week);
  let teamAWins = 0;
  let teamBWins = 0;
  let ties = 0;

  sortedGames.forEach((game) => {
    if (!game.winner) {
      ties += 1;
      return;
    }
    if (normalizeTeam(game.winner) === normalizedA) {
      teamAWins += 1;
      return;
    }
    if (normalizeTeam(game.winner) === normalizedB) {
      teamBWins += 1;
      return;
    }
  });

  const citations = sortedGames.map((game) => ({
    year: game.year,
    week: game.week,
    gameId: buildGameId(game.year, game.week, game.homeTeam, game.awayTeam),
    note: "Matchup",
  }));

  return {
    status: "ok",
    intent: "head_to_head",
    query: `${displayA} vs ${displayB}`,
    results: {
      teamA: displayA,
      teamB: displayB,
      totalGames: sortedGames.length,
      teamAWins,
      teamBWins,
      ties,
      games: sortedGames,
    },
    citations,
  };
};

export function runAiHelperQuery(seasons: SeasonData[], question: string): AiHelperResponse {
  const parsed = parseIntent(question);
  if (!parsed) {
    return {
      status: "unsupported",
      intent: "unknown",
      query: question.trim(),
      citations: [],
      message:
        "Try one of these prompts: player history, best weeks, team record in YEAR, biggest blowouts in YEAR, head-to-head between teams.",
    };
  }

  switch (parsed.intent) {
    case "player_history":
      return buildPlayerHistoryResult(seasons, parsed.player);
    case "best_weeks":
      return buildBestWeeksResult(seasons, parsed.player);
    case "team_record":
      return buildTeamRecordResult(seasons, parsed.team, parsed.year);
    case "biggest_blowouts":
      return buildBiggestBlowoutsResult(seasons, parsed.year);
    case "head_to_head":
      return buildHeadToHeadResult(seasons, parsed.teamA, parsed.teamB);
    default:
      return {
        status: "unsupported",
        intent: "unknown",
        query: question.trim(),
        citations: [],
        message:
          "Try one of these prompts: player history, best weeks, team record in YEAR, biggest blowouts in YEAR, head-to-head between teams.",
      };
  }
}

export type {
  AiHelperIntent,
  AiHelperResponse,
  BestWeeksResult,
  BlowoutsResult,
  HeadToHeadResult,
  PlayerHistoryResult,
  TeamRecordResult,
};
