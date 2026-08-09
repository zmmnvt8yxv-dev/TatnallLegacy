import React, { useMemo } from "react";
import { ArrowUpRight, CalendarClock, CheckCircle2, Crown, Database, Gavel, LockKeyhole, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow, OwnerLink, formatFreshness } from "../../components/v3/ArchiveUI";
import { features } from "../../config/features";
import { useEditorial, useHistory, useNow } from "../../data/v3/hooks";

export default function NowPage(): React.ReactElement {
  const now = useNow();
  const history = useHistory();
  const editorial = useEditorial();
  const titleLeaders = useMemo(() => {
    const counts = new Map<string, { uid: string | null; name: string; titles: number }>();
    for (const season of history.data?.seasons || []) {
      const key = season.champion.ownerUid || season.champion.ownerName;
      const row = counts.get(key) || { uid: season.champion.ownerUid, name: season.champion.ownerName, titles: 0 };
      row.titles += 1;
      counts.set(key, row);
    }
    return [...counts.values()].sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name)).slice(0, 3);
  }, [history.data]);

  if (now.isLoading || history.isLoading || editorial.isLoading) return <ArchiveLoading label="Opening the 2026 command center" />;
  if (now.error || history.error || editorial.error || !now.data || !history.data || !editorial.data) return <ArchiveError error={now.error || history.error || editorial.error} />;

  const data = now.data;
  const phaseLabel = data.league.phase === "preseason" ? "Preseason" : `Week ${data.league.week}`;
  const latestChampions = history.data.seasons.slice(0, 5);
  const draftDate = data.draft?.startTime ? new Date(data.draft.startTime) : null;
  const draftDateLabel = draftDate && !Number.isNaN(draftDate.getTime())
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(draftDate)
    : "Date not published";

  return (
    <PageTransition>
      <section className="now-hero">
        <div className="now-hero__grid" aria-hidden="true" />
        <div className="now-hero__main">
          <div className="live-line"><span /> {data.league.season} · {phaseLabel}</div>
          <h1>{editorial.data.lead.headline}</h1>
          <p>{editorial.data.lead.commissionerNote || editorial.data.lead.dek}</p>
          <div className="now-hero__actions">
            <Link to="/history" className="archive-button archive-button--primary">Explore the archive <ArrowUpRight /></Link>
            {features.playerIntelligenceV1 ? <Link to="/war-room" className="archive-button">Enter War Room</Link> : null}
          </div>
          <div className="freshness"><Database /> Sleeper snapshot · {formatFreshness(data.meta.sourceUpdatedAt.sleeper)}</div>
        </div>
        <aside className="champion-spotlight">
          <Eyebrow>Defending champion</Eyebrow>
          <Crown aria-hidden="true" />
          <strong>{data.defendingChampion.ownerName}</strong>
          <span>{data.defendingChampion.teamName}</span>
          <div className="champion-seed">{data.lastFinal.season} · #{data.defendingChampion.seed} seed</div>
        </aside>
      </section>

      <section className="archive-stat-strip" aria-label="League at a glance">
        <div><span>Seasons archived</span><strong>{history.data.meta.seasons}</strong><small>2015–2025</small></div>
        <div><span>Current teams</span><strong>{data.teams.length}</strong><small>2026 rosters linked</small></div>
        <div><span>Accepted champions</span><strong>{history.data.seasons.length}</strong><small>one per completed year</small></div>
        <div><span>Keepers locked</span><strong>{data.keeperStatus.submitted}</strong><small>{data.keeperStatus.teamsComplete}/{data.teams.length} teams complete</small></div>
      </section>

      <section className="broadcast-rankings">
        <header><div><Eyebrow>2025 final signal</Eyebrow><h2>Power, luck, and lineup command.</h2></div><p>Versioned and transparent: 45% points, 25% all-play, 20% manager efficiency, and 10% closing form.</p></header>
        <div className="broadcast-ranking-grid">{editorial.data.powerRankings.map((team) => <Link key={team.ownerUid} to={`/owners/${team.ownerUid}`} style={{ "--team-accent": team.accent } as React.CSSProperties}><span className="power-rank">{team.powerRank}</span><div><strong>{team.teamName}</strong><small>{team.ownerName}</small></div><span><small>Power</small><b>{team.powerScore}</b></span><span><small>xW</small><b>{team.expectedWins.toFixed(1)}</b></span><span className={team.luck >= 0 ? "positive" : "negative"}><small>Luck</small><b>{team.luck >= 0 ? "+" : ""}{team.luck.toFixed(1)}</b></span><span><small>Eff.</small><b>{team.managerEfficiency == null ? "—" : `${Math.round(team.managerEfficiency * 100)}%`}</b></span></Link>)}</div>
        <footer><Sparkles /><div><strong>{editorial.data.history.headline}</strong><span>{editorial.data.history.items[0]}</span></div><Link to="/data-health">Methodology <ArrowUpRight /></Link></footer>
      </section>

      <section className="draft-command">
        <div className="draft-command__status">
          <Eyebrow>2026 auction runway</Eyebrow>
          <Gavel aria-hidden="true" />
          <h2>{data.draft?.status === "pre_draft" ? "Draft night is scheduled." : "Draft status connected."}</h2>
          <p><CalendarClock /> {draftDateLabel}</p>
          <div className="draft-command__facts">
            <span><strong>${data.draft?.budget ?? "—"}</strong> budget</span>
            <span><strong>{data.draft?.rounds ?? "—"}</strong> roster spots</span>
            <span><strong>{data.draft?.nominationSeconds ?? "—"}s</strong> nominations</span>
          </div>
          {data.draft ? <a className="archive-button archive-button--primary" href={data.draft.sleeperUrl} target="_blank" rel="noreferrer">Open Sleeper draft room <ArrowUpRight /></a> : null}
        </div>
        <div className="draft-command__readiness">
          <div><CheckCircle2 /><span><strong>Keepers submitted</strong><small>{data.keeperStatus.submitted} of {data.keeperStatus.expected} slots filled</small></span></div>
          <div className={data.draft?.orderPublished ? "" : "is-waiting"}><LockKeyhole /><span><strong>Draft order</strong><small>{data.draft?.orderPublished ? "Published in Sleeper" : "Not published yet—no placeholder order shown"}</small></span></div>
          <div className={data.transactionStatus.recorded ? "" : "is-waiting"}><Database /><span><strong>2026 transaction feed</strong><small>{data.transactionStatus.recorded ? `${data.transactionStatus.completed} completed moves` : "No 2026 moves returned by Sleeper yet"}</small></span></div>
        </div>
      </section>

      <div className="archive-section-heading">
        <div><Eyebrow>Keeper board</Eyebrow><h2>Sixteen decisions are in.</h2></div>
        <p>These are the actual 2026 keepers from Sleeper. The rest of each card is the inherited preseason roster—not a submitted Week 1 lineup.</p>
      </div>

      <section className="current-team-grid">
        {data.teams.map((team) => (
          <article className="current-team-card" key={team.rosterId} style={{ "--team-accent": team.accent || "#d7a928" } as React.CSSProperties}>
            <div className="current-team-card__top">
              <span className="roster-number">0{team.rosterId}</span>
              <span className="division-label">Division {team.division}</span>
            </div>
            <h3>{team.teamName}</h3>
            <OwnerLink uid={team.ownerUid}>{team.ownerName}</OwnerLink>
            <div className="keeper-pair">
              {team.keepers.map((player) => (
                <Link key={player.sleeperId} to={`/players/${player.playerUid || player.sleeperId}`}>
                  <Crown /><span><small>{player.position || "—"} · {player.nflTeam || "FA"}</small><strong>{player.name}</strong></span>
                </Link>
              ))}
            </div>
            <div className="roster-summary">
              <span><Users /> {team.players.length} players</span>
              <span>Waiver #{team.waiverPosition ?? "—"}</span>
            </div>
            <details>
              <summary>Roster snapshot</summary>
              <div className="mini-roster">
                {team.players.filter((player) => !player.keeper).slice(0, 13).map((player) => (
                  <Link key={player.sleeperId} to={`/players/${player.playerUid || player.sleeperId}`}>
                    <span>{player.position || "—"}</span>{player.name}<small>{player.nflTeam || "FA"}</small>
                  </Link>
                ))}
              </div>
            </details>
          </article>
        ))}
      </section>

      {data.draft?.picks.length ? (
        <section className="archive-section future-feed">
          <div className="archive-section-heading"><div><Eyebrow>Live auction board</Eyebrow><h2>{data.draft.pickCount} picks are in.</h2></div><p>The board refreshes from Sleeper automatically as the auction advances.</p></div>
          <div className="standings-table-wrap draft-table-wrap">
            <table className="archive-table"><thead><tr><th>Pick</th><th>Player</th><th>Position</th><th>Winning team</th><th>Price</th></tr></thead><tbody>{data.draft.picks.map((pick) => <tr key={pick.pickNo}><td>{pick.pickNo}</td><td><Link to={`/players/${pick.playerUid || pick.sleeperId}`}>{pick.name}</Link></td><td>{pick.position || "—"} · {pick.nflTeam || "FA"}</td><td><strong>{pick.team?.teamName || "—"}</strong><small>{pick.team?.ownerName || ""}</small></td><td><b className="auction-price">${pick.amount ?? 0}</b></td></tr>)}</tbody></table>
          </div>
        </section>
      ) : null}

      {data.currentWeekLineups.length ? (
        <section className="archive-section future-feed">
          <div className="archive-section-heading"><div><Eyebrow>Week {data.league.week}</Eyebrow><h2>Submitted lineups.</h2></div><p>Starter points and matchup totals switch on only when Sleeper publishes the week.</p></div>
          <div className="live-lineup-grid">{data.currentWeekLineups.map((lineup) => <article key={lineup.rosterId}><header><strong>{lineup.team?.teamName || `Roster ${lineup.rosterId}`}</strong><b>{lineup.points == null ? "—" : lineup.points.toFixed(1)}</b></header><div>{lineup.starters.map((player) => <Link key={player.sleeperId} to={`/players/${player.playerUid || player.sleeperId}`}><span>{player.position || "—"}</span><strong>{player.name}</strong><b>{player.points == null ? "—" : player.points.toFixed(1)}</b></Link>)}</div></article>)}</div>
        </section>
      ) : null}

      {data.recentTransactions.length ? (
        <section className="archive-section future-feed">
          <div className="archive-section-heading"><div><Eyebrow>Live league activity</Eyebrow><h2>Recent transactions.</h2></div><p>The latest 20 completed 2026 moves; failed claims are never shown as completed.</p></div>
          <div className="transaction-ledger live-transaction-ledger">{data.recentTransactions.map((transaction) => <article key={transaction.transactionId}><div className="transaction-ledger__meta"><span>Week {transaction.week}</span><strong>{transaction.type.replaceAll("_", " ")}</strong><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(transaction.createdAt))}</time>{transaction.waiverBid != null ? <b>${transaction.waiverBid} FAAB</b> : null}</div><div className="transaction-assets">{transaction.assets.map((asset) => <div key={`${transaction.transactionId}-${asset.sleeperId}`}><Link to={`/players/${asset.playerUid || asset.sleeperId}`}><span>{asset.position || "—"}</span><strong>{asset.name}</strong></Link><small>{asset.from ? `${asset.from.teamName} → ` : "Added by "}{asset.to?.teamName || "Free agency"}</small></div>)}</div></article>)}</div>
        </section>
      ) : null}

      <section className="archive-split">
        <div className="archive-panel">
          <div className="archive-panel__head"><div><Eyebrow>Championship lineage</Eyebrow><h2>Recent title holders</h2></div><Link to="/history">All seasons <ArrowUpRight /></Link></div>
          <div className="champion-lineage">
            {latestChampions.map((season) => (
              <Link to={`/seasons/${season.season}`} key={season.season}>
                <span className="lineage-year">{season.season}</span>
                <span className="lineage-mark"><Trophy /></span>
                <span><strong>{season.champion.ownerName}</strong><small>{season.champion.teamName} · Seed {season.champion.seed}</small></span>
                {season.corrected ? <ShieldCheck className="lineage-corrected" aria-label="League ruling applied" /> : <ArrowUpRight />}
              </Link>
            ))}
          </div>
        </div>
        <div className="archive-panel archive-panel--warm">
          <Eyebrow>League royalty</Eyebrow>
          <h2>The title table</h2>
          <div className="title-podium">
            {titleLeaders.map((owner, index) => (
              <OwnerLink uid={owner.uid} key={owner.name}>
                <span>0{index + 1}</span><strong>{owner.name}</strong><b>{owner.titles}</b><small>{owner.titles === 1 ? "title" : "titles"}</small>
              </OwnerLink>
            ))}
          </div>
          <Link to="/owners" className="archive-button archive-button--dark">All owner careers <ArrowUpRight /></Link>
        </div>
      </section>

      <section className="archive-callout">
        <Sparkles />
        <div><Eyebrow>Built for what comes next</Eyebrow><h2>One source of truth.</h2><p>Every correction is audited, every incomplete dataset is labeled, and the live season no longer depends on a stale 2025 ID.</p></div>
        <Link to="/data-health">Inspect data health <ArrowUpRight /></Link>
      </section>
    </PageTransition>
  );
}
