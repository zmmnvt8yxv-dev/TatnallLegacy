import React from "react";
import { ArrowLeft, Crown, Swords, Trophy } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow, formatPct, formatPoints } from "../../components/v3/ArchiveUI";
import { useOwnerProfileV3 } from "../../data/v3/hooks";

export default function OwnerCareerPage(): React.ReactElement {
  const { ownerId = "" } = useParams();
  const profile = useOwnerProfileV3(ownerId);
  if (profile.isLoading) return <ArchiveLoading label="Opening the owner ledger" />;
  if (profile.error || !profile.data) return <ArchiveError error={profile.error} />;
  const { owner, teamHistory, headToHead, headToHeadCoverage, aliases } = profile.data;

  return (
    <PageTransition>
      <Link to="/owners" className="back-link"><ArrowLeft /> All owners</Link>
      <section className="owner-hero">
        <div className="owner-monogram">{owner.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
        <div><Eyebrow>{owner.active ? "Active owner" : "League alumnus"} · {owner.firstSeason}–{owner.lastSeason}</Eyebrow><h1>{owner.name}</h1><p>{aliases.length > 1 ? `Also recorded as ${aliases.filter((name) => name !== owner.name).join(", ")}.` : "A permanent Tatnall owner identity across every team name."}</p></div>
        <div className="owner-hero__titles"><Crown /><strong>{owner.championships}</strong><span>{owner.championships === 1 ? "championship" : "championships"}</span></div>
      </section>

      <section className="owner-kpis">
        <div><span>Career record</span><strong>{owner.wins}–{owner.losses}{owner.ties ? `–${owner.ties}` : ""}</strong></div>
        <div><span>Win rate</span><strong>{formatPct(owner.winPct)}</strong></div>
        <div><span>Finals</span><strong>{owner.finals}</strong><small>{owner.runnerUps} runner-up</small></div>
        <div><span>Career PF</span><strong>{formatPoints(owner.pointsFor)}</strong></div>
        <div><span>Seasons</span><strong>{owner.seasons}</strong></div>
      </section>

      <section className="archive-split">
        <div className="archive-panel">
          <Eyebrow>Team-name history</Eyebrow><h2>Season by season</h2>
          <div className="career-timeline">
            {teamHistory.map((season) => (
              <Link to={`/seasons/${season.season}`} key={season.teamSeasonUid} className={season.champion ? "won-title" : ""}>
                <span>{season.season}</span><div><strong>{season.teamName}</strong><small>{season.record.wins}–{season.record.losses} · {formatPoints(season.pointsFor)} PF</small></div>
                {season.champion ? <b><Trophy /> Champion</b> : season.runnerUp ? <b>Runner-up</b> : <em>Seed {season.seed ?? "—"}</em>}
              </Link>
            ))}
          </div>
        </div>
        <div className="archive-panel">
          <Eyebrow>Head to head</Eyebrow><h2>Rivalry ledger</h2>
          <p className="coverage-note">Verified matchup seasons only. Excludes {headToHeadCoverage.excludedSeasons.join(" and ")} because their matchup exports are partial.</p>
          <div className="rivalry-list">
            {headToHead.map((rival) => (
              <Link to={`/owners/${rival.ownerUid}`} key={rival.ownerUid}>
                <Swords /><div><strong>{rival.ownerName}</strong><small>{rival.games} meetings · {rival.playoffGames} playoff</small></div><b>{rival.wins}–{rival.losses}{rival.ties ? `–${rival.ties}` : ""}</b>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
