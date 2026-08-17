import React from "react";
import { Link } from "react-router-dom";
import type { SeasonHubData } from "../../schemas/v3";
import { ownerSlug } from "../../data/season2026Editorial";

export type SeasonHubTeam = SeasonHubData["teams"][number];
export type SeasonHubMatchup = SeasonHubData["schedule"][number]["matchups"][number];

export function projectedRecord(team: SeasonHubTeam): string {
  const record = team.analysis.projectedRecord;
  return `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;
}

export function TeamIdentity({ team, compact = false }: { team: Pick<SeasonHubTeam, "ownerName" | "teamName" | "monogram" | "accent">; compact?: boolean }): React.ReactElement {
  return (
    <span className={`forecast-team-identity${compact ? " is-compact" : ""}`} style={{ "--team-accent": team.accent } as React.CSSProperties}>
      <i>{team.monogram}</i>
      <span><strong>{team.teamName}</strong><small>{team.ownerName}</small></span>
    </span>
  );
}

export function MatchupProjectionCard({ matchup, week, link = true }: { matchup: SeasonHubMatchup; week: number; link?: boolean }): React.ReactElement {
  const favorite = matchup.projectedFavoriteRosterId === matchup.teamA.rosterId ? matchup.teamA : matchup.teamB;
  const card = (
    <article className="forecast-matchup-card">
      <header><span>Week {week} · Matchup {matchup.matchupId}</span><strong>{matchup.projectedMargin.toFixed(1)}-point line</strong></header>
      {[{ team: matchup.teamA, score: matchup.projectedA }, { team: matchup.teamB, score: matchup.projectedB }].map(({ team, score }) => (
        <div key={team.rosterId} className={team.rosterId === favorite.rosterId ? "is-favorite" : ""} style={{ "--team-accent": team.accent } as React.CSSProperties}>
          <TeamIdentity team={team} compact />
          <b>{score.toFixed(1)}</b>
        </div>
      ))}
      <footer><span>Projected winner</span><strong>{favorite.teamName}</strong></footer>
    </article>
  );
  return link ? <Link className="forecast-matchup-link" to={`/2026/weeks/${week}#matchup-${matchup.matchupId}`}>{card}</Link> : card;
}

export function TeamPageLink({ team, children, className }: { team: Pick<SeasonHubTeam, "ownerName">; children: React.ReactNode; className?: string }): React.ReactElement {
  return <Link className={className} to={`/2026/teams/${ownerSlug(team.ownerName)}`}>{children}</Link>;
}
