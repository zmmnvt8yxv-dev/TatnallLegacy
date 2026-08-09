import React, { useMemo, useState } from "react";
import { Activity, ArrowLeft, BadgeDollarSign, ChevronLeft, ChevronRight, Crown, Gavel, ListChecks, ShieldCheck, Trophy } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, CompletenessBadge, CorrectedBadge, Eyebrow, OwnerLink, formatPoints } from "../../components/v3/ArchiveUI";
import { useSeasonDraft, useSeasonFacts, useSeasonLineups, useSeasonMatchups, useSeasonTransactions, useSeasonYearbook, useV3Manifest } from "../../data/v3/hooks";

export default function SeasonYearbookPage(): React.ReactElement {
  const { season: seasonParam } = useParams();
  const season = Number(seasonParam);
  const yearbook = useSeasonYearbook(season);
  const matchups = useSeasonMatchups(season);
  const facts = useSeasonFacts(season);
  const manifest = useV3Manifest();
  const [factView, setFactView] = useState<"lineups" | "transactions" | "draft">("lineups");
  const [lineupWeek, setLineupWeek] = useState(17);
  const [transactionType, setTransactionType] = useState("all");
  const factLineups = useSeasonLineups(season, lineupWeek, season === 2025 && factView === "lineups" && Boolean(facts.data));
  const factTransactions = useSeasonTransactions(
    season,
    facts.data?.summary.transactions.availableWeeks || [],
    season === 2025 && factView === "transactions",
  );
  const factDraft = useSeasonDraft(season, season === 2025 && factView === "draft");
  const playoffs = useMemo(
    () => (matchups.data?.matchups || []).filter((row) => row.type !== "regular_season"),
    [matchups.data],
  );

  if (!Number.isFinite(season)) return <Navigate to="/history" replace />;
  if (yearbook.isLoading || matchups.isLoading || manifest.isLoading || (season === 2025 && facts.isLoading)) return <ArchiveLoading label={`Opening the ${season} yearbook`} />;
  if (yearbook.error || matchups.error || manifest.error || facts.error || !yearbook.data || !matchups.data || !manifest.data) {
    return <ArchiveError error={yearbook.error || matchups.error || manifest.error || facts.error} />;
  }

  const data = yearbook.data;
  const years = manifest.data.seasons;
  const previous = years.includes(season - 1) ? season - 1 : null;
  const next = years.includes(season + 1) ? season + 1 : null;
  const seasonFacts = facts.data;
  const selectedLineups = factLineups.data || [];
  const completedTransactions = (factTransactions.data || []).filter(
    (row) => row.status === "complete" && (transactionType === "all" || row.type === transactionType),
  );
  const draftRows = factDraft.data || [];
  const primaryDraft = draftRows.reduce(
    (best, draft) => (draft.pickCount > (best?.pickCount || 0) ? draft : best),
    draftRows[0],
  );

  return (
    <PageTransition>
      <nav className="yearbook-nav" aria-label="Season navigation">
        <Link to="/history"><ArrowLeft /> All seasons</Link>
        <div>{previous ? <Link to={`/seasons/${previous}`}><ChevronLeft /> {previous}</Link> : <span />}{next ? <Link to={`/seasons/${next}`}>{next} <ChevronRight /></Link> : <span />}</div>
      </nav>

      <section className="yearbook-hero">
        <div className="yearbook-stamp"><span>Tatnall</span><strong>{season}</strong><small>Yearbook</small></div>
        <div className="yearbook-hero__copy">
          <Eyebrow>{data.season.platform} era · Season {season - 2014}</Eyebrow>
          <h1>{data.season.champion.teamName}</h1>
          <p><Crown /> {data.season.champion.ownerName} claimed the title from the #{data.season.champion.seed} seed.</p>
          {data.season.corrected ? <CorrectedBadge /> : null}
        </div>
        <div className="final-scorecard">
          <Eyebrow>Championship result</Eyebrow>
          <div className="finalist finalist--winner"><Trophy /><span><small>Champion</small><strong>{data.season.champion.ownerName}</strong><em>{data.season.champion.teamName}</em></span><b>#{data.season.champion.seed}</b></div>
          <div className="finalist"><span className="runner-mark">2</span><span><small>Runner-up</small><strong>{data.season.runnerUp.ownerName}</strong><em>{data.season.runnerUp.teamName}</em></span><b>#{data.season.runnerUp.seed}</b></div>
        </div>
      </section>

      {data.season.corrected ? (
        <div className="ruling-note"><ShieldCheck /><div><strong>The accepted league result is applied here.</strong><span>The raw platform record is preserved separately, while Tatnall's 2022 ruling recognizes King of January / Conner Malley as champion.</span></div></div>
      ) : null}

      <section className="archive-section">
        <div className="archive-section-heading"><div><Eyebrow>Regular season</Eyebrow><h2>Final standings</h2></div><p>Champion status is taken from the accepted playoff result—not the standings leader.</p></div>
        <div className="standings-table-wrap">
          <table className="archive-table">
            <thead><tr><th>Rank</th><th>Team</th><th>Owner</th><th>Record</th><th>PF</th><th>PA</th><th>Finish</th></tr></thead>
            <tbody>
              {data.standings.map((team) => (
                <tr key={team.teamSeasonUid} className={team.champion ? "is-champion" : ""}>
                  <td><strong>{team.rank}</strong></td>
                  <td>{team.teamName}</td>
                  <td><OwnerLink uid={team.ownerUid}>{team.ownerName}</OwnerLink></td>
                  <td>{team.wins}–{team.losses}{team.ties ? `–${team.ties}` : ""}</td>
                  <td>{formatPoints(team.pointsFor)}</td>
                  <td>{formatPoints(team.pointsAgainst)}</td>
                  <td>{team.champion ? <span className="table-finish table-finish--gold">Champion</span> : team.runnerUp ? <span className="table-finish">Runner-up</span> : team.playoffFinish ? `#${team.playoffFinish}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {seasonFacts ? (
        <section className="season-facts archive-section">
          <div className="archive-section-heading">
            <div><Eyebrow>Complete Sleeper record</Eyebrow><h2>Every lineup, move, and auction buy.</h2></div>
            <p>The 2025 season is finalized from the official league snapshot—not reconstructed from summaries.</p>
          </div>
          <div className="season-fact-strip">
            <div><ListChecks /><span>Final lineups</span><strong>{seasonFacts.summary.lineups.teamWeeks}</strong><small>{seasonFacts.summary.lineups.weeks} weeks · {seasonFacts.summary.lineups.playerEntries.toLocaleString()} player entries</small></div>
            <div><Activity /><span>Completed moves</span><strong>{seasonFacts.summary.transactions.completed}</strong><small>{seasonFacts.summary.transactions.failed} failed claims preserved separately</small></div>
            <div><Gavel /><span>Auction purchases</span><strong>{seasonFacts.summary.draft.completedPicks}</strong><small>${seasonFacts.summary.draft.budget} starting budget</small></div>
          </div>

          <div className="fact-tabs" role="tablist" aria-label="2025 season details">
            <button type="button" role="tab" aria-selected={factView === "lineups"} onClick={() => setFactView("lineups")}><ListChecks /> Lineups</button>
            <button type="button" role="tab" aria-selected={factView === "transactions"} onClick={() => setFactView("transactions")}><Activity /> Transactions</button>
            <button type="button" role="tab" aria-selected={factView === "draft"} onClick={() => setFactView("draft")}><Gavel /> Auction draft</button>
          </div>

          {factView === "lineups" ? (
            <div className="fact-view">
              <div className="fact-toolbar">
                <div><strong>Final submitted lineups</strong><span>Starter slots and official Sleeper points</span></div>
                <label>Week <select value={lineupWeek} onChange={(event) => setLineupWeek(Number(event.target.value))}>{Array.from({ length: 17 }, (_, index) => index + 1).map((week) => <option value={week} key={week}>{week}</option>)}</select></label>
              </div>
              {factLineups.isLoading ? <div className="fact-inline-state">Loading Week {lineupWeek} lineups…</div> : factLineups.error ? <div className="fact-inline-state">Could not load this lineup week.</div> : <div className="lineup-fact-grid">
                {selectedLineups.map((lineup) => (
                  <article key={lineup.lineupUid} className="lineup-fact-card">
                    <header><div><strong>{lineup.team.teamName}</strong><OwnerLink uid={lineup.team.ownerUid}>{lineup.team.ownerName}</OwnerLink></div><b>{formatPoints(lineup.points)}</b></header>
                    <div className="lineup-starters">
                      {lineup.players.filter((player) => player.started).map((player) => (
                        <Link to={`/players/${player.sleeperId}?name=${encodeURIComponent(player.name)}`} key={player.sleeperId}>
                          <span>{player.slot}</span><strong>{player.name}</strong><b>{player.points == null ? "—" : formatPoints(player.points)}</b>
                        </Link>
                      ))}
                    </div>
                    <details><summary>Bench ({lineup.players.filter((player) => !player.started).length})</summary><div className="lineup-bench">{lineup.players.filter((player) => !player.started).map((player) => <span key={player.sleeperId}>{player.position || "—"} · {player.name} <b>{player.points == null ? "—" : formatPoints(player.points)}</b></span>)}</div></details>
                  </article>
                ))}
              </div>}
            </div>
          ) : null}

          {factView === "transactions" ? (
            <div className="fact-view">
              <div className="fact-toolbar">
                <div><strong>Completed transaction ledger</strong><span>Failed waiver claims remain counted in data health but do not masquerade as moves.</span></div>
                <label>Type <select value={transactionType} onChange={(event) => setTransactionType(event.target.value)}><option value="all">All</option><option value="trade">Trades</option><option value="waiver">Waivers</option><option value="free_agent">Free agents</option><option value="commissioner">Commissioner</option></select></label>
              </div>
              {factTransactions.isLoading ? <div className="fact-inline-state">Loading the complete transaction ledger…</div> : factTransactions.error ? <div className="fact-inline-state">Could not load the transaction ledger.</div> : <div className="transaction-ledger">
                {completedTransactions.map((transaction) => (
                  <article key={transaction.transactionUid}>
                    <div className="transaction-ledger__meta"><span>Week {transaction.week}</span><strong>{transaction.type.replace("_", " ")}</strong><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(transaction.createdAt))}</time>{transaction.waiverBid != null ? <b>${transaction.waiverBid} FAAB</b> : null}</div>
                    <div className="transaction-assets">
                      {transaction.assets.map((asset, index) => (
                        <div key={`${asset.type}-${asset.sleeperId || index}`}>
                          {asset.type === "player" && asset.sleeperId ? <Link to={`/players/${asset.sleeperId}?name=${encodeURIComponent(asset.name || "Player")}`}><span>{asset.position || "—"}</span><strong>{asset.name}</strong></Link> : <strong><BadgeDollarSign /> {asset.amount} FAAB</strong>}
                          <small>{asset.from ? `${asset.from.teamName} → ` : "Added by "}{asset.to?.teamName || "Free agency"}</small>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>}
            </div>
          ) : null}

          {factView === "draft" ? factDraft.isLoading ? <div className="fact-view fact-inline-state">Loading the auction board…</div> : factDraft.error ? <div className="fact-view fact-inline-state">Could not load the auction board.</div> : primaryDraft ? (
            <div className="fact-view">
              <div className="fact-toolbar"><div><strong>2025 auction board</strong><span>{primaryDraft.pickCount} purchases · ${primaryDraft.budget} per team · {primaryDraft.rounds} roster rounds</span></div><span className="draft-complete-pill"><ShieldCheck /> Complete</span></div>
              <div className="standings-table-wrap draft-table-wrap">
                <table className="archive-table">
                  <thead><tr><th>Pick</th><th>Player</th><th>Position</th><th>Winning team</th><th>Price</th></tr></thead>
                  <tbody>{primaryDraft.picks.map((pick) => <tr key={pick.pickNo}><td>{pick.pickNo}</td><td><Link to={`/players/${pick.sleeperId}?name=${encodeURIComponent(pick.name)}`}>{pick.name}</Link></td><td>{pick.position || "—"} · {pick.nflTeam || "FA"}</td><td><strong>{pick.team.teamName}</strong><small>{pick.team.ownerName}</small></td><td><b className="auction-price">${pick.amount ?? 0}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : <div className="fact-view fact-inline-state">No completed draft is available.</div> : null}
        </section>
      ) : null}

      <section className="archive-split archive-split--season">
        <div className="archive-panel">
          <Eyebrow>Postseason</Eyebrow><h2>Playoff ledger</h2>
          {data.meta.completeness.matchups !== "complete" ? <p className="coverage-note">Provider matchup scores are {data.meta.completeness.matchups}. They are shown as preserved evidence, but are excluded from all-time records and rivalry totals.</p> : null}
          <div className="playoff-ledger">
            {playoffs.length ? playoffs.map((game) => {
              const homeWon = game.winnerTeamSeasonUid === game.home.teamSeasonUid;
              const awayWon = game.winnerTeamSeasonUid === game.away.teamSeasonUid;
              return (
                <div key={game.matchupUid}>
                  <span className="playoff-week">W{game.week}<small>{game.type.replaceAll("_", " ")}</small></span>
                  <span className={homeWon ? "won" : ""}>{game.home.teamName}<b>{formatPoints(game.home.points)}</b></span>
                  <span className={awayWon ? "won" : ""}>{game.away.teamName}<b>{formatPoints(game.away.points)}</b></span>
                  {game.corrected ? <ShieldCheck aria-label="Corrected result" /> : null}
                </div>
              );
            }) : <p>Playoff matchups are unavailable for this season.</p>}
          </div>
        </div>
        <div className="archive-panel">
          <Eyebrow>Data coverage</Eyebrow><h2>What this year can prove</h2>
          <div className="coverage-list">
            {Object.entries(data.meta.completeness).map(([dataset, status]) => (
              <div key={dataset}><span>{dataset}</span><CompletenessBadge status={status} /></div>
            ))}
          </div>
          <p className="coverage-note">Unavailable and partial records are never displayed as zero. This prevents incomplete exports from becoming false statistics.</p>
        </div>
      </section>
    </PageTransition>
  );
}
