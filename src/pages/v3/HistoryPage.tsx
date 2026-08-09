import React, { useMemo } from "react";
import { ArrowUpRight, Crown, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, CorrectedBadge, OwnerLink, PageIntro } from "../../components/v3/ArchiveUI";
import { useHistory } from "../../data/v3/hooks";

export default function HistoryPage(): React.ReactElement {
  const history = useHistory();
  const leaderboard = useMemo(() => {
    const owners = new Map<string, { uid: string | null; name: string; titles: number; finals: number; years: number[] }>();
    for (const season of history.data?.seasons || []) {
      for (const [team, won] of [[season.champion, true], [season.runnerUp, false]] as const) {
        const key = team.ownerUid || team.ownerName;
        const row = owners.get(key) || { uid: team.ownerUid, name: team.ownerName, titles: 0, finals: 0, years: [] };
        row.finals += 1;
        if (won) {
          row.titles += 1;
          row.years.push(season.season);
        }
        owners.set(key, row);
      }
    }
    return [...owners.values()].sort((a, b) => b.titles - a.titles || b.finals - a.finals || a.name.localeCompare(b.name));
  }, [history.data]);

  if (history.isLoading) return <ArchiveLoading label="Opening eleven season books" />;
  if (history.error || !history.data) return <ArchiveError error={history.error} />;

  return (
    <PageTransition>
      <PageIntro
        eyebrow="League encyclopedia"
        title="History has receipts."
        description="Every accepted champion, finalist, playoff seed, and team identity from the first Tatnall season onward. Provider data is evidence; league rulings are truth."
        aside={<div className="archive-count"><strong>{history.data.meta.seasons}</strong><span>completed seasons</span></div>}
      />

      <section className="history-layout">
        <div className="season-ledger">
          <div className="season-ledger__header"><span>Season</span><span>Champion</span><span>Runner-up</span><span>Source</span></div>
          {history.data.seasons.map((season) => (
            <Link to={`/seasons/${season.season}`} className="season-ledger__row" key={season.season}>
              <div className="season-year"><small>{season.platform}</small><strong>{season.season}</strong></div>
              <div className="ledger-finisher ledger-finisher--champion">
                <Trophy />
                <span><strong>{season.champion.ownerName}</strong><small>{season.champion.teamName} · #{season.champion.seed} seed</small></span>
              </div>
              <div className="ledger-finisher">
                <span className="runner-mark">2</span>
                <span><strong>{season.runnerUp.ownerName}</strong><small>{season.runnerUp.teamName} · #{season.runnerUp.seed} seed</small></span>
              </div>
              <div className="ledger-source">{season.corrected ? <CorrectedBadge /> : <span>Provider verified</span>}<ArrowUpRight /></div>
            </Link>
          ))}
        </div>

        <aside className="history-sidebar">
          <div className="archive-panel archive-panel--sticky">
            <Crown className="panel-icon" />
            <h2>Title leaderboard</h2>
            <div className="history-leaders">
              {leaderboard.map((owner, index) => (
                <div key={owner.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <OwnerLink uid={owner.uid}><strong>{owner.name}</strong><small>{owner.years.join(" · ") || "Finalist"}</small></OwnerLink>
                  <b>{owner.titles}</b>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </PageTransition>
  );
}
