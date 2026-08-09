import React from "react";
import { ArrowUpRight, Crown, Medal, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, PageIntro, formatPct, formatPoints } from "../../components/v3/ArchiveUI";
import { useOwners } from "../../data/v3/hooks";

export default function OwnersPage(): React.ReactElement {
  const owners = useOwners();
  if (owners.isLoading) return <ArchiveLoading label="Calculating owner careers" />;
  if (owners.error || !owners.data) return <ArchiveError error={owners.error} />;
  const [leader, second, third] = owners.data.owners;

  return (
    <PageTransition>
      <PageIntro eyebrow="People, not usernames" title="Owner careers." description="Stable owner identities connect every team name, platform account, season, final, and rivalry. Team names change. The record follows the person." />

      <section className="owner-podium">
        {[second, leader, third].filter(Boolean).map((owner, displayIndex) => {
          const place = displayIndex === 1 ? 1 : displayIndex === 0 ? 2 : 3;
          return (
            <Link to={`/owners/${owner.ownerUid}`} key={owner.ownerUid} className={`owner-podium__place owner-podium__place--${place}`}>
              {place === 1 ? <Crown /> : <Medal />}
              <span>#{place} all time</span><strong>{owner.name}</strong><b>{owner.championships}</b><small>{owner.championships === 1 ? "championship" : "championships"}</small>
              <em>{owner.wins}–{owner.losses} · {formatPct(owner.winPct)}</em>
            </Link>
          );
        })}
      </section>

      <section className="archive-section">
        <div className="archive-section-heading"><div><span className="archive-eyebrow">Complete ledger</span><h2>Every owner</h2></div><p>Regular-season records from canonical TeamSeason rows. Finals and titles use accepted playoff results.</p></div>
        <div className="owner-directory">
          {owners.data.owners.map((owner, index) => (
            <Link to={`/owners/${owner.ownerUid}`} key={owner.ownerUid}>
              <span className="owner-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="owner-name"><strong>{owner.name}</strong><small>{owner.firstSeason}–{owner.lastSeason} · {owner.seasons} seasons</small></span>
              <span><small>Record</small><strong>{owner.wins}–{owner.losses}</strong></span>
              <span><small>Win rate</small><strong>{formatPct(owner.winPct)}</strong></span>
              <span><small>Points</small><strong>{formatPoints(owner.pointsFor)}</strong></span>
              <span className="owner-titles"><Trophy /><strong>{owner.championships}</strong><small>titles</small></span>
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      </section>
    </PageTransition>
  );
}
