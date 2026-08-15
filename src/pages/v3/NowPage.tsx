import React, { useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, CalendarDays, CheckCircle2, CircleDollarSign, Database,
  Gauge, History, Radio, ShieldAlert, Sparkles, Trophy, Users, Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow, formatFreshness } from "../../components/v3/ArchiveUI";
import { useHistory, useNow, useSeasonHub } from "../../data/v3/hooks";
import { useWarRoomPreferences } from "../../hooks/useWarRoomPreferences";
import type { SeasonHubData } from "../../schemas/v3";

type HubTeam = SeasonHubData["teams"][number];
type HubMatchup = SeasonHubData["schedule"][number]["matchups"][number];

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

function teamRecord(team: HubTeam): string {
  const record = team.analysis.projectedRecord;
  return `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;
}

function MatchupCard({ matchup }: { matchup: HubMatchup }): React.ReactElement {
  const favoriteA = matchup.projectedFavoriteRosterId === matchup.teamA.rosterId;
  const favoriteB = matchup.projectedFavoriteRosterId === matchup.teamB.rosterId;
  return (
    <article className="season-matchup-card">
      <span className="season-matchup-card__id">M{matchup.matchupId}</span>
      <div className={favoriteA ? "is-favorite" : ""} style={{ "--team-accent": matchup.teamA.accent } as React.CSSProperties}>
        <i>{matchup.teamA.monogram}</i><span><strong>{matchup.teamA.teamName}</strong><small>{matchup.teamA.ownerName}</small></span><b>{matchup.projectedA.toFixed(1)}</b>
      </div>
      <div className={favoriteB ? "is-favorite" : ""} style={{ "--team-accent": matchup.teamB.accent } as React.CSSProperties}>
        <i>{matchup.teamB.monogram}</i><span><strong>{matchup.teamB.teamName}</strong><small>{matchup.teamB.ownerName}</small></span><b>{matchup.projectedB.toFixed(1)}</b>
      </div>
      <footer><span>Sleeper projection</span><strong>{matchup.projectedFavoriteRosterId ? `${matchup.projectedMargin.toFixed(1)} pt edge` : "Even"}</strong></footer>
    </article>
  );
}

export default function NowPage(): React.ReactElement {
  const now = useNow();
  const hub = useSeasonHub();
  const history = useHistory();
  const { preferences, selectOwner } = useWarRoomPreferences();
  const [selectedWeek, setSelectedWeek] = useState(1);

  const selectedTeam = useMemo(() => {
    if (!hub.data) return undefined;
    return hub.data.teams.find((team) => team.ownerUid === preferences.selectedOwnerUid) || hub.data.teams[0];
  }, [hub.data, preferences.selectedOwnerUid]);
  const week = hub.data?.schedule.find((row) => row.week === selectedWeek);

  if (now.isLoading || hub.isLoading || history.isLoading) return <ArchiveLoading label="Opening the 2026 season command center" />;
  if (now.error || hub.error || history.error || !now.data || !hub.data || !history.data || !selectedTeam) {
    return <ArchiveError error={now.error || hub.error || history.error} />;
  }

  const data = now.data;
  const season = hub.data;
  const leader = season.teams[0];
  const latestChampions = history.data.seasons.slice(0, 5);

  return (
    <PageTransition>
      <section className="season-hero">
        <div className="season-hero__grid" aria-hidden="true" />
        <div className="season-hero__copy">
          <div className="live-line"><span /> 2026 · Post-draft</div>
          <Eyebrow>Tatnall season command center</Eyebrow>
          <h1>Eight rosters.<br />One race.</h1>
          <p>The complete 2026 league in one place: finalized rosters, factual team outlooks, the full Sleeper schedule, Sleeper’s weekly projections, live transactions, and eleven seasons of history.</p>
          <div className="now-hero__actions">
            <a href="#teams" className="archive-button archive-button--primary">Scout every team <ArrowUpRight /></a>
            <a href="#schedule" className="archive-button">Open schedule <CalendarDays /></a>
            <Link to="/history" className="archive-button">League history <History /></Link>
          </div>
          <div className="freshness"><Database /> Sleeper snapshot · {formatFreshness(season.meta.sleeperSnapshotAt)}</div>
        </div>
        <aside className="season-leader-scorebug" style={{ "--team-accent": leader.accent } as React.CSSProperties}>
          <header><Radio /> Sleeper projection leader</header>
          <div className="season-leader-scorebug__rank"><span>01</span><b>{leader.analysis.grade}</b></div>
          <i>{leader.monogram}</i>
          <strong>{leader.teamName}</strong>
          <small>{leader.ownerName}</small>
          <footer><span>{leader.analysis.projectedWeeklyAverage.toFixed(1)} PPG</span><span>{teamRecord(leader)} projected</span></footer>
        </aside>
      </section>

      <nav className="season-jumpbar" aria-label="Season hub sections">
        <a href="#outlook">League outlook</a><a href="#teams">Team rooms</a><a href="#schedule">Schedule</a><a href="#activity">Activity</a><Link to="/history">History</Link>
      </nav>

      <section className="season-stat-strip" aria-label="Post-draft league facts">
        <div><span>Drafted</span><strong>{season.draft.pickCount}</strong><small>verified Sleeper picks</small></div>
        <div><span>Auction spend</span><strong>${season.draft.totalSpend.toLocaleString()}</strong><small>${season.draft.unspent} left league-wide</small></div>
        <div><span>Regular season</span><strong>{season.regularSeason.matchupCount}</strong><small>Sleeper matchups · Weeks 1–14</small></div>
        <div><span>Projection feed</span><strong>{Math.round(season.projectionSource.coveragePct * 100)}%</strong><small>published roster-weeks</small></div>
      </section>

      <section className="week-one-marquee" aria-labelledby="week-one-title">
        <header><div><Eyebrow>Opening slate · direct from Sleeper</Eyebrow><h2 id="week-one-title">Week 1 on the board.</h2></div><p>Projected scores use Sleeper’s unchanged half-PPR values and the best legal Tatnall lineup. They are a snapshot, not a promise.</p></header>
        <div className="season-matchup-grid">{season.schedule[0].matchups.map((matchup) => <MatchupCard key={matchup.matchupId} matchup={matchup} />)}</div>
      </section>

      <section className="season-outlook" id="outlook">
        <div className="archive-section-heading"><div><Eyebrow>Sleeper projection board</Eyebrow><h2>Where every roster starts.</h2></div><p>Ranked only from Sleeper’s currently published weekly numbers. Team analysis updates automatically with the four-hour site refresh.</p></div>
        <div className="season-power-table" role="table" aria-label="2026 projected team rankings">
          <div className="season-power-table__head" role="row"><span>Rank</span><span>Team</span><span>Grade</span><span>PPG</span><span>Projected</span><span>Schedule</span><span>Best room</span></div>
          {season.teams.map((team) => (
            <button type="button" role="row" key={team.rosterId} onClick={() => { selectOwner(team.ownerUid || ""); document.getElementById("teams")?.scrollIntoView({ behavior: "smooth" }); }} style={{ "--team-accent": team.accent } as React.CSSProperties}>
              <span className="projection-rank">{String(team.analysis.projectionRank).padStart(2, "0")}</span>
              <span className="projection-team"><i>{team.monogram}</i><span><strong>{team.teamName}</strong><small>{team.ownerName}</small></span></span>
              <b className="projection-grade">{team.analysis.grade}</b>
              <span><strong>{team.analysis.projectedWeeklyAverage.toFixed(1)}</strong><small>Sleeper</small></span>
              <span><strong>{teamRecord(team)}</strong><small>W-L</small></span>
              <span><strong>#{team.analysis.scheduleStrengthRank}</strong><small>hardest</small></span>
              <span><strong>{team.analysis.strength.position}</strong><small>#{team.analysis.strength.rank} room</small></span>
            </button>
          ))}
        </div>
        <div className="projection-disclosure"><CheckCircle2 /><p><strong>{season.projectionSource.label}</strong> · {season.projectionSource.provider} · {season.projectionSource.scoringField.replaceAll("_", " ")}. {season.projectionSource.method} {season.projectionSource.coverageNote}</p><time>{formatFreshness(season.projectionSource.updatedAt)}</time></div>
      </section>

      <section className="team-rooms" id="teams">
        <div className="archive-section-heading"><div><Eyebrow>All eight franchises</Eyebrow><h2>Team rooms.</h2></div><p>Choose a franchise for its full post-draft diagnosis, projected lineup, auction accounting, and complete roster.</p></div>
        <div className="team-room-tabs" role="tablist" aria-label="Choose a team">
          {season.teams.map((team) => <button type="button" role="tab" aria-selected={team.rosterId === selectedTeam.rosterId} key={team.rosterId} onClick={() => selectOwner(team.ownerUid || "")} style={{ "--team-accent": team.accent } as React.CSSProperties}><i>{team.monogram}</i><span><strong>{team.teamName}</strong><small>#{team.analysis.projectionRank} · {team.analysis.grade}</small></span></button>)}
        </div>

        <article className="team-room" style={{ "--team-accent": selectedTeam.accent } as React.CSSProperties}>
          <header className="team-room__hero">
            <div className="team-room__monogram">{selectedTeam.monogram}</div>
            <div><Eyebrow>{selectedTeam.analysis.tier}</Eyebrow><h2>{selectedTeam.teamName}</h2><p>{selectedTeam.ownerName} · {selectedTeam.motto}</p></div>
            <div className="team-room__grade"><span>Projection grade</span><strong>{selectedTeam.analysis.grade}</strong><small>#{selectedTeam.analysis.projectionRank} of 8</small></div>
          </header>
          <div className="team-room__scorebugs">
            <div><Gauge /><span>Projected PPG<strong>{selectedTeam.analysis.projectedWeeklyAverage.toFixed(1)}</strong></span></div>
            <div><Zap /><span>Projected record<strong>{teamRecord(selectedTeam)}</strong></span></div>
            <div><CalendarDays /><span>Schedule difficulty<strong>#{selectedTeam.analysis.scheduleStrengthRank}</strong></span></div>
            <div><CircleDollarSign /><span>Draft spend<strong>${selectedTeam.draftRecap.spend}</strong></span></div>
            <div><ShieldAlert /><span>Injury flags<strong>{selectedTeam.analysis.injuryFlags}</strong></span></div>
          </div>
          <div className="team-room__analysis">
            <div className="team-room__story"><Eyebrow>Post-draft read</Eyebrow><h3>{selectedTeam.analysis.headline}</h3><p>{selectedTeam.analysis.overview}</p><div><span><b>Strength</b>#{selectedTeam.analysis.strength.rank} {selectedTeam.analysis.strength.label}</span><span><b>Pressure point</b>#{selectedTeam.analysis.concern.rank} {selectedTeam.analysis.concern.label}</span></div></div>
            <div className="position-report"><Eyebrow>Position report</Eyebrow>{[...selectedTeam.analysis.positionGroups].sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position)).map((group) => <div key={group.position}><span><b>{group.position}</b><small>#{group.rank} · {group.projectedWeeklyPoints.toFixed(1)} PPG</small></span><i><em style={{ width: `${((9 - group.rank) / 8) * 100}%` }} /></i></div>)}</div>
          </div>
          <div className="team-room__columns">
            <section className="projected-lineup"><header><div><Eyebrow>Best projected lineup</Eyebrow><h3>Week 1</h3></div><span>Sleeper</span></header>{selectedTeam.analysis.weekOneLineup.map((player) => <Link to={`/players/${player.playerUid || player.sleeperId}`} key={`${player.slot}-${player.sleeperId}`}><span>{player.slot}</span><i>{player.position}</i><strong>{player.name}</strong><small>{player.nflTeam || "FA"}</small><b>{player.projectedPoints.toFixed(1)}</b></Link>)}{selectedTeam.analysis.openLineupSlots.map((slot) => <div className="lineup-open" key={slot}><span>{slot}</span><i>OPEN</i><strong>Roster spot unfilled</strong><small>Sleeper roster</small><b>—</b></div>)}</section>
            <section className="draft-recap-card"><header><Eyebrow>Draft receipt</Eyebrow><h3>${selectedTeam.draftRecap.spend} spent</h3></header><div><span>Keeper spend<strong>${selectedTeam.draftRecap.keeperSpend}</strong></span><span>Auction spend<strong>${selectedTeam.draftRecap.auctionSpend}</strong></span><span>Budget left<strong>${selectedTeam.draftRecap.unspent}</strong></span><span>Selections<strong>{selectedTeam.draftRecap.picks}</strong></span></div>{selectedTeam.draftRecap.largestPurchase ? <Link to={`/players/${selectedTeam.draftRecap.largestPurchase.playerUid || selectedTeam.draftRecap.largestPurchase.sleeperId}`}><small>Biggest auction buy</small><strong>{selectedTeam.draftRecap.largestPurchase.name}</strong><b>${selectedTeam.draftRecap.largestPurchase.amount}</b></Link> : null}<div className="top-engines"><small>Projection engines</small>{selectedTeam.analysis.topProjectedPlayers.map((player, index) => <Link to={`/players/${player.playerUid || player.sleeperId}`} key={player.sleeperId}><span>0{index + 1}</span><strong>{player.name}</strong><b>{player.projectedPoints.toFixed(1)}</b></Link>)}</div></section>
          </div>
          <details className="full-roster" open>
            <summary><span><Users /> Complete roster</span><small>{selectedTeam.players.length} current players · direct from Sleeper</small></summary>
            <div className="full-roster__table"><div className="full-roster__head"><span>Role</span><span>Player</span><span>NFL</span><span>W1 proj.</span><span>Season proj.</span><span>Price</span></div>{selectedTeam.players.map((player) => <Link to={`/players/${player.playerUid || player.sleeperId}`} key={player.sleeperId} className={player.projectedWeekOneStarter ? "is-projected-starter" : ""}><span>{player.projectedWeekOneStarter ? "START" : "BN"}</span><span><b>{player.name}</b><small>{player.keeper ? "Keeper" : player.injuryStatus || "Active"}</small></span><span>{player.position} · {player.nflTeam || "FA"}</span><strong>{player.weekOneProjection.toFixed(1)}</strong><strong>{player.regularSeasonProjection.toFixed(1)}</strong><b>{player.draftPrice == null ? "—" : `$${player.draftPrice}`}</b></Link>)}</div>
          </details>
        </article>
      </section>

      <section className="full-schedule" id="schedule">
        <div className="archive-section-heading"><div><Eyebrow>Weeks 1–14 · direct from Sleeper</Eyebrow><h2>The full league schedule.</h2></div><p>Matchup pairings are copied from Sleeper. The scores beside them are the current Sleeper projection snapshot.</p></div>
        <div className="week-selector" role="tablist" aria-label="Select schedule week">{season.schedule.map((row) => <button type="button" role="tab" aria-selected={selectedWeek === row.week} key={row.week} onClick={() => setSelectedWeek(row.week)}><small>Week</small>{row.week}</button>)}</div>
        <div className="season-matchup-grid">{(week?.matchups || []).map((matchup) => <MatchupCard key={matchup.matchupId} matchup={matchup} />)}</div>
        <div className="schedule-source"><Database /><span><strong>{season.regularSeason.scheduleSource}</strong><small>{season.regularSeason.matchupCount} verified regular-season matchups. Playoff pairings are excluded until Sleeper seeds the bracket.</small></span></div>
      </section>

      <section className="season-activity" id="activity">
        <div className="archive-section-heading"><div><Eyebrow>League wire</Eyebrow><h2>Moves after the hammer.</h2></div><Link to="/transactions">Full transaction ledger <ArrowUpRight /></Link></div>
        {data.recentTransactions.length ? <div className="transaction-ledger live-transaction-ledger">{data.recentTransactions.slice(0, 8).map((transaction) => <article key={transaction.transactionId}><div className="transaction-ledger__meta"><span>Week {transaction.week}</span><strong>{transaction.type.replaceAll("_", " ")}</strong><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(transaction.createdAt))}</time>{transaction.waiverBid != null ? <b>${transaction.waiverBid} FAAB</b> : null}</div><div className="transaction-assets">{transaction.assets.map((asset) => <div key={`${transaction.transactionId}-${asset.sleeperId}`}><Link to={`/players/${asset.playerUid || asset.sleeperId}`}><span>{asset.position || "—"}</span><strong>{asset.name}</strong></Link><small>{asset.from ? `${asset.from.teamName} → ` : "Added by "}{asset.to?.teamName || "Free agency"}</small></div>)}</div></article>)}</div> : <div className="season-empty"><Activity /><strong>No completed post-draft transactions yet.</strong><span>Sleeper’s activity feed is connected and will appear here automatically.</span></div>}
      </section>

      <section className="season-history-bridge">
        <div><Eyebrow>The record remains</Eyebrow><h2>2026 lives on top of eleven completed seasons.</h2><p>The main site now runs the active season, while every championship, owner career, record, player history, ruling, and source audit remains one click away.</p><Link to="/history" className="archive-button archive-button--primary">Enter league history <Trophy /></Link></div>
        <div className="champion-lineage">{latestChampions.map((completedSeason) => <Link to={`/seasons/${completedSeason.season}`} key={completedSeason.season}><span className="lineage-year">{completedSeason.season}</span><span className="lineage-mark"><Trophy /></span><span><strong>{completedSeason.champion.ownerName}</strong><small>{completedSeason.champion.teamName} · Seed {completedSeason.champion.seed}</small></span><ArrowUpRight /></Link>)}</div>
      </section>

      <section className="archive-callout"><Sparkles /><div><Eyebrow>One source of truth</Eyebrow><h2>Current season up front. League history always available.</h2><p>Schedules, rosters, draft results, and projection inputs come from Sleeper; Tatnall analysis is deterministic, disclosed, and refreshed every four hours.</p></div><Link to="/data-health">Inspect data health <ArrowUpRight /></Link></section>
    </PageTransition>
  );
}
