import React, { useMemo, useState } from "react";
import { ArrowUpRight, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, PageIntro } from "../../components/v3/ArchiveUI";
import { usePlayersDirectory } from "../../data/v3/hooks";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"];

export default function PlayersDirectoryPage(): React.ReactElement {
  const directory = usePlayersDirectory();
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (directory.data?.players || []).filter((player) => {
      if (position !== "ALL" && player.position !== position) return false;
      if (!needle) return true;
      return `${player.name} ${player.nflTeam || ""} ${player.college || ""}`.toLowerCase().includes(needle);
    }).slice(0, 160);
  }, [directory.data, position, query]);

  if (directory.isLoading) return <ArchiveLoading label="Indexing the current player universe" />;
  if (directory.error || !directory.data) return <ArchiveError error={directory.error} />;

  return (
    <PageTransition>
      <PageIntro eyebrow="Player intelligence" title="Scout the league." description="A compact, canonical directory of active fantasy players. Provider IDs are mapped permanently, so the two Lamar Jacksons can never become one player again." aside={<div className="archive-count"><strong>{directory.data.meta.count.toLocaleString()}</strong><span>active players</span></div>} />

      <section className="player-filter-bar">
        <label><Search /><span className="sr-only">Search players</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, NFL team, or college" /></label>
        <div>{POSITIONS.map((item) => <button type="button" key={item} onClick={() => setPosition(item)} className={position === item ? "active" : ""}>{item === "ALL" ? "All" : item}</button>)}</div>
      </section>

      <div className="player-results-meta"><span>Showing {filtered.length} results</span><small>Current NFL-team players · Rostered players appear first</small></div>
      <section className="player-directory">
        {filtered.map((player) => (
          <Link key={player.playerUid} to={`/players/${player.playerUid}`}>
            <span className={`position-mark position-mark--${player.position.toLowerCase().replace("/", "")}`}>{player.position}</span>
            <span className="player-directory__name"><strong>{player.name}</strong><small>{[player.nflTeam, player.college].filter(Boolean).join(" · ") || "NFL player"}</small></span>
            {player.currentlyRostered ? <span className="rostered-mark"><ShieldCheck /> Tatnall roster</span> : <span />}
            <ArrowUpRight />
          </Link>
        ))}
      </section>
      {filtered.length === 160 ? <p className="result-limit">Showing the first 160 matches. Refine your search to narrow the directory.</p> : null}
    </PageTransition>
  );
}
