import React, { useMemo } from "react";
import { ArrowUpRight, Crown, Database, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, Eyebrow, OwnerLink, formatFreshness } from "../../components/v3/ArchiveUI";
import { useHistory, useNow } from "../../data/v3/hooks";

export default function NowPage(): React.ReactElement {
  const now = useNow();
  const history = useHistory();
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

  if (now.isLoading || history.isLoading) return <ArchiveLoading label="Opening the 2026 command center" />;
  if (now.error || history.error || !now.data || !history.data) return <ArchiveError error={now.error || history.error} />;

  const data = now.data;
  const phaseLabel = data.league.phase === "preseason" ? "Preseason" : `Week ${data.league.week}`;
  const latestChampions = history.data.seasons.slice(0, 5);

  return (
    <PageTransition>
      <section className="now-hero">
        <div className="now-hero__grid" aria-hidden="true" />
        <div className="now-hero__main">
          <div className="live-line"><span /> {data.league.season} · {phaseLabel}</div>
          <h1>The league never forgets.</h1>
          <p>
            Eleven seasons of accepted Tatnall history, now connected to the live {data.league.season} Sleeper league.
            The archive is ready before the first kickoff.
          </p>
          <div className="now-hero__actions">
            <Link to="/history" className="archive-button archive-button--primary">Explore the archive <ArrowUpRight /></Link>
            <Link to="/players" className="archive-button">Scout players</Link>
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
        <div><span>Current phase</span><strong className="textual-stat">Preseason</strong><small>draft research mode</small></div>
      </section>

      <div className="archive-section-heading">
        <div><Eyebrow>Now</Eyebrow><h2>Eight teams. A clean slate.</h2></div>
        <p>Live rosters are connected; standings and matchup panels will switch on when the season begins.</p>
      </div>

      <section className="current-team-grid">
        {data.teams.map((team) => (
          <article className="current-team-card" key={team.rosterId}>
            <div className="current-team-card__top">
              <span className="roster-number">0{team.rosterId}</span>
              <span className="division-label">Division {team.division}</span>
            </div>
            <h3>{team.teamName}</h3>
            <OwnerLink uid={team.ownerUid}>{team.ownerName}</OwnerLink>
            <div className="roster-summary">
              <span><Users /> {team.players.length} players</span>
              <span>Waiver #{team.waiverPosition ?? "—"}</span>
            </div>
            <details>
              <summary>Roster snapshot</summary>
              <div className="mini-roster">
                {team.players.slice(0, 13).map((player) => (
                  <Link key={player.sleeperId} to={`/players/${player.sleeperId}?name=${encodeURIComponent(player.name)}`}>
                    <span>{player.position || "—"}</span>{player.name}<small>{player.nflTeam || "FA"}</small>
                  </Link>
                ))}
              </div>
            </details>
          </article>
        ))}
      </section>

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
