import React, { useMemo } from "react";
import {
  ArrowUpRight, BarChart3, CalendarDays, ChevronRight, Crown, Database,
  Gauge, History, Medal, Scale, ShieldAlert, Swords, Trophy, Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow, formatFreshness } from "../../components/v3/ArchiveUI";
import { MatchupProjectionCard, TeamIdentity, TeamPageLink, projectedRecord } from "../../components/v3/Season2026UI";
import { useOwners, useSeasonHub } from "../../data/v3/hooks";
import { season2026Editorial } from "../../data/season2026Editorial";

function finishLabel(index: number): string {
  if (index === 0) return "Champion pick";
  if (index === 1) return "Finalist";
  if (index < 6) return `Playoff seed ${index + 1}`;
  return "Kilt Bowl";
}

function toneLabel(tone: string): string {
  return tone === "sharp" ? "Good-pickup lean" : tone === "volatile" ? "Boom / bust trader" : tone === "aggressive" ? "Trade alert" : "Patient market";
}

export default function NowPage(): React.ReactElement {
  const hub = useSeasonHub();
  const owners = useOwners();

  const projectedFinish = useMemo(() => [...(hub.data?.teams || [])].sort((left, right) => {
    const recordGap = right.analysis.projectedRecord.wins - left.analysis.projectedRecord.wins;
    if (recordGap) return recordGap;
    const valueGap = right.analysis.pointsAboveExpectedReplacement - left.analysis.pointsAboveExpectedReplacement;
    if (Math.abs(valueGap) > 0.01) return valueGap;
    return left.analysis.projectionRank - right.analysis.projectionRank;
  }), [hub.data]);

  const playerBoard = useMemo(() => {
    const rows = (hub.data?.teams || []).flatMap((team) => team.players.map((player) => ({ ...player, team })));
    const positionRanks = new Map<string, number>();
    for (const position of new Set(rows.map((player) => player.position || "—"))) {
      rows.filter((player) => (player.position || "—") === position)
        .sort((left, right) => right.pointsAboveExpectedReplacement - left.pointsAboveExpectedReplacement || right.regularSeasonProjection - left.regularSeasonProjection)
        .forEach((player, index) => positionRanks.set(player.sleeperId, index + 1));
    }
    return rows.sort((left, right) =>
      right.lineupPointsAboveExpectedReplacement - left.lineupPointsAboveExpectedReplacement
      || right.pointsAboveExpectedReplacement - left.pointsAboveExpectedReplacement
      || right.regularSeasonProjection - left.regularSeasonProjection
    ).map((player, index) => ({ ...player, overallRank: index + 1, positionRank: positionRanks.get(player.sleeperId) || 0 }));
  }, [hub.data]);

  if (hub.isLoading || owners.isLoading) return <ArchiveLoading label="Building the complete 2026 forecast" />;
  if (hub.error || owners.error || !hub.data || !owners.data || projectedFinish.length !== 8) return <ArchiveError error={hub.error || owners.error} />;

  const champion = projectedFinish[0];
  const runnerUp = projectedFinish[1];
  const playoffs = projectedFinish.slice(0, 6);
  const kiltBowl = projectedFinish.slice(6);
  const projectedKiltWinner = kiltBowl[0];
  const projectedLoser = kiltBowl[1];
  const ownerByUid = new Map(owners.data.owners.map((owner) => [owner.ownerUid, owner]));
  const closestWeek = (matchups: typeof hub.data.schedule[number]["matchups"]) => [...matchups].sort((a, b) => a.projectedMargin - b.projectedMargin)[0];

  return (
    <PageTransition>
      <section className="forecast-hero">
        <div className="forecast-hero__copy">
          <div className="live-line"><span /> 2026 preseason forecast · v2</div>
          <Eyebrow>Tatnall Legacy annual</Eyebrow>
          <h1>Every team.<br />Every week.<br /><em>Every bad idea.</em></h1>
          <p>A full-season scouting book built from finalized rosters, weekly value above expected replacement, eleven years of owner history and the complete 2025 transaction ledger.</p>
          <div className="forecast-hero__actions">
            <a className="archive-button archive-button--primary" href="#final-table">Final table <BarChart3 /></a>
            <Link className="archive-button" to="/2026/weeks/1">Week 1 <CalendarDays /></Link>
            <a className="archive-button" href="#owners">Owner dossiers <Users /></a>
          </div>
          <small><Database /> Sleeper projection snapshot · {formatFreshness(hub.data.projectionSource.updatedAt)}</small>
        </div>
        <aside className="forecast-cover-lines">
          <div className="forecast-cover-line is-title"><Crown /><span><small>Champion pick</small><strong>{champion.teamName}</strong><b>{champion.ownerName}</b></span><em>{projectedRecord(champion)}</em></div>
          <div className="forecast-cover-line"><Medal /><span><small>Finalist</small><strong>{runnerUp.teamName}</strong><b>{runnerUp.ownerName}</b></span><em>Seed {projectedFinish.indexOf(runnerUp) + 1}</em></div>
          <div className="forecast-cover-line is-danger"><ShieldAlert /><span><small>Projected Kilt Bowl loser</small><strong>{projectedLoser.teamName}</strong><b>{projectedLoser.ownerName}</b></span><em>2–1 series</em></div>
          <footer>Predictions are editorial judgments, not historical facts.</footer>
        </aside>
      </section>

      <nav className="season-jumpbar" aria-label="2026 forecast sections">
        <a href="#final-table">Final table</a><a href="#postseason">Postseason</a><a href="#owners">Teams & owners</a><a href="#players">Players</a><a href="#transactions">Transactions</a><a href="#weeks">Weeks 1–14</a>
      </nav>

      <section className="season-stat-strip" aria-label="2026 forecast facts">
        <div><span>Projected champion</span><strong>{champion.analysis.grade}</strong><small>{champion.ownerName} · {projectedRecord(champion)}</small></div>
        <div><span>Playoff field</span><strong>6</strong><small>{playoffs.map((team) => team.monogram).join(" · ")}</small></div>
        <div><span>Kilt Bowl format</span><strong>3</strong><small>games · loser earns last</small></div>
        <div><span>Lineup edge</span><strong>+{champion.analysis.pointsAboveExpectedReplacementPerWeek.toFixed(1)}</strong><small>PAER per week · {champion.monogram}</small></div>
      </section>

      <section className="forecast-section" id="final-table">
        <div className="archive-section-heading"><div><Eyebrow>Final regular-season projection</Eyebrow><h2>The predicted table.</h2></div><p>Seeds are ordered by projected head-to-head record, then lineup points above expected replacement. Power rank measures the weekly advantage a legal lineup creates over available alternatives.</p></div>
        <div className="forecast-table-wrap">
          <div className="forecast-table forecast-table--standings" role="table" aria-label="Predicted 2026 final standings">
            <div className="forecast-table__head" role="row"><span>Seed</span><span>Team / owner</span><span>Finish</span><span>Record</span><span>PAER/WK</span><span>Power</span><span>Best room</span><span>Weak room</span></div>
            {projectedFinish.map((team, index) => (
              <TeamPageLink team={team} className={`forecast-table__row${index >= 6 ? " is-kilt" : ""}`} key={team.rosterId}>
                <span className="forecast-seed">{index + 1}</span>
                <TeamIdentity team={team} />
                <span><b>{finishLabel(index)}</b><small>{index < 6 ? "Projected playoff team" : "Best-of-three series"}</small></span>
                <span><b>{projectedRecord(team)}</b><small>median outcome</small></span>
                <span><b>+{team.analysis.pointsAboveExpectedReplacementPerWeek.toFixed(1)}</b><small>{team.analysis.projectedWeeklyAverage.toFixed(1)} PPG</small></span>
                <span><b>#{team.analysis.projectionRank}</b><small>{team.analysis.grade}</small></span>
                <span><b>{team.analysis.strength.position} #{team.analysis.strength.rank}</b><small>{team.analysis.strength.label}</small></span>
                <span><b>{team.analysis.concern.position} #{team.analysis.concern.rank}</b><small>{team.analysis.concern.label}</small></span>
              </TeamPageLink>
            ))}
          </div>
        </div>
        <div className="projection-disclosure"><Gauge /><p><strong>How this table works.</strong> Weekly legal lineups use Sleeper's published half-PPR values, then measure only the advantage above an expected available replacement at each position. Editorial finish calls also account for owner history, roster construction, transaction behavior and playoff volatility.</p><time>{Math.round(hub.data.projectionSource.coveragePct * 100)}% roster coverage</time></div>
      </section>

      <section className="forecast-section" id="postseason">
        <div className="archive-section-heading"><div><Eyebrow>Weeks 15–17 forecast</Eyebrow><h2>Two trophies. One you do not want.</h2></div><p>Six teams enter the championship bracket. The two that miss face a three-game Kilt Bowl; the loser of that series is the official last-place projection.</p></div>
        <div className="postseason-grid">
          <article className="playoff-forecast">
            <header><Trophy /><div><Eyebrow>Championship bracket</Eyebrow><h3>{champion.teamName} over {runnerUp.teamName}</h3></div></header>
            <div className="playoff-seeds">{playoffs.map((team, index) => <TeamPageLink team={team} key={team.rosterId}><span>{index + 1}</span><TeamIdentity team={team} compact /><b>{projectedRecord(team)}</b></TeamPageLink>)}</div>
            <p><strong>The call:</strong> {champion.teamName} carries the league's largest weekly lineup advantage into the bracket. {runnerUp.teamName} has enough premium scoring to reach the final, but the projected +{champion.analysis.pointsAboveExpectedReplacementPerWeek.toFixed(1)} PAER weekly edge gives {champion.ownerName} the last word.</p>
          </article>
          <article className="kilt-forecast">
            <header><Swords /><div><Eyebrow>Kilt Bowl · best of three</Eyebrow><h3>{projectedKiltWinner.teamName} wins, 2–1.</h3></div></header>
            <div className="kilt-versus"><TeamIdentity team={projectedKiltWinner} /><em>vs</em><TeamIdentity team={projectedLoser} /></div>
            <div className="kilt-games"><span><b>Game 1</b>{projectedKiltWinner.teamName}</span><span><b>Game 2</b>{projectedLoser.teamName}</span><span><b>Game 3</b>{projectedKiltWinner.teamName}</span></div>
            <p><strong>Why {projectedLoser.ownerName} is the loser pick:</strong> {projectedKiltWinner.teamName} enters the series with the stronger replacement-adjusted weekly lineup and more usable positional separation. Over three games, that depth is the narrow tiebreaker—but this remains the forecast most likely to look foolish by October.</p>
          </article>
        </div>
      </section>

      <section className="forecast-section" id="owners">
        <div className="archive-section-heading"><div><Eyebrow>Eight full scouting reports</Eyebrow><h2>Teams, owners and tendencies.</h2></div><p>Each dossier combines the current roster with career results, 2025 transaction evidence, likely 2026 behavior and a ranked player-by-player outlook.</p></div>
        <div className="owner-dossier-grid">
          {hub.data.teams.map((team) => {
            const editorial = season2026Editorial[team.ownerName];
            const career = team.ownerUid ? ownerByUid.get(team.ownerUid) : undefined;
            return <TeamPageLink team={team} className="owner-dossier-card" key={team.rosterId}>
              <header style={{ "--team-accent": team.accent } as React.CSSProperties}><span>#{team.analysis.projectionRank}</span><TeamIdentity team={team} /><b>{team.analysis.grade}</b></header>
              <div><span className={`transaction-tone transaction-tone--${editorial.tone}`}>{toneLabel(editorial.tone)}</span><h3>{editorial.verdict}</h3><p>{editorial.thesis}</p></div>
              <dl><div><dt>Career</dt><dd>{career ? `${career.wins}-${career.losses}${career.ties ? `-${career.ties}` : ""}` : "—"}</dd></div><div><dt>Titles</dt><dd>{career?.championships ?? "—"}</dd></div><div><dt>2025 trades</dt><dd>{editorial.transactions2025.trades}</dd></div><div><dt>Projected</dt><dd>{projectedRecord(team)}</dd></div></dl>
              <footer>Open the full dossier <ArrowUpRight /></footer>
            </TeamPageLink>;
          })}
        </div>
      </section>

      <section className="forecast-section" id="players">
        <div className="archive-section-heading"><div><Eyebrow>Player-by-player projection board</Eyebrow><h2>The league's top 32.</h2></div><p>Ranks use the points above expected replacement that each player contributes to a legal weekly lineup. Every team dossier continues the list through all nineteen roster spots.</p></div>
        <div className="forecast-table-wrap">
          <div className="forecast-table forecast-table--players" role="table" aria-label="Top projected 2026 fantasy players">
            <div className="forecast-table__head" role="row"><span>RK</span><span>Player</span><span>Pos.</span><span>Team / owner</span><span>PAER</span><span>Draft $</span><span>Outlook</span></div>
            {playerBoard.slice(0, 32).map((player) => <Link to={`/players/${player.playerUid || player.sleeperId}`} className="forecast-table__row" key={`${player.team.rosterId}-${player.sleeperId}`}>
              <span className="forecast-seed">{player.overallRank}</span>
              <span><b>{player.name}</b><small>{player.nflTeam || "FA"}{player.injuryStatus ? ` · ${player.injuryStatus}` : ""}</small></span>
              <span><b>{player.position || "—"}{player.positionRank}</b><small>position rank</small></span>
              <TeamIdentity team={player.team} compact />
              <span><b>+{player.lineupPointsAboveExpectedReplacement.toFixed(1)}</b><small>{player.regularSeasonProjection.toFixed(1)} raw pts</small></span>
              <span><b>{player.draftPrice == null ? "—" : `$${player.draftPrice}`}</b><small>{player.keeper ? "keeper" : "auction"}</small></span>
              <span><b>{player.projectedStarts >= 13 ? "Weekly engine" : player.projectedStarts >= 9 ? "Core starter" : player.projectedStarts >= 4 ? "Rotation edge" : "Depth option"}</b><small>{player.projectedStarts}/14 modeled starts</small></span>
            </Link>)}
          </div>
        </div>
      </section>

      <section className="forecast-section" id="transactions">
        <div className="archive-section-heading"><div><Eyebrow>2025 evidence → 2026 prediction</Eyebrow><h2>Who makes the smart move—and the stupid one.</h2></div><p>Counts include completed 2025 transactions only. Earlier transaction seasons are partial or unavailable, so the commentary does not pretend eleven years of equal evidence exist.</p></div>
        <div className="transaction-forecast-grid">
          {hub.data.teams.map((team) => {
            const editorial = season2026Editorial[team.ownerName];
            return <article key={team.rosterId} style={{ "--team-accent": team.accent } as React.CSSProperties}>
              <header><TeamIdentity team={team} compact /><span className={`transaction-tone transaction-tone--${editorial.tone}`}>{toneLabel(editorial.tone)}</span></header>
              <div className="transaction-counts"><span><b>{editorial.transactions2025.completed}</b>moves</span><span><b>{editorial.transactions2025.waivers}</b>waivers</span><span><b>{editorial.transactions2025.freeAgents}</b>free adds</span><span><b>{editorial.transactions2025.trades}</b>trades</span></div>
              <p>{editorial.managerPattern}</p>
              <blockquote>{editorial.transactionPrediction}</blockquote>
              <TeamPageLink team={team}>Full trade autopsy <ChevronRight /></TeamPageLink>
            </article>;
          })}
        </div>
      </section>

      <section className="forecast-section" id="weeks">
        <div className="archive-section-heading"><div><Eyebrow>Fourteen dedicated matchup pages</Eyebrow><h2>The season, week by week.</h2></div><p>Every week page has all four matchups, projected starters, positional edges, upset paths and direct links back to both team dossiers.</p></div>
        <div className="week-index-grid">{hub.data.schedule.map((week) => {
          const close = closestWeek(week.matchups);
          const high = [...week.matchups].sort((a, b) => (b.projectedA + b.projectedB) - (a.projectedA + a.projectedB))[0];
          return <Link to={`/2026/weeks/${week.week}`} key={week.week}><header><span>Week</span><strong>{String(week.week).padStart(2, "0")}</strong><CalendarDays /></header><div><span>Closest line<b>{close.projectedMargin.toFixed(1)} pts</b></span><span>Marquee total<b>{(high.projectedA + high.projectedB).toFixed(1)}</b></span></div><footer>{close.teamA.teamName} vs {close.teamB.teamName}<ArrowUpRight /></footer></Link>;
        })}</div>
        <div className="week-one-marquee"><header><div><Eyebrow>Opening-week preview</Eyebrow><h2>Week 1, on the board.</h2></div><Link to="/2026/weeks/1" className="archive-button archive-button--primary">Full Week 1 report <ArrowUpRight /></Link></header><div className="season-matchup-grid">{hub.data.schedule[0].matchups.map((matchup) => <MatchupProjectionCard key={matchup.matchupId} matchup={matchup} week={1} />)}</div></div>
      </section>

      <section className="forecast-methodology">
        <Scale /><div><Eyebrow>Read the fine print</Eyebrow><h2>Projection is not prophecy.</h2><p>{hub.data.projectionSource.method} Player and team ranks will move when Sleeper updates its feed. Transaction commentary is editorial, and every specific 2025 move is drawn from the complete canonical transaction ledger.</p></div><div><Link to="/data-health">Audit the sources <Database /></Link><Link to="/history">Eleven completed seasons <History /></Link></div>
      </section>
    </PageTransition>
  );
}
