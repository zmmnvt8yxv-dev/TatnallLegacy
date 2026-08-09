import React, { useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowUpRight, CalendarDays, CircleDollarSign, Crown, Database,
  GitCompareArrows, ShieldCheck, Sparkles, Target, TrendingUp, UserRoundCheck,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow } from "../../components/v3/ArchiveUI";
import { useNow, usePlayerCareer, usePlayerSeason } from "../../data/v3/hooks";
import { useWarRoomPreferences } from "../../hooks/useWarRoomPreferences";
import type { NowData, PlayerSeason } from "../../schemas/v3";

function WeeklyChart({ season }: { season: PlayerSeason }): React.ReactElement {
  const width = 920;
  const height = 290;
  const pad = 34;
  const rows = season.weeks;
  const maximum = Math.max(...rows.flatMap((row) => [row.points || 0, row.positionalBaseline || 0]), 1);
  const x = (index: number) => rows.length <= 1 ? width / 2 : pad + (index * (width - pad * 2)) / (rows.length - 1);
  const y = (value: number | null) => height - pad - ((value || 0) / maximum) * (height - pad * 2);
  const pointsLine = rows.map((row, index) => `${x(index)},${y(row.points)}`).join(" ");
  const baselineLine = rows.map((row, index) => `${x(index)},${y(row.positionalBaseline)}`).join(" ");

  if (!rows.length) return <div className="chart-empty"><Activity /><strong>No verified weekly record</strong><span>This player has market context only for {season.season}.</span></div>;
  return (
    <div className="player-chart" role="img" aria-label={`Weekly fantasy points, positional baseline, WAR, and Tatnall starts for ${season.season}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((value) => <line key={value} x1={pad} x2={width - pad} y1={height * value} y2={height * value} className="grid-line" />)}
        {rows.map((row, index) => {
          const war = row.replacementWar || 0;
          const barHeight = Math.min(Math.abs(war) * 3, 62);
          return <rect key={row.week} x={x(index) - 7} y={war >= 0 ? height - pad - barHeight : height - pad} width="14" height={barHeight} className={war >= 0 ? "war-positive" : "war-negative"} />;
        })}
        {season.meta.modelVerified ? <polyline points={baselineLine} className="baseline-line" /> : null}
        <polyline points={pointsLine} className="points-line" />
        {rows.map((row, index) => row.tatnallStarts ? <circle key={row.week} cx={x(index)} cy={y(row.points)} r="5" className="start-dot"><title>Week {row.week}: Tatnall start</title></circle> : null)}
      </svg>
      <div className="chart-weeks">{rows.map((row) => <span key={row.week}>W{row.week}</span>)}</div>
      <div className="chart-legend"><span className="points">Fantasy points</span>{season.meta.modelVerified ? <><span className="baseline">Positional baseline</span><span className="war">Replacement WAR</span><span className="start">Tatnall start</span></> : null}</div>
    </div>
  );
}

function ownerFit(position: string, team?: NowData["teams"][number]): string {
  if (!team) return "Choose an owner in the War Room to calculate roster fit.";
  return `${position} depth is measured against the selected owner's current keepers and inherited roster.`;
}

export default function PlayerIntelligencePage(): React.ReactElement {
  const { playerId = "" } = useParams();
  const profile = usePlayerCareer(playerId);
  const now = useNow();
  const { preferences, selectOwner, toggleCompare } = useWarRoomPreferences();
  const seasons = profile.data?.career.career.map((row) => row.season) || [];
  const [selectedSeason, setSelectedSeason] = useState(2025);
  const season = usePlayerSeason(profile.data?.canonicalPlayerUid, selectedSeason);
  const selectedTeam = now.data?.teams.find((team) => team.ownerUid === preferences.selectedOwnerUid);
  const player = profile.data?.career;
  const positionCount = selectedTeam?.players.filter((row) => row.position === player?.player.position).length || 0;
  const fitLabel = selectedTeam ? (positionCount < 3 ? "Priority need" : positionCount < 5 ? "Useful depth" : "Luxury fit") : "Owner not selected";
  const filteredTimeline = useMemo(() => {
    const rows = player?.timeline || [];
    return rows.filter((row, index) => row.type !== "started" || index < 18).slice(0, 36);
  }, [player?.timeline]);

  if (profile.isLoading || now.isLoading) return <ArchiveLoading label="Opening the player intelligence file" />;
  if (profile.error || now.error || !profile.data || !now.data) return <ArchiveError error={profile.error || now.error} />;
  if (playerId !== profile.data.canonicalPlayerUid) return <Navigate to={`/players/${profile.data.canonicalPlayerUid}`} replace />;

  const data = profile.data.career;
  const score = data.current.draftScore == null ? "NR" : Math.round(data.current.draftScore * 100);
  const availableSeasons = [...new Set([2025, ...seasons])].sort((a, b) => b - a);

  return (
    <PageTransition>
      <Link to="/players" className="player-back"><ArrowLeft /> Player board</Link>
      <section className="player-broadcast-hero">
        <div className="player-identity-mark"><span>{data.player.position}</span><strong>{data.player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</strong><small>{data.player.nflTeam || "FA"}</small></div>
        <div className="player-broadcast-hero__copy">
          <div className="live-line"><span /> Tatnall Player Intelligence</div>
          <Eyebrow>{data.player.position} · {data.player.nflTeam || "Free agent"} · {data.player.nflStatus || "status pending"}</Eyebrow>
          <h1>{data.player.name}</h1>
          <div className="player-status-line">
            <span className={`confidence confidence--${data.current.confidence}`}>{data.current.confidence} confidence</span>
            {data.player.injuryStatus ? <span className="injury-chip">{data.player.injuryStatus}</span> : <span><ShieldCheck /> No injury designation</span>}
            <span>{data.player.depthChart.position ? `${data.player.depthChart.position}${data.player.depthChart.order ? ` · #${data.player.depthChart.order}` : ""}` : "Depth chart pending"}</span>
          </div>
        </div>
        <aside className="player-scorebug">
          <div><span>Tatnall score</span><strong>{score}</strong></div>
          <div><span>Model value</span><strong>${data.current.modelValue}</strong></div>
          <div><span>{data.current.keeper ? "Keeper cost" : "Availability"}</span><strong>{data.current.keeperCost != null ? `$${data.current.keeperCost}` : data.current.availability}</strong></div>
          <footer>{data.current.owner ? <><UserRoundCheck /> {data.current.owner.teamName}</> : <><Target /> Auction pool</>}</footer>
        </aside>
      </section>

      <section className="profile-intel-grid">
        <article className="draft-fit-card">
          <header><CircleDollarSign /><div><Eyebrow>Draft fit</Eyebrow><h2>What the room should know</h2></div></header>
          <div className="fit-metrics"><span><small>Model price</small><strong>${data.current.modelValue}</strong></span><span><small>Keeper surplus</small><strong>{data.current.keeperSurplus == null ? "—" : `${data.current.keeperSurplus >= 0 ? "+" : ""}$${data.current.keeperSurplus}`}</strong></span><span><small>Scarcity</small><strong>{data.current.scarcityTier}</strong></span><span><small>Position rank</small><strong>{data.player.position}{data.current.positionRank}</strong></span></div>
          <label>Your franchise<select aria-label="Your franchise" value={preferences.selectedOwnerUid} onChange={(event) => selectOwner(event.target.value)}><option value="">Choose owner</option>{now.data.teams.map((team) => <option key={team.rosterId} value={team.ownerUid || ""}>{team.ownerName} · {team.teamName}</option>)}</select></label>
          <div className="owner-fit"><strong>{fitLabel}</strong><span>{ownerFit(data.player.position, selectedTeam)}</span></div>
          <button type="button" onClick={() => toggleCompare(data.player.playerUid)}><GitCompareArrows /> Add to War Room comparison</button>
        </article>
        <article className="comparable-card"><header><Sparkles /><div><Eyebrow>Same-market options</Eyebrow><h2>Comparable players</h2></div></header>{data.comparables.map((comparable) => <Link key={comparable.playerUid} to={`/players/${comparable.playerUid}`}><span>{comparable.position} · {comparable.nflTeam || "FA"}</span><strong>{comparable.name}</strong><small>{comparable.confidence} confidence</small><b>${comparable.modelValue}</b><ArrowUpRight /></Link>)}</article>
      </section>

      <section className="profile-section weekly-profile">
        <header><div><Eyebrow>Weekly signal</Eyebrow><h2>Points, baseline, WAR, and Tatnall starts</h2></div><label>Season<select aria-label="Player season" value={selectedSeason} onChange={(event) => setSelectedSeason(Number(event.target.value))}>{availableSeasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></header>
        {season.isLoading ? <ArchiveLoading label={`Loading ${selectedSeason} weekly record`} /> : season.error || !season.data ? <ArchiveError error={season.error} /> : <><div className={`era-banner era-banner--${season.data.meta.scoringEra}`}><Database />{season.data.meta.modelVerified ? "Verified Tatnall scoring and value model" : "Provider-recorded points · no cross-era Tatnall WAR or valuation"}</div><WeeklyChart season={season.data} /></>}
      </section>

      <section className="profile-columns">
        <article className="profile-section"><header><div><Eyebrow>Scoring record</Eyebrow><h2>Career by season</h2></div><TrendingUp /></header><div className="career-table-wrap"><table className="career-table"><thead><tr><th>Season</th><th>GP</th><th>Points</th><th>PPG</th><th>Era</th></tr></thead><tbody>{data.career.map((row) => <tr key={row.season}><td><strong>{row.season}</strong></td><td>{row.games}</td><td>{row.providerPoints?.toFixed(1) || "—"}</td><td>{row.pointsPerGame?.toFixed(1) || "—"}</td><td><span className={row.modelVerified ? "verified" : "recorded"}>{row.modelVerified ? "Verified Tatnall" : "Provider recorded"}</span></td></tr>)}</tbody></table></div></article>
        <article className="profile-section"><header><div><Eyebrow>League ledger</Eyebrow><h2>Tatnall timeline</h2></div><CalendarDays /></header><div className="player-timeline">{filteredTimeline.length ? filteredTimeline.map((event) => <div key={event.eventUid}><span>{event.season}<small>{event.week ? `W${event.week}` : "Draft"}</small></span><i /><div><strong>{event.type.replaceAll("_", " ")}</strong><small>{event.team?.teamName || "League record"}{event.amount != null ? ` · $${event.amount}` : ""}</small></div></div>) : <p>No Tatnall ownership event has been recorded yet.</p>}</div></article>
      </section>

      <section className="profile-provenance"><Database /><div><Eyebrow>Identity and evidence</Eyebrow><h2>One canonical player, every provider ID.</h2><p>Historical ESPN-era points remain provider-recorded. The verified Tatnall value model begins in 2025 and never backfills unsupported scoring assumptions.</p></div><ul>{data.player.providerIds.map((id) => <li key={`${id.type}-${id.value}`}><span>{id.type}</span>{id.value}</li>)}</ul></section>
    </PageTransition>
  );
}
