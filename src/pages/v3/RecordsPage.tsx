import React from "react";
import { Crown, Gauge, Medal, Target, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow, PageIntro, formatPct, formatPoints } from "../../components/v3/ArchiveUI";
import { useRecordsV3 } from "../../data/v3/hooks";

export default function RecordsPage(): React.ReactElement {
  const records = useRecordsV3();
  if (records.isLoading) return <ArchiveLoading label="Opening the record book" />;
  if (records.error || !records.data) return <ArchiveError error={records.error} />;
  const data = records.data;
  const highest = data.matchups.highestScore;
  const largest = data.matchups.largestWin;
  const closest = data.matchups.closestGame;
  const lowestSeed = data.playoffs.lowestSeedChampion;
  const formatMargin = (value: number): string => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  return (
    <PageTransition>
      <PageIntro eyebrow="Generated record book" title="The marks to beat." description={`Records are calculated from canonical matchups with complete coverage. Partial matchup exports (${data.meta.excludedSeasons.join(", ")}) are excluded instead of allowed to create false records.`} />

      <section className="record-feature-grid">
        <article className="record-feature record-feature--gold"><Zap /><Eyebrow>Highest team score</Eyebrow><strong>{formatPoints(highest.points)}</strong><h2>{highest.team.teamName}</h2><p>{highest.team.ownerName} · {highest.season} Week {highest.week}</p><small>vs. {highest.opponent.teamName} ({formatPoints(highest.opponentPoints)})</small></article>
        <article className="record-feature"><Target /><Eyebrow>Largest victory</Eyebrow><strong>+{formatPoints(largest.margin)}</strong><h2>{largest.team.teamName}</h2><p>{largest.team.ownerName} · {largest.season} Week {largest.week}</p><small>{formatPoints(largest.points)}–{formatPoints(largest.opponentPoints)}</small></article>
        <article className="record-feature"><Gauge /><Eyebrow>Closest finish</Eyebrow><strong>{formatMargin(closest.margin)}</strong><h2>{closest.team.teamName}</h2><p>{closest.season} Week {closest.week}</p><small>{formatPoints(closest.points)}–{formatPoints(closest.opponentPoints)}</small></article>
      </section>

      <section className="archive-split">
        <div className="archive-panel">
          <Eyebrow>Owner records</Eyebrow><h2>Championship table</h2>
          <div className="record-list">
            {data.ownerLeaders.championships.map((owner, index) => (
              <Link to={`/owners/${owner.ownerUid}`} key={owner.ownerUid}><span>{String(index + 1).padStart(2, "0")}</span><strong>{owner.name}</strong><small>{owner.finals} finals</small><b>{owner.championships}</b></Link>
            ))}
          </div>
          <Eyebrow>Most regular-season wins</Eyebrow>
          <div className="record-list record-list--compact">
            {data.ownerLeaders.wins.map((owner, index) => (
              <Link to={`/owners/${owner.ownerUid}`} key={owner.ownerUid}><span>{index + 1}</span><strong>{owner.name}</strong><small>{owner.seasons} seasons</small><b>{owner.wins}</b></Link>
            ))}
          </div>
        </div>
        <div className="archive-panel archive-panel--warm">
          <Crown className="panel-icon" /><Eyebrow>Playoff history</Eyebrow><h2>Seed mythology</h2>
          <div className="seed-record"><strong>#{lowestSeed.champion.seed}</strong><span>Lowest seed to win</span><h3>{lowestSeed.champion.ownerName}</h3><p>{lowestSeed.champion.teamName} · {lowestSeed.season}</p></div>
          <div className="seed-bars">
            {data.playoffs.titleCountBySeed.map((row) => (
              <div key={row.seed}><span>Seed {row.seed}</span><div><i style={{ width: `${Math.max(12, row.championships * 24)}%` }} /></div><strong>{row.championships}</strong></div>
            ))}
          </div>
        </div>
      </section>

      <section className="archive-section">
        <div className="archive-section-heading"><div><Eyebrow>Winning efficiency</Eyebrow><h2>Best career win rates</h2></div><p>Minimum three seasons.</p></div>
        <div className="win-rate-grid">
          {data.ownerLeaders.winPct.map((owner, index) => (
            <Link to={`/owners/${owner.ownerUid}`} key={owner.ownerUid}><Medal /><span>#{index + 1}</span><strong>{owner.name}</strong><b>{formatPct(owner.winPct)}</b><small>{owner.wins}–{owner.losses}</small></Link>
          ))}
        </div>
      </section>
    </PageTransition>
  );
}
