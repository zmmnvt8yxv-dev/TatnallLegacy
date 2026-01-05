import React, { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useDataContext } from "../data/DataContext.jsx";

const navItems = [
  { to: "/", label: "Summary" },
  { to: "/matchups", label: "Matchups" },
  { to: "/transactions", label: "Transactions" },
  { to: "/standings", label: "Standings" },
];

export default function Layout({ children }) {
  const { players, playerIds, playerSearch } = useDataContext();
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  const playerIndex = useMemo(() => {
    if (playerSearch?.length) {
      return playerSearch
        .map((row) => ({
          id: String(row?.id || ""),
          idType: row?.id_type || "",
          name: row?.name || "",
          position: row?.position || "—",
          team: row?.team || "—",
        }))
        .filter((row) => row.id && row.name);
    }
    const sleeperByUid = new Map();
    for (const entry of playerIds || []) {
      if (entry?.id_type === "sleeper" && entry?.player_uid && entry?.id_value) {
        sleeperByUid.set(String(entry.player_uid), String(entry.id_value));
      }
    }
    return (players || [])
      .map((player) => ({
        id: sleeperByUid.get(String(player?.player_uid)),
        name: player?.full_name,
        position: player?.position || "—",
        team: player?.nfl_team || "—",
      }))
      .filter((row) => row.id && row.name);
  }, [players, playerIds, playerSearch]);

  const filteredResults = useMemo(() => {
    if (!search.trim()) return [];
    const needle = search.trim().toLowerCase();
    return playerIndex.filter((row) => row.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [search, playerIndex]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-title">Tatnall Legacy League</div>
          <div className="brand-subtitle">League Encyclopedia</div>
        </div>
        <div className="header-tools">
          <div className="header-search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Find a player..."
            />
            {showResults && filteredResults.length ? (
              <div className="search-results">
                {filteredResults.map((row) => (
                  <Link
                    key={row.id}
                    to={`/players/${row.id}?name=${encodeURIComponent(row.name)}`}
                    className="search-result"
                    onClick={() => {
                      setSearch("");
                      setShowResults(false);
                    }}
                  >
                    <span>{row.name}</span>
                    <span className="search-result-meta">
                      {row.position} · {row.team}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <nav className="site-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="site-main">{children}</main>
    </div>
  );
}
