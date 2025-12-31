export const NFL_TEAM_LOGO_BASE = "https://static.www.nfl.com/league/api/clubs/logos";

export function getNflTeamLogoUrl(team: string): string {
  return `${NFL_TEAM_LOGO_BASE}/${team}.svg`;
}

export function getSleeperHeadshotUrl(playerId: string): string {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

export function getPlayerInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
