import React, { useMemo } from "react";
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Gauge,
  Radio, Sparkles, Swords, Target, Trophy,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow } from "../../components/v3/ArchiveUI";
import { TeamIdentity, TeamPageLink, type SeasonHubTeam } from "../../components/v3/Season2026UI";
import { useSeasonHub } from "../../data/v3/hooks";
import { useSleeperMatchups, type SleeperScoreFeed, type SleeperScoreStatus } from "../../hooks/useSleeperMatchups";

type WeeklyLineup = SeasonHubTeam["analysis"]["weeklyLineups"][number];
type WeeklyPlayer = WeeklyLineup["players"][number];

function positionTotals(lineup: WeeklyLineup): Map<string, number> {
  const totals = new Map<string, number>();
  lineup.players.forEach((player) => totals.set(player.position || "—", (totals.get(player.position || "—") || 0) + player.paer));
  return totals;
}

function LineupPlayerRow({ player }: { player: WeeklyPlayer }): React.ReactElement {
  const content = <><span>{player.slot}</span><b>{player.name}</b><small>{player.replacement ? `weekly ${player.position} baseline` : `${player.position} · ${player.nflTeam || "FA"} · +${player.paer.toFixed(1)} PAER`}</small><strong>{player.projectedPoints.toFixed(1)}</strong></>;
  return player.replacement
    ? <div className="lineup-player-row is-replacement">{content}</div>
    : <Link className="lineup-player-row" to={`/players/${player.playerUid || player.sleeperId}`}>{content}</Link>;
}

function matchupLabel(margin: number): string {
  if (margin < 3) return "True toss-up";
  if (margin < 8) return "One-break game";
  if (margin < 15) return "Clear favorite";
  return "Upset required";
}

function scoreStatusLabel(status: SleeperScoreStatus): string {
  if (status === "live") return "Sleeper live";
  if (status === "final") return "Final";
  return "Not started";
}

function modelDelta(actual: number, projected: number): string {
  const delta = actual - projected;
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} vs model`;
}

export default function SeasonWeekPage(): React.ReactElement {
  const { week: weekParam } = useParams<{ week: string }>();
  const weekNumber = Number(weekParam);
  const hub = useSeasonHub();

  const selectedWeek = useMemo(
    () => hub.data?.schedule.find((row) => row.week === weekNumber),
    [hub.data, weekNumber],
  );
  const staticScoreFeed = useMemo<SleeperScoreFeed>(() => {
    const scores: Record<number, number> = {};
    const statusByMatchup: Record<number, SleeperScoreStatus> = {};
    (selectedWeek?.matchups || []).forEach((matchup) => {
      statusByMatchup[matchup.matchupId] = matchup.sleeperStatus;
      if (matchup.sleeperScoreA != null) scores[matchup.teamA.rosterId] = matchup.sleeperScoreA;
      if (matchup.sleeperScoreB != null) scores[matchup.teamB.rosterId] = matchup.sleeperScoreB;
    });
    const statuses = Object.values(statusByMatchup);
    const status: SleeperScoreStatus = statuses.some((value) => value === "live")
      ? "live"
      : statuses.length > 0 && statuses.every((value) => value === "final")
        ? "final"
        : "scheduled";
    return {
      scores,
      statusByMatchup,
      status,
      source: "snapshot",
      lastVerifiedAt: hub.data?.actualSource.snapshotAt || null,
      usingFallback: false,
    };
  }, [hub.data?.actualSource.snapshotAt, selectedWeek]);
  const sleeperConfig = useMemo(() => (
    hub.data && selectedWeek
      ? {
        endpoint: hub.data.actualSource.endpointTemplate.replace("{week}", String(weekNumber)),
        week: weekNumber,
        currentWeek: hub.data.meta.currentWeek,
        seasonPhase: hub.data.meta.seasonPhase,
        staticFeed: staticScoreFeed,
        pollingSeconds: 60,
      }
      : undefined
  ), [hub.data, selectedWeek, staticScoreFeed, weekNumber]);
  const sleeper = useSleeperMatchups(sleeperConfig);

  const weeklyPlayers = useMemo(() => {
    if (!hub.data || !Number.isInteger(weekNumber)) return [];
    return hub.data.teams.flatMap((team) => {
      const lineup = team.analysis.weeklyLineups.find((row) => row.week === weekNumber);
      return (lineup?.players || []).filter((player) => !player.replacement).map((player) => ({ ...player, fantasyTeam: team }));
    }).sort((a, b) => b.paer - a.paer || b.projectedPoints - a.projectedPoints);
  }, [hub.data, weekNumber]);

  if (hub.isLoading) return <ArchiveLoading label={`Building the Week ${weekParam || ""} matchup book`} />;
  if (hub.error || !hub.data) return <ArchiveError error={hub.error} />;
  const week = selectedWeek;
  if (!week) return <Navigate to="/2026/weeks/1" replace />;

  const closest = [...week.matchups].sort((a, b) => a.projectedMargin - b.projectedMargin)[0];
  const marquee = [...week.matchups].sort((a, b) => (b.projectedA + b.projectedB) - (a.projectedA + a.projectedB))[0];
  const biggestFavorite = [...week.matchups].sort((a, b) => b.projectedMargin - a.projectedMargin)[0];
  const trackedScores = week.matchups.flatMap((matchup) => {
    const scoreA = sleeper.scores[matchup.teamA.rosterId] ?? matchup.sleeperScoreA;
    const scoreB = sleeper.scores[matchup.teamB.rosterId] ?? matchup.sleeperScoreB;
    return [
      scoreA == null ? null : { actual: scoreA, projected: matchup.projectedA },
      scoreB == null ? null : { actual: scoreB, projected: matchup.projectedB },
    ];
  }).filter((value): value is { actual: number; projected: number } => value != null);
  const meanAbsoluteError = trackedScores.length
    ? trackedScores.reduce((sum, value) => sum + Math.abs(value.actual - value.projected), 0) / trackedScores.length
    : null;
  const previousWeek = weekNumber > 1 ? weekNumber - 1 : 14;
  const nextWeek = weekNumber < 14 ? weekNumber + 1 : 1;

  return (
    <PageTransition>
      <nav className="forecast-breadcrumb"><Link to="/2026"><ArrowLeft /> 2026 projection</Link><span>/</span><strong>Week {weekNumber}</strong><Link to={`/2026/weeks/${nextWeek}`}>Next week <ArrowRight /></Link></nav>

      <section className="week-report-hero">
        <div><div className="live-line"><span /> {sleeper.usingFallback ? "Sleeper snapshot fallback" : `${scoreStatusLabel(sleeper.status)} · 4 matchups`}</div><Eyebrow>2026 weekly projection book</Eyebrow><h1>Week {String(weekNumber).padStart(2, "0")}</h1><p>The model's projected score sits beside the official Sleeper box score, with thirteen legal lineup slots, replacement-level positional edges and the projection miss preserved in plain English.</p></div>
        <aside><span>Game of the week</span><TeamIdentity team={closest.teamA} /><em>vs</em><TeamIdentity team={closest.teamB} /><footer><b>{closest.projectedMargin.toFixed(1)}</b> points separate them</footer></aside>
      </section>

      <div className="week-page-selector" aria-label="2026 weekly reports"><Link to={`/2026/weeks/${previousWeek}`} aria-label="Previous week"><ChevronLeft /></Link>{hub.data.schedule.map((row) => <Link to={`/2026/weeks/${row.week}`} className={row.week === weekNumber ? "active" : ""} key={row.week}><small>W</small>{row.week}</Link>)}<Link to={`/2026/weeks/${nextWeek}`} aria-label="Next week"><ChevronRight /></Link></div>

      <section className="week-report-scorebugs"><div><Swords /><span>Closest game<strong>{closest.projectedMargin.toFixed(1)} pts</strong><small>{closest.teamA.teamName}–{closest.teamB.teamName}</small></span></div><div><Trophy /><span>Highest total<strong>{(marquee.projectedA + marquee.projectedB).toFixed(1)}</strong><small>{marquee.teamA.teamName}–{marquee.teamB.teamName}</small></span></div><div><Gauge /><span>Biggest favorite<strong>{biggestFavorite.projectedMargin.toFixed(1)} pts</strong><small>{biggestFavorite.projectedFavoriteRosterId === biggestFavorite.teamA.rosterId ? biggestFavorite.teamA.teamName : biggestFavorite.teamB.teamName}</small></span></div><div><Radio /><span>Sleeper tracker<strong>{meanAbsoluteError == null ? scoreStatusLabel(sleeper.status) : `${meanAbsoluteError.toFixed(1)} pts`}</strong><small>{meanAbsoluteError == null ? "actuals appear at kickoff" : `${sleeper.status === "live" ? "live gap" : "mean miss"} · ${trackedScores.length} team scores`}</small></span></div></section>

      <section className="forecast-section week-matchup-reports">
        <div className="archive-section-heading"><div><Eyebrow>Matchup-by-matchup</Eyebrow><h2>Projection beside reality.</h2></div><p>Projected starters are optimized under Tatnall's legal lineup rules. Official Sleeper totals refresh directly during the current week, while the deployment snapshot preserves completed weeks and survives a provider outage.</p></div>
        {week.matchups.map((matchup) => {
          const teamA = hub.data.teams.find((team) => team.rosterId === matchup.teamA.rosterId)!;
          const teamB = hub.data.teams.find((team) => team.rosterId === matchup.teamB.rosterId)!;
          const lineupA = teamA.analysis.weeklyLineups.find((row) => row.week === weekNumber)!;
          const lineupB = teamB.analysis.weeklyLineups.find((row) => row.week === weekNumber)!;
          const totalsA = positionTotals(lineupA);
          const totalsB = positionTotals(lineupB);
          const favorite = matchup.projectedFavoriteRosterId === teamA.rosterId ? teamA : teamB;
          const underdog = favorite.rosterId === teamA.rosterId ? teamB : teamA;
          const underdogLineup = underdog.rosterId === teamA.rosterId ? lineupA : lineupB;
          const underdogStars = [...underdogLineup.players].filter((player) => !player.replacement).sort((a, b) => b.paer - a.paer).slice(0, 2);
          const sleeperStatus = sleeper.statusByMatchup[matchup.matchupId] || matchup.sleeperStatus;
          const sleeperA = sleeper.scores[teamA.rosterId] ?? matchup.sleeperScoreA;
          const sleeperB = sleeper.scores[teamB.rosterId] ?? matchup.sleeperScoreB;
          const hasSleeperScore = sleeperStatus !== "scheduled" && sleeperA != null && sleeperB != null;
          const sleeperWinner = hasSleeperScore && sleeperA !== sleeperB
            ? (sleeperA > sleeperB ? teamA.rosterId : teamB.rosterId)
            : null;
          const matchupError = hasSleeperScore
            ? (Math.abs(sleeperA - matchup.projectedA) + Math.abs(sleeperB - matchup.projectedB)) / 2
            : null;
          const winnerCall = sleeperStatus === "final"
            ? sleeperWinner == null
              ? "Final tie"
              : sleeperWinner === matchup.projectedFavoriteRosterId ? "Winner call hit" : "Upset vs model"
            : sleeperStatus === "live" ? "Tracking live" : "Awaiting kickoff";
          const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
          return <article className="week-matchup-report" id={`matchup-${matchup.matchupId}`} key={matchup.matchupId}>
            <header><span>Matchup {matchup.matchupId}</span><strong>{matchupLabel(matchup.projectedMargin)} · {scoreStatusLabel(sleeperStatus)}</strong><b>{matchup.projectedMargin.toFixed(1)}-point line</b></header>
            <div className="week-matchup-scoreline">
              <TeamPageLink team={teamA} className={favorite.rosterId === teamA.rosterId ? "is-favorite" : ""}><TeamIdentity team={teamA} /><span className="projection-actual-score"><span><small>Model</small><b>{matchup.projectedA.toFixed(1)}</b></span><span className={sleeperStatus === "live" ? "is-live" : ""}><small>{sleeperStatus === "live" ? "Sleeper live" : "Sleeper"}</small><b>{sleeperA == null ? "—" : sleeperA.toFixed(1)}</b></span></span><small>Power #{teamA.analysis.projectionRank} · {teamA.analysis.grade}{sleeperA == null ? "" : ` · ${modelDelta(sleeperA, matchup.projectedA)}`}</small></TeamPageLink>
              <em>vs</em>
              <TeamPageLink team={teamB} className={favorite.rosterId === teamB.rosterId ? "is-favorite" : ""}><TeamIdentity team={teamB} /><span className="projection-actual-score"><span><small>Model</small><b>{matchup.projectedB.toFixed(1)}</b></span><span className={sleeperStatus === "live" ? "is-live" : ""}><small>{sleeperStatus === "live" ? "Sleeper live" : "Sleeper"}</small><b>{sleeperB == null ? "—" : sleeperB.toFixed(1)}</b></span></span><small>Power #{teamB.analysis.projectionRank} · {teamB.analysis.grade}{sleeperB == null ? "" : ` · ${modelDelta(sleeperB, matchup.projectedB)}`}</small></TeamPageLink>
            </div>
            <div className={`matchup-model-audit is-${sleeperStatus}`}><Radio /><span><small>Projection audit</small><strong>{winnerCall}</strong></span>{hasSleeperScore ? <><span><small>Official score</small><strong>{sleeperA!.toFixed(1)}–{sleeperB!.toFixed(1)}</strong></span><span><small>{sleeperStatus === "live" ? "Current score gap" : "Mean absolute error"}</small><strong>{matchupError!.toFixed(1)} pts</strong></span></> : <span><small>Official score</small><strong>Opens at kickoff</strong></span>}</div>
            <div className="matchup-position-edges"><Eyebrow>Points above expected replacement</Eyebrow>{positions.map((position) => { const a = totalsA.get(position) || 0; const b = totalsB.get(position) || 0; return <div key={position}><b>{position}</b><span className={a > b ? "won" : ""}>{a.toFixed(1)}<small>{teamA.monogram}</small></span><i><em style={{ left: `${Math.min(a / Math.max(a + b, 1) * 100, 100)}%` }} /></i><span className={b > a ? "won" : ""}>{b.toFixed(1)}<small>{teamB.monogram}</small></span></div>; })}</div>
            <div className="matchup-lineup-comparison"><section><header><TeamIdentity team={teamA} compact /><strong>{lineupA.projectedPoints.toFixed(1)}</strong></header>{lineupA.players.map((player) => <LineupPlayerRow player={player} key={`${player.slot}-${player.sleeperId}`} />)}</section><section><header><TeamIdentity team={teamB} compact /><strong>{lineupB.projectedPoints.toFixed(1)}</strong></header>{lineupB.players.map((player) => <LineupPlayerRow player={player} key={`${player.slot}-${player.sleeperId}`} />)}</section></div>
            <footer className="upset-path"><Target /><div><Eyebrow>Underdog path</Eyebrow><p><strong>{underdog.teamName}</strong> needs {underdogStars.map((player) => player.name).join(" and ")} to beat their combined projection by roughly {Math.max(matchup.projectedMargin / 2, 1).toFixed(1)} points each, or it needs the {favorite.analysis.strength.position} room that drives {favorite.teamName} to land below expectation.</p></div><TeamPageLink team={underdog}>Scout {underdog.ownerName} <ArrowRight /></TeamPageLink></footer>
          </article>;
        })}
      </section>

      <section className="forecast-section weekly-player-board">
        <div className="archive-section-heading"><div><Eyebrow>Projected starter leaderboard</Eyebrow><h2>Week {weekNumber}'s top 40.</h2></div><p>This ranking includes rostered players selected into legal lineups and orders them by weekly advantage over expected replacement.</p></div>
        <div className="forecast-table-wrap"><div className="forecast-table forecast-table--weekly-players"><div className="forecast-table__head"><span>RK</span><span>Player</span><span>Slot</span><span>Team / owner</span><span>PAER</span></div>{weeklyPlayers.slice(0, 40).map((player, index) => <Link to={`/players/${player.playerUid || player.sleeperId}`} className="forecast-table__row" key={`${player.fantasyTeam.rosterId}-${player.sleeperId}`}><span className="forecast-seed">{index + 1}</span><span><b>{player.name}</b><small>{player.position} · {player.nflTeam || "FA"}</small></span><span><b>{player.slot}</b><small>projected starter</small></span><TeamIdentity team={player.fantasyTeam} compact /><span><b>+{player.paer.toFixed(1)}</b><small>{player.projectedPoints.toFixed(1)} raw pts</small></span></Link>)}</div></div>
      </section>

      <section className="forecast-methodology"><Sparkles /><div><Eyebrow>Weekly model note</Eyebrow><h2>Lineup-aware, now auditable.</h2><p>A 15-point favorite is not assigned a 100% win chance. The model column preserves the published lineup projection; the Sleeper column is the official submitted-lineup total. During the active week it polls Sleeper every minute and falls back to the most recent deployment snapshot if that connection fails.</p></div><div><Link to={`/2026/weeks/${previousWeek}`}><ArrowLeft /> Week {previousWeek}</Link><Link to={`/2026/weeks/${nextWeek}`}>Week {nextWeek} <ArrowRight /></Link></div></section>
    </PageTransition>
  );
}
