import React, { useMemo } from "react";
import { ArrowUpRight, Medal, Quote } from "lucide-react";
import { Link } from "react-router-dom";
import { Eyebrow } from "./ArchiveUI";
import { TeamIdentity, TeamPageLink } from "./Season2026UI";
import { useSeasonHub } from "../../data/v3/hooks";
import { samuel2026PowerRankings, type SamuelRankingEntity } from "../../data/samuel2026PowerRankings";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function SamuelPowerRankings(): React.ReactElement | null {
  const hub = useSeasonHub();
  const teams = hub.data?.teams || [];

  const leaguePlayers = useMemo(() => teams.flatMap((team) =>
    team.players.map((player) => ({ player, team })),
  ), [teams]);

  if (!hub.data || teams.length !== 8) return null;

  const resolveEntity = (entity: SamuelRankingEntity, rankingOwner: string) => {
    if (entity.kind === "owner") {
      const team = teams.find((candidate) => candidate.ownerName === entity.owner);
      return team ? { kind: "owner" as const, team } : null;
    }

    const search = (entity.search || entity.label).toLowerCase();
    const rankingTeam = teams.find((candidate) => candidate.ownerName === rankingOwner);
    const onRankingTeam = rankingTeam?.players.find((player) => {
      const name = player.name.toLowerCase();
      return name === search || name.includes(search) || search.includes(name);
    });
    if (onRankingTeam) return { kind: "player" as const, player: onRankingTeam, team: rankingTeam };

    const leagueMatch = leaguePlayers.find(({ player }) => {
      const name = player.name.toLowerCase();
      return name === search || name.includes(search) || search.includes(name);
    });
    return leagueMatch ? { kind: "player" as const, ...leagueMatch } : null;
  };

  const renderAnalysis = (analysis: string, entities: readonly SamuelRankingEntity[], rankingOwner: string) => {
    if (!entities.length) return analysis;
    const labels = [...entities].sort((a, b) => b.label.length - a.label.length).map((entity) => escapeRegExp(entity.label));
    const splitter = new RegExp(`(${labels.join("|")})`, "g");

    return analysis.split(splitter).map((part, index) => {
      const entity = entities.find((candidate) => candidate.label === part);
      if (!entity) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      const resolved = resolveEntity(entity, rankingOwner);
      if (!resolved) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;

      if (resolved.kind === "owner") {
        return (
          <TeamPageLink team={resolved.team} key={`${part}-${index}`} className="archive-inline-link">
            <span title={`Open ${resolved.team.ownerName}'s 2026 team dossier`}>{part}</span>
          </TeamPageLink>
        );
      }

      const playerId = resolved.player.playerUid || resolved.player.sleeperId;
      const tooltip = `${resolved.player.name} · ${resolved.player.position || "—"} · ${resolved.player.nflTeam || "FA"} · ${resolved.team.ownerName}'s roster`;
      return (
        <Link key={`${part}-${index}`} className="archive-inline-link" to={`/players/${playerId}`} title={tooltip} aria-label={`${part}: open ${resolved.player.name} player page`}>
          {part}
        </Link>
      );
    });
  };

  return (
    <section className="forecast-section" id="samuel-power-rankings" aria-labelledby="samuel-power-rankings-title">
      <div className="archive-section-heading">
        <div>
          <Eyebrow>{samuel2026PowerRankings.phase}</Eyebrow>
          <h2 id="samuel-power-rankings-title">Samuel’s Post-Draft Power Rankings.</h2>
        </div>
        <p><Quote /> The first manager-submitted board of the 2026 season. Samuel’s wording is preserved; linked names open the relevant player or fantasy-team archive page.</p>
      </div>

      <div className="transaction-forecast-grid">
        {samuel2026PowerRankings.rankings.map((ranking) => {
          const team = teams.find((candidate) => candidate.ownerName === ranking.owner);
          if (!team) return null;
          return (
            <article key={ranking.owner} style={{ "--team-accent": team.accent } as React.CSSProperties}>
              <header>
                <TeamPageLink team={team} className="forecast-team-link">
                  <TeamIdentity team={team} compact />
                </TeamPageLink>
                <span className="transaction-tone transaction-tone--sharp" title={`Samuel ranked ${ranking.owner} #${ranking.rank} after the 2026 draft`}>
                  <Medal /> #{ranking.rank}
                </span>
              </header>
              <blockquote>{renderAnalysis(ranking.analysis, ranking.entities, ranking.owner)}</blockquote>
              <TeamPageLink team={team}>Open {ranking.owner}’s 2026 dossier <ArrowUpRight /></TeamPageLink>
            </article>
          );
        })}
      </div>
      <div className="projection-disclosure">
        <Quote />
        <p><strong>Source:</strong> Samuel · 2026 Post-Draft Power Rankings. This is manager opinion preserved as preseason league history, separate from the site’s model-driven projections.</p>
        <time>Submitted preseason 2026</time>
      </div>
    </section>
  );
}
