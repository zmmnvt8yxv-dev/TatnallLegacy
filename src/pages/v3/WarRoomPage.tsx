import React, { useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Ban, Bookmark, Check, CircleDollarSign, Columns3, Crown, Gavel,
  Radio, Search, ShieldAlert, Sparkles, Target, Users, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow } from "../../components/v3/ArchiveUI";
import { useWarRoom } from "../../data/v3/hooks";
import { useSleeperDraft, type SleeperDraftPick } from "../../hooks/useSleeperDraft";
import { useWarRoomPreferences, type PlayerIntent } from "../../hooks/useWarRoomPreferences";
import type { DraftPlayer, WarRoomData } from "../../schemas/v3";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"];
const CONFIDENCE = ["ALL", "high", "medium", "low"];

function pickAmount(pick: SleeperDraftPick): number {
  return Number(pick.metadata?.amount || 0);
}

function ownerNeed(player: DraftPlayer, team?: WarRoomData["teams"][number]): number {
  if (!team) return 0;
  const targets: Record<string, number> = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DEF: 1 };
  return Math.max((targets[player.position] || 1) - (team.positionCounts[player.position] || 0), 0);
}

function IntentButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className={active ? "active" : ""} onClick={onClick} aria-pressed={active}>{icon}<span>{label}</span></button>;
}

export default function WarRoomPage(): React.ReactElement {
  const room = useWarRoom();
  const { preferences, selectOwner, setIntent, setNote, toggleCompare, clearCompare } = useWarRoomPreferences();
  const live = useSleeperDraft(room.data?.draft);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [confidence, setConfidence] = useState("ALL");
  const [availability, setAvailability] = useState("available");
  const [sort, setSort] = useState("rank");

  const pickedSleeperIds = useMemo(() => new Set(live.picks.map((pick) => String(pick.player_id || ""))), [live.picks]);
  const selectedTeam = room.data?.teams.find((team) => team.ownerUid === preferences.selectedOwnerUid);
  const playerBySleeper = useMemo(() => new Map((room.data?.players || []).map((player) => [player.sleeperId, player])), [room.data]);
  const playerByUid = useMemo(() => new Map((room.data?.players || []).map((player) => [player.playerUid, player])), [room.data]);

  const players = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (room.data?.players || []).filter((player) => {
      const effectiveAvailability = pickedSleeperIds.has(player.sleeperId) ? "drafted" : player.availability;
      if (position !== "ALL" && player.position !== position) return false;
      if (confidence !== "ALL" && player.confidence !== confidence) return false;
      if (availability !== "all" && effectiveAvailability !== availability) return false;
      if (needle && !`${player.name} ${player.nflTeam || ""} ${player.position}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === "value") return b.recommendedValue - a.recommendedValue || a.rank - b.rank;
      if (sort === "fit") return ownerNeed(b, selectedTeam) - ownerNeed(a, selectedTeam) || a.rank - b.rank;
      if (sort === "confidence") return b.reliability - a.reliability || a.rank - b.rank;
      return a.rank - b.rank;
    });
  }, [availability, confidence, pickedSleeperIds, position, query, room.data, selectedTeam, sort]);

  const compared = preferences.compare.map((uid) => playerByUid.get(uid)).filter(Boolean) as DraftPlayer[];
  const teamLive = useMemo(() => (room.data?.teams || []).map((team) => {
    const teamPicks = live.picks.filter((pick) => Number(pick.roster_id) === team.rosterId);
    const auctionSpend = teamPicks.reduce((sum, pick) => sum + pickAmount(pick), 0);
    const openSlots = Math.max(team.openSlots - teamPicks.length, 0);
    const remainingBudget = team.remainingBudget - auctionSpend;
    const positionCounts = { ...team.positionCounts };
    for (const pick of teamPicks) {
      const position = playerBySleeper.get(String(pick.player_id))?.position || pick.metadata?.position;
      if (position) positionCounts[position] = (positionCounts[position] || 0) + 1;
    }
    return { ...team, positionCounts, auctionSpend, openSlots, remainingBudget, maximumBid: Math.max(remainingBudget - Math.max(openSlots - 1, 0), 0) };
  }), [live.picks, playerBySleeper, room.data]);

  if (room.isLoading) return <ArchiveLoading label="Calibrating the Tatnall Draft Score" />;
  if (room.error || !room.data) return <ArchiveError error={room.error} />;

  const latestPicks = [...live.picks].reverse().slice(0, 12);
  const draftComplete = live.status === "complete";
  const lastPositions = latestPicks.slice(0, 8).map((pick) => playerBySleeper.get(String(pick.player_id))?.position || pick.metadata?.position).filter(Boolean);
  const positionRun = lastPositions.length ? Object.entries(lastPositions.reduce<Record<string, number>>((totals, value) => ({ ...totals, [String(value)]: (totals[String(value)] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0] : null;

  return (
    <PageTransition>
      <section className="war-hero">
        <div>
          <div className="live-line"><span /> {draftComplete ? "2026 Draft Archive" : "2026 Auction Command"}</div>
          <Eyebrow>Tatnall player intelligence</Eyebrow>
          <h1>{draftComplete ? <>Auction complete.<br />The board is frozen.</> : <>Draft the room.<br />Not the rankings.</>}</h1>
          <p>{draftComplete ? "The final Sleeper board is now the canonical 2026 draft recap, with every purchase and franchise ledger preserved." : "Verified league performance, actual keeper economics, and roster fit—reconciled to every one of the league's 1,600 dollars."}</p>
          <div className="war-hero__actions">
            <label><Users /><span>Your franchise</span><select aria-label="Your franchise" value={preferences.selectedOwnerUid} onChange={(event) => selectOwner(event.target.value)}><option value="">Choose owner</option>{room.data.teams.map((team) => <option key={team.rosterId} value={team.ownerUid || ""}>{team.ownerName} · {team.teamName}</option>)}</select></label>
            <a href={`https://sleeper.com/draft/nfl/${room.data.draft.draftId}`} target="_blank" rel="noreferrer">Sleeper room <ArrowUpRight /></a>
          </div>
        </div>
        <aside className="war-scorebug">
          <header><Radio /> Draft feed <strong>{live.status.replaceAll("_", " ")}</strong></header>
          <div><span>Auction pool</span><strong>${room.data.budget.auctionPool.toLocaleString()}</strong></div>
          <div><span>Open spots</span><strong>{room.data.budget.openSpots}</strong></div>
          <div><span>Picks in</span><strong>{live.picks.length}</strong></div>
          <footer className={live.usingFallback ? "is-stale" : ""}>{live.usingFallback ? <><ShieldAlert /> Static snapshot retained · retrying</> : <><Activity /> {live.lastVerifiedAt ? "Sleeper verified" : "Connecting to Sleeper"}</>}</footer>
        </aside>
      </section>

      <section className="budget-ribbon" aria-label="League auction reconciliation">
        <div><span>Total league budget</span><strong>$1,600</strong></div><i>−</i>
        <div><span>Keeper spend</span><strong>$301</strong></div><i>=</i>
        <div className="active"><span>Live auction money</span><strong>$1,299</strong></div><i>·</i>
        <div><span>Discretionary</span><strong>$1,163</strong></div>
        <small><Check /> recommendations reconcile exactly</small>
      </section>

      <section className="franchise-scorebugs">
        {teamLive.map((team) => <article key={team.rosterId} style={{ "--team-accent": team.accent } as React.CSSProperties} className={team.ownerUid === preferences.selectedOwnerUid ? "selected" : ""}>
          <header><span>{team.monogram}</span><div><strong>{team.teamName}</strong><small>{team.ownerName}</small></div></header>
          <div><span>Left<strong>${team.remainingBudget}</strong></span><span>Slots<strong>{team.openSlots}</strong></span><span>Max<strong>${team.maximumBid}</strong></span></div>
          <footer>{team.keepers.map((keeper) => <Link key={keeper.playerUid} to={`/players/${keeper.playerUid}`}>{keeper.name} <b>${keeper.cost}</b></Link>)}<span className="team-balance">QB {team.positionCounts.QB || 0} · RB {team.positionCounts.RB || 0} · WR {team.positionCounts.WR || 0} · TE {team.positionCounts.TE || 0}</span></footer>
        </article>)}
      </section>

      <section className="war-grid">
        <div className="war-board">
          <header className="war-board__head"><div><Eyebrow>Best available</Eyebrow><h2>The board</h2></div><p><strong>{players.length}</strong> players in view · model values are league allocations, not projections.</p></header>
          <div className="war-filters">
            <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the board" /></label>
            <select value={position} onChange={(event) => setPosition(event.target.value)} aria-label="Position">{POSITIONS.map((item) => <option key={item} value={item}>{item === "ALL" ? "All positions" : item}</option>)}</select>
            <select value={availability} onChange={(event) => setAvailability(event.target.value)} aria-label="Availability"><option value="available">Available</option><option value="all">All players</option><option value="rostered">Rostered</option><option value="kept">Keepers</option><option value="drafted">Drafted</option></select>
            <select value={confidence} onChange={(event) => setConfidence(event.target.value)} aria-label="Confidence">{CONFIDENCE.map((item) => <option key={item} value={item}>{item === "ALL" ? "All confidence" : `${item} confidence`}</option>)}</select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort"><option value="rank">Overall rank</option><option value="value">Auction value</option><option value="fit">My roster fit</option><option value="confidence">Confidence</option></select>
          </div>
          <div className="war-table-wrap">
            <table className="war-table"><thead><tr><th>RK</th><th>Player</th><th>Score</th><th>Value</th><th>Confidence</th><th>My board</th></tr></thead><tbody>
              {players.slice(0, 220).map((player) => {
                const intent = preferences.intents[player.playerUid];
                const drafted = pickedSleeperIds.has(player.sleeperId);
                return <tr key={player.playerUid} className={drafted ? "is-drafted" : ""}>
                  <td><strong>{player.rank}</strong><small>{player.position}{player.positionRank}</small></td>
                  <td><Link to={`/players/${player.playerUid}`}><strong>{player.name}</strong><small>{player.nflTeam || "FA"} · {player.scarcityTier}{player.injuryStatus ? ` · ${player.injuryStatus}` : ""}</small></Link>{ownerNeed(player, selectedTeam) > 0 ? <span className="fit-chip">fills need</span> : null}</td>
                  <td><strong>{player.draftScore == null ? "—" : Math.round(player.draftScore * 100)}</strong><small>{player.games} verified games</small></td>
                  <td><b className="model-price">${player.recommendedValue}</b>{player.keeperCost != null ? <small>kept ${player.keeperCost}</small> : null}</td>
                  <td><span className={`confidence confidence--${player.confidence}`}>{player.confidence}</span></td>
                  <td><div className="intent-actions"><IntentButton active={intent === "watch"} label="Watch" icon={<Bookmark />} onClick={() => setIntent(player.playerUid, "watch")} /><IntentButton active={intent === "target"} label="Target" icon={<Target />} onClick={() => setIntent(player.playerUid, "target")} /><IntentButton active={intent === "fade"} label="Fade" icon={<Ban />} onClick={() => setIntent(player.playerUid, "fade")} /><IntentButton active={preferences.compare.includes(player.playerUid)} label="Compare" icon={<Columns3 />} onClick={() => toggleCompare(player.playerUid)} /></div></td>
                </tr>;
              })}
            </tbody></table>
          </div>
        </div>

        <aside className="auction-rail">
          <section><header><Gavel /><div><Eyebrow>{draftComplete ? "Canonical draft recap" : "Live nomination feed"}</Eyebrow><h2>{live.picks.length ? `${live.picks.length} purchases` : "Waiting for first sale"}</h2></div></header>{positionRun ? <div className="position-run"><Sparkles /><span><strong>{positionRun[0]} run</strong>{positionRun[1]} of the last {lastPositions.length} picks</span></div> : null}<div className="pick-feed">{latestPicks.map((pick) => { const player = playerBySleeper.get(String(pick.player_id)); const team = teamLive.find((row) => row.rosterId === Number(pick.roster_id)); return <article key={pick.pick_no}><span>{pick.pick_no}</span><div><strong>{player?.name || `${pick.metadata?.first_name || ""} ${pick.metadata?.last_name || ""}`.trim() || "Player"}</strong><small>{player?.position || pick.metadata?.position || "—"} · {team?.teamName || `Roster ${pick.roster_id}`}</small></div><b>${pickAmount(pick)}</b></article>; })}{!latestPicks.length ? <p>The board will retain this verified snapshot if Sleeper becomes unavailable.</p> : null}</div></section>
          <section className="best-available"><Eyebrow>Next three</Eyebrow>{players.filter((player) => !pickedSleeperIds.has(player.sleeperId)).slice(0, 3).map((player, index) => <Link key={player.playerUid} to={`/players/${player.playerUid}`}><span>0{index + 1}</span><div><strong>{player.name}</strong><small>{player.position} · {player.confidence} confidence</small></div><b>${player.recommendedValue}</b></Link>)}</section>
        </aside>
      </section>

      {compared.length ? <section className="compare-dock" aria-label="Player comparison"><header><div><Eyebrow>League-fit comparison</Eyebrow><h2>{compared.length} of 4 players</h2></div><button type="button" onClick={clearCompare}><X /> Clear</button></header><div className="compare-grid">{compared.map((player) => <article key={player.playerUid}><button type="button" onClick={() => toggleCompare(player.playerUid)} aria-label={`Remove ${player.name}`}><X /></button><span>{player.position} · {player.nflTeam || "FA"}</span><Link to={`/players/${player.playerUid}`}>{player.name}</Link><div><span>Value<strong>${player.recommendedValue}</strong></span><span>Score<strong>{player.draftScore == null ? "—" : Math.round(player.draftScore * 100)}</strong></span><span>Scarcity<strong>{player.scarcityTier}</strong></span><span>Fit<strong>{ownerNeed(player, selectedTeam) ? "Need" : "Depth"}</strong></span></div><textarea value={preferences.notes[player.playerUid] || ""} onChange={(event) => setNote(player.playerUid, event.target.value)} placeholder="Private note—saved on this device" /></article>)}</div></section> : null}

      <section className="model-disclosure"><CircleDollarSign /><div><Eyebrow>Transparent by design</Eyebrow><h2>Tatnall Draft Score v1</h2><p>{room.data.methodology.performance} {room.data.methodology.blend}</p></div><Link to="/data-health">Audit the data <ArrowUpRight /></Link></section>
    </PageTransition>
  );
}
