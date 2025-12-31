export type PlayerBio = {
  playerId: string;
  name: string;
  team?: string | null;
  position?: string | null;
  jersey?: string | null;
  headshot?: string | null;
};

export type PlayerSeasonStats = {
  playerId: string;
  playerName: string;
  season: number;
  team?: string | null;
  position?: string | null;
  stats: Record<string, number>;
};

export type PlayerWeeklyStats = {
  playerId: string;
  playerName: string;
  season: number;
  week: number;
  team?: string | null;
  position?: string | null;
  stats: Record<string, number>;
};

export type PlayerGameLogEntry = {
  playerId: string;
  season: number;
  week?: number | null;
  opponent?: string | null;
  result?: string | null;
  stats: Record<string, number>;
};

export type LiveStatsProviderId = "tank01" | "sportsdataio" | "custom";

export type PlayerTrendStats = {
  playerId: string;
  season: number;
  provider: LiveStatsProviderId;
  stats: Record<string, number>;
  updatedAt?: string | null;
  source?: string | null;
};
