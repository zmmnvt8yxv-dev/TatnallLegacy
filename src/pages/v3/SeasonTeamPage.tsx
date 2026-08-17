import React, { useMemo } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeDollarSign, Crown,
  History, Lightbulb, Repeat2, ShieldAlert, Sparkles, Target, Trophy, Users,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow } from "../../components/v3/ArchiveUI";
import { TeamIdentity, projectedRecord } from "../../components/v3/Season2026UI";
import { findOwnerEditorial, ownerSlug, season2026Editorial } from "../../data/season2026Editorial";
import { useNow, useOwnerProfileV3, useOwners, useSeasonHub } from "../../data/v3/hooks";

function playerOutlook(points: number, injuryStatus?: string | null): string {
  const base = points >= 240 ? "League-winning ceiling with a foundational weekly role."
    : points >= 190 ? "Premium starter whose volume should survive ordinary matchup swings."
      : points >= 150 ? "Every-week starter with a stable path to useful volume."
        : points >= 110 ? "Lineup-rotation player; matchup and role growth decide the ceiling."
          : "Depth bet who needs an injury, role change or projection miss to become a regular start.";
  return injuryStatus ? `${base} ${injuryStatus} status widens the early-season range.` : base;
}

export default function SeasonTeamPage(): React.ReactElement {
  const { ownerId } = useParams<{ ownerId: string }>();
  const hub = useSeasonHub();
  const owners = useOwners();
  const now = useNow();
  const editorialFromRoute = findOwnerEditorial(ownerId);
  const team = hub.data?.teams.find((row) => row.ownerName === editorialFromRoute?.ownerName || row.ownerUid === ownerId);
  const profile = useOwnerProfileV3(team?.ownerUid || "");

  const leaguePlayers = useMemo(() => {
    const rows = (hub.data?.teams || []).flatMap((row) => row.players.map((player) => ({ ...player, fantasyTeam: row })));
    const positionCounts = new Map<string, number>();
    return rows.sort((a, b) => b.regularSeasonProjection - a.regularSeasonProjection).map((player, index) => {
      const position = player.position || "—";
      const positionRank = (positionCounts.get(position) || 0) + 1;
      positionCounts.set(position, positionRank);
      return { ...player, overallRank: index + 1, positionRank };
    });
  }, [hub.data]);

  if (hub.isLoading || owners.isLoading || now.isLoading) return <ArchiveLoading label="Opening the 2026 team dossier" />;
  if (hub.error || owners.error || now.error || !hub.data || !owners.data || !now.data) return <ArchiveError error={hub.error || owners.error || now.error} />;
  if (!team || !editorialFromRoute) return <Navigate to="/2026" replace />;
  if (profile.isLoading) return <ArchiveLoading label={`Loading ${team.ownerName}'s full history`} />;
  if (profile.error || !profile.data) return <ArchiveError error={profile.error} />;

  const editorial = season2026Editorial[team.ownerName];
  const career = owners.data.owners.find((owner) => owner.ownerUid === team.ownerUid);
  const teamPlayers = leaguePlayers.filter((player) => player.fantasyTeam.rosterId === team.rosterId);
  const orderedTeams = [...hub.data.teams].sort((a, b) => a.analysis.projectionRank - b.analysis.projectionRank);
  const teamIndex = orderedTeams.findIndex((row) => row.rosterId === team.rosterId);
  const previousTeam = orderedTeams[(teamIndex + orderedTeams.length - 1) % orderedTeams.length];
  const nextTeam = orderedTeams[(teamIndex + 1) % orderedTeams.length];
  const weeklyPath = hub.data.schedule.map((week) => {
    const matchup = week.matchups.find((row) => row.teamA.rosterId === team.rosterId || row.teamB.rosterId === team.rosterId)!;
    const isA = matchup.teamA.rosterId === team.rosterId;
    const opponent = isA ? matchup.teamB : matchup.teamA;
    const projected = isA ? matchup.projectedA : matchup.projectedB;
    const opponentProjected = isA ? matchup.projectedB : matchup.projectedA;
    return { week: week.week, opponent, projected, opponentProjected, win: projected > opponentProjected, margin: Math.abs(projected - opponentProjected) };
  });
  const currentMoves = now.data.recentTransactions.filter((transaction) => transaction.assets.some((asset) => asset.to?.ownerUid === team.ownerUid || asset.from?.ownerUid === team.ownerUid));
  const valueBuys = [...teamPlayers].filter((player) => player.draftPrice != null).sort((a, b) => (b.regularSeasonProjection / Math.max(b.draftPrice || 1, 1)) - (a.regularSeasonProjection / Math.max(a.draftPrice || 1, 1))).slice(0, 3);
  const predictedFinish = [...hub.data.teams].sort((a, b) => b.analysis.projectedRecord.wins - a.analysis.projectedRecord.wins || b.analysis.projectedRegularSeasonPoints - a.analysis.projectedRegularSeasonPoints).findIndex((row) => row.rosterId === team.rosterId) + 1;

  return (
    <PageTransition>
      <nav className="forecast-breadcrumb"><Link to="/2026"><ArrowLeft /> 2026 projection</Link><span>/</span><strong>{team.ownerName}</strong><Link to={`/owners/${team.ownerUid}`}>Career archive <History /></Link></nav>

      <section className="team-dossier-hero" style={{ "--team-accent": team.accent } as React.CSSProperties}>
        <div className="team-dossier-hero__mark">{team.monogram}</div>
        <div><Eyebrow>2026 team & owner dossier · Power #{team.analysis.projectionRank}</Eyebrow><h1>{team.teamName}</h1><p>{team.ownerName} · {editorial.verdict} · {team.motto}</p><div><span>{team.analysis.grade}<small>roster grade</small></span><span>{projectedRecord(team)}<small>projected record</small></span><span>{team.analysis.projectedWeeklyAverage.toFixed(1)}<small>projected PPG</small></span><span>#{team.analysis.scheduleStrengthRank}<small>schedule difficulty</small></span></div></div>
        <aside><span>Predicted finish</span><strong>#{predictedFinish}</strong><small>{team.analysis.tier}</small></aside>
      </section>

      <section className="team-dossier-thesis">
        <article><Eyebrow>The 2026 read</Eyebrow><h2>{team.analysis.headline}</h2><p>{editorial.thesis}</p><div className="thesis-scenarios"><span><Crown /><b>How this team wins</b>{editorial.titleCase}</span><span><ShieldAlert /><b>How it falls apart</b>{editorial.collapseCase}</span></div></article>
        <aside><Eyebrow>Position-room ranks</Eyebrow>{team.analysis.positionGroups.map((group) => <div key={group.position}><span><b>{group.position}</b><small>#{group.rank} of 8</small></span><i><em style={{ width: `${((9 - group.rank) / 8) * 100}%` }} /></i><strong>{group.projectedWeeklyPoints.toFixed(1)}</strong></div>)}</aside>
      </section>

      <section className="forecast-section team-schedule-path">
        <div className="archive-section-heading"><div><Eyebrow>Median regular-season path</Eyebrow><h2>Fourteen games, one pressure map.</h2></div><p>Each result is the current projection favorite, not a confidence guarantee. Click any week for its full matchup and starter-level breakdown.</p></div>
        <div className="team-week-strip">{weeklyPath.map((row) => <Link to={`/2026/weeks/${row.week}`} className={row.win ? "is-win" : "is-loss"} key={row.week}><span>W{row.week}</span><TeamIdentity team={row.opponent} compact /><b>{row.win ? "W" : "L"}</b><small>{row.projected.toFixed(1)}–{row.opponentProjected.toFixed(1)} · {row.margin.toFixed(1)} line</small></Link>)}</div>
      </section>

      <section className="forecast-section">
        <div className="archive-section-heading"><div><Eyebrow>All {teamPlayers.length} rostered players</Eyebrow><h2>Player-by-player forecast.</h2></div><p>Overall and positional ranks compare every finalized 2026 Tatnall roster. Season totals cover projected Weeks 1–14.</p></div>
        <div className="forecast-table-wrap">
          <div className="forecast-table forecast-table--team-players" role="table" aria-label={`${team.teamName} player projections`}>
            <div className="forecast-table__head"><span>Team RK</span><span>Player</span><span>League / Pos.</span><span>Projection</span><span>Cost</span><span>Role</span><span>Analysis</span></div>
            {teamPlayers.map((player, index) => <Link to={`/players/${player.playerUid || player.sleeperId}`} className="forecast-table__row" key={player.sleeperId}>
              <span className="forecast-seed">{index + 1}</span>
              <span><b>{player.name}</b><small>{player.nflTeam || "FA"} · {player.position || "—"}{player.injuryStatus ? ` · ${player.injuryStatus}` : ""}</small></span>
              <span><b>#{player.overallRank}</b><small>{player.position || "—"}{player.positionRank}</small></span>
              <span><b>{player.regularSeasonProjection.toFixed(1)}</b><small>{(player.regularSeasonProjection / 14).toFixed(1)} PPG</small></span>
              <span><b>{player.draftPrice == null ? "FA" : `$${player.draftPrice}`}</b><small>{player.keeper ? "keeper" : "auction"}</small></span>
              <span><b>{index < 3 ? "Engine" : player.regularSeasonProjection >= 150 ? "Starter" : player.regularSeasonProjection >= 100 ? "Rotation" : "Depth"}</b><small>{player.weekOneProjection.toFixed(1)} W1</small></span>
              <span><p>{playerOutlook(player.regularSeasonProjection, player.injuryStatus)}</p></span>
            </Link>)}
          </div>
        </div>
      </section>

      <section className="forecast-section team-auction-review">
        <div className="archive-section-heading"><div><Eyebrow>Draft construction</Eyebrow><h2>The $200 autopsy.</h2></div><p>Price is not value by itself; the projection-to-dollar ratio highlights where the roster purchased useful volume cheaply.</p></div>
        <div className="auction-review-grid">
          <article><BadgeDollarSign /><span>Keeper spend<strong>${team.draftRecap.keeperSpend}</strong></span><span>Auction spend<strong>${team.draftRecap.auctionSpend}</strong></span><span>Unspent<strong>${team.draftRecap.unspent}</strong></span><span>Players<strong>{team.draftRecap.picks}</strong></span></article>
          <article><Eyebrow>Best projected values</Eyebrow>{valueBuys.map((player, index) => <Link to={`/players/${player.playerUid || player.sleeperId}`} key={player.sleeperId}><span>0{index + 1}</span><strong>{player.name}</strong><small>{player.regularSeasonProjection.toFixed(1)} pts</small><b>${player.draftPrice}</b></Link>)}</article>
          <article><Eyebrow>Largest bet</Eyebrow>{team.draftRecap.largestPurchase ? <><strong>{team.draftRecap.largestPurchase.name}</strong><b>${team.draftRecap.largestPurchase.amount}</b><p>The purchase defines the auction thesis. It must perform like a top-of-roster engine for the construction to pay off.</p></> : <p>No auction purchase is available.</p>}</article>
        </div>
      </section>

      <section className="forecast-section transaction-autopsy">
        <div className="archive-section-heading"><div><Eyebrow>Owner transaction dossier</Eyebrow><h2>Past behavior, future chaos.</h2></div><p>2025 is the first complete transaction season, so it carries the evidence. Older partial years remain visible in the archive but are not treated as equivalent samples.</p></div>
        <div className="transaction-autopsy-grid">
          <article><header><Repeat2 /><div><Eyebrow>2025 completed ledger</Eyebrow><h3>{editorial.transactions2025.completed} moves · {editorial.transactions2025.trades} trades</h3></div></header><p>{editorial.managerPattern}</p><dl><div><dt>Waivers</dt><dd>{editorial.transactions2025.waivers}</dd></div><div><dt>Free agents</dt><dd>{editorial.transactions2025.freeAgents}</dd></div><div><dt>Trades</dt><dd>{editorial.transactions2025.trades}</dd></div></dl></article>
          <article className="move-cards"><span className="is-good"><Sparkles /><b>Good pickup</b>{editorial.waiverWin}</span><span className="is-trade"><Target /><b>Good / defining trade</b>{editorial.signatureMove}</span><span className="is-bad"><ShieldAlert /><b>Stupid-trade risk</b>{editorial.cautionaryMove}</span></article>
          <article className="prediction-card"><Lightbulb /><Eyebrow>2026 transaction prediction</Eyebrow><h3>{editorial.verdict}</h3><p>{editorial.transactionPrediction}</p></article>
        </div>
        {currentMoves.length ? <div className="current-move-strip"><strong>Already in 2026</strong>{currentMoves.map((transaction) => <span key={transaction.transactionId}>W{transaction.week} · {transaction.assets.map((asset) => `${asset.to?.ownerUid === team.ownerUid ? "+" : "−"}${asset.name}`).join(", ")}</span>)}</div> : null}
      </section>

      <section className="forecast-section owner-history-panel">
        <div className="archive-section-heading"><div><Eyebrow>Career context</Eyebrow><h2>{career?.seasons} seasons before this one.</h2></div><Link to={`/owners/${team.ownerUid}`}>Full owner archive <ArrowUpRight /></Link></div>
        <div className="owner-career-scorebug"><span><Users /><b>{career?.wins}-{career?.losses}{career?.ties ? `-${career.ties}` : ""}</b><small>career record</small></span><span><Trophy /><b>{career?.championships}</b><small>championships</small></span><span><Crown /><b>{career?.finals}</b><small>finals</small></span><span><History /><b>{career?.winPct == null ? "—" : `${(career.winPct * 100).toFixed(1)}%`}</b><small>win percentage</small></span></div>
        <div className="owner-season-ledger">{profile.data.teamHistory.map((season) => <Link to={`/seasons/${season.season}`} key={season.season} className={season.champion ? "is-champion" : ""}><span>{season.season}</span><strong>{season.teamName}</strong><b>{season.record.wins}-{season.record.losses}{season.record.ties ? `-${season.record.ties}` : ""}</b><small>{season.champion ? "Champion" : season.runnerUp ? "Runner-up" : season.playoffFinish ? `Finish #${season.playoffFinish}` : `Seed ${season.seed || "—"}`}</small></Link>)}</div>
      </section>

      <nav className="team-dossier-pager"><Link to={`/2026/teams/${ownerSlug(previousTeam.ownerName)}`}><ArrowLeft /><span><small>Previous dossier</small><strong>{previousTeam.ownerName}</strong></span></Link><Link to="/2026"><span><small>Back to</small><strong>2026 master forecast</strong></span></Link><Link to={`/2026/teams/${ownerSlug(nextTeam.ownerName)}`}><span><small>Next dossier</small><strong>{nextTeam.ownerName}</strong></span><ArrowRight /></Link></nav>
    </PageTransition>
  );
}
