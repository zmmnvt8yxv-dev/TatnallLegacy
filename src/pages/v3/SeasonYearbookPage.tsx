import React, { useMemo } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Crown, ShieldCheck, Trophy } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, CompletenessBadge, CorrectedBadge, Eyebrow, OwnerLink, formatPoints } from "../../components/v3/ArchiveUI";
import { useSeasonMatchups, useSeasonYearbook, useV3Manifest } from "../../data/v3/hooks";

export default function SeasonYearbookPage(): React.ReactElement {
  const { season: seasonParam } = useParams();
  const season = Number(seasonParam);
  const yearbook = useSeasonYearbook(season);
  const matchups = useSeasonMatchups(season);
  const manifest = useV3Manifest();
  const playoffs = useMemo(
    () => (matchups.data?.matchups || []).filter((row) => row.type !== "regular_season"),
    [matchups.data],
  );

  if (!Number.isFinite(season)) return <Navigate to="/history" replace />;
  if (yearbook.isLoading || matchups.isLoading || manifest.isLoading) return <ArchiveLoading label={`Opening the ${season} yearbook`} />;
  if (yearbook.error || matchups.error || manifest.error || !yearbook.data || !matchups.data || !manifest.data) {
    return <ArchiveError error={yearbook.error || matchups.error || manifest.error} />;
  }

  const data = yearbook.data;
  const years = manifest.data.seasons;
  const previous = years.includes(season - 1) ? season - 1 : null;
  const next = years.includes(season + 1) ? season + 1 : null;

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
                  <span className="playoff-week">W{game.week}<small>{game.type.replace("_", " ")}</small></span>
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
