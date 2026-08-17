import React, { useMemo } from "react";
import {
  ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Gauge,
  Sparkles, Swords, Target, Trophy,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow } from "../../components/v3/ArchiveUI";
import { TeamIdentity, TeamPageLink, type SeasonHubTeam } from "../../components/v3/Season2026UI";
import { useSeasonHub } from "../../data/v3/hooks";

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

export default function SeasonWeekPage(): React.ReactElement {
  const { week: weekParam } = useParams<{ week: string }>();
  const weekNumber = Number(weekParam);
  const hub = useSeasonHub();

  const weeklyPlayers = useMemo(() => {
    if (!hub.data || !Number.isInteger(weekNumber)) return [];
    return hub.data.teams.flatMap((team) => {
      const lineup = team.analysis.weeklyLineups.find((row) => row.week === weekNumber);
      return (lineup?.players || []).filter((player) => !player.replacement).map((player) => ({ ...player, fantasyTeam: team }));
    }).sort((a, b) => b.paer - a.paer || b.projectedPoints - a.projectedPoints);
  }, [hub.data, weekNumber]);

  if (hub.isLoading) return <ArchiveLoading label={`Building the Week ${weekParam || ""} matchup book`} />;
  if (hub.error || !hub.data) return <ArchiveError error={hub.error} />;
  const week = hub.data.schedule.find((row) => row.week === weekNumber);
  if (!week) return <Navigate to="/2026/weeks/1" replace />;

  const closest = [...week.matchups].sort((a, b) => a.projectedMargin - b.projectedMargin)[0];
  const marquee = [...week.matchups].sort((a, b) => (b.projectedA + b.projectedB) - (a.projectedA + a.projectedB))[0];
  const biggestFavorite = [...week.matchups].sort((a, b) => b.projectedMargin - a.projectedMargin)[0];
  const previousWeek = weekNumber > 1 ? weekNumber - 1 : 14;
  const nextWeek = weekNumber < 14 ? weekNumber + 1 : 1;

  return (
    <PageTransition>
      <nav className="forecast-breadcrumb"><Link to="/2026"><ArrowLeft /> 2026 projection</Link><span>/</span><strong>Week {weekNumber}</strong><Link to={`/2026/weeks/${nextWeek}`}>Next week <ArrowRight /></Link></nav>

      <section className="week-report-hero">
        <div><div className="live-line"><span /> Regular season · 4 matchups</div><Eyebrow>2026 weekly projection book</Eyebrow><h1>Week {String(weekNumber).padStart(2, "0")}</h1><p>The full Sleeper slate, thirteen legal lineup slots per team, every replacement-level positional edge and the upset condition in plain English.</p></div>
        <aside><span>Game of the week</span><TeamIdentity team={closest.teamA} /><em>vs</em><TeamIdentity team={closest.teamB} /><footer><b>{closest.projectedMargin.toFixed(1)}</b> points separate them</footer></aside>
      </section>

      <div className="week-page-selector" aria-label="2026 weekly reports"><Link to={`/2026/weeks/${previousWeek}`} aria-label="Previous week"><ChevronLeft /></Link>{hub.data.schedule.map((row) => <Link to={`/2026/weeks/${row.week}`} className={row.week === weekNumber ? "active" : ""} key={row.week}><small>W</small>{row.week}</Link>)}<Link to={`/2026/weeks/${nextWeek}`} aria-label="Next week"><ChevronRight /></Link></div>

      <section className="week-report-scorebugs"><div><Swords /><span>Closest game<strong>{closest.projectedMargin.toFixed(1)} pts</strong><small>{closest.teamA.teamName}–{closest.teamB.teamName}</small></span></div><div><Trophy /><span>Highest total<strong>{(marquee.projectedA + marquee.projectedB).toFixed(1)}</strong><small>{marquee.teamA.teamName}–{marquee.teamB.teamName}</small></span></div><div><Gauge /><span>Biggest favorite<strong>{biggestFavorite.projectedMargin.toFixed(1)} pts</strong><small>{biggestFavorite.projectedFavoriteRosterId === biggestFavorite.teamA.rosterId ? biggestFavorite.teamA.teamName : biggestFavorite.teamB.teamName}</small></span></div><div><CalendarDays /><span>Ranking model<strong>PAER</strong><small>weekly lineup value</small></span></div></section>

      <section className="forecast-section week-matchup-reports">
        <div className="archive-section-heading"><div><Eyebrow>Matchup-by-matchup</Eyebrow><h2>Four games, fully opened.</h2></div><p>Projected starters are optimized under Tatnall's legal lineup rules. Bench players appear on each team dossier, while this page focuses on the choices that drive the weekly result.</p></div>
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
          const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
          return <article className="week-matchup-report" id={`matchup-${matchup.matchupId}`} key={matchup.matchupId}>
            <header><span>Matchup {matchup.matchupId}</span><strong>{matchupLabel(matchup.projectedMargin)}</strong><b>{matchup.projectedMargin.toFixed(1)}-point line</b></header>
            <div className="week-matchup-scoreline">
              <TeamPageLink team={teamA} className={favorite.rosterId === teamA.rosterId ? "is-favorite" : ""}><TeamIdentity team={teamA} /><b>{matchup.projectedA.toFixed(1)}</b><small>Power #{teamA.analysis.projectionRank} · {teamA.analysis.grade}</small></TeamPageLink>
              <em>vs</em>
              <TeamPageLink team={teamB} className={favorite.rosterId === teamB.rosterId ? "is-favorite" : ""}><TeamIdentity team={teamB} /><b>{matchup.projectedB.toFixed(1)}</b><small>Power #{teamB.analysis.projectionRank} · {teamB.analysis.grade}</small></TeamPageLink>
            </div>
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

      <section className="forecast-methodology"><Sparkles /><div><Eyebrow>Weekly model note</Eyebrow><h2>Lineup-aware, still uncertain.</h2><p>A 15-point favorite is not assigned a 100% win chance. NFL roles, injuries and late news will move these numbers, and the live site refresh will update the underlying Sleeper projections.</p></div><div><Link to={`/2026/weeks/${previousWeek}`}><ArrowLeft /> Week {previousWeek}</Link><Link to={`/2026/weeks/${nextWeek}`}>Week {nextWeek} <ArrowRight /></Link></div></section>
    </PageTransition>
  );
}
