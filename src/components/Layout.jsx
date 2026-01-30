import React, { useMemo, useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useDataContext } from "../data/DataContext";
import ThemeToggle from "./ThemeToggle.jsx";
import { CommandMenu } from "./CommandMenu.jsx";
import { Menu, X, Search, Trophy, Home, Calendar, ArrowLeftRight, List, Users, Award, Swords } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { to: "/", label: "Summary", icon: Home },
  { to: "/seasons", label: "Seasons", icon: Calendar },
  { to: "/matchups", label: "Matchups", icon: Swords },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/standings", label: "Standings", icon: List },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/records", label: "Records", icon: Award },
  { to: "/head-to-head", label: "Head-to-Head", icon: Trophy },
];

export default function Layout({ children }) {
  const { players, playerIds, playerSearch } = useDataContext();
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const playerIndex = useMemo(() => {
    const combined = [];
    const seen = new Set();
    const pushRow = (row) => {
      if (!row?.id || !row?.name) return;
      if (seen.has(row.id)) return;
      seen.add(row.id);
      combined.push(row);
    };
    for (const row of playerSearch || []) {
      pushRow({
        id: String(row?.id || ""),
        idType: row?.id_type || "",
        name: row?.name || "",
        position: row?.position || "—",
        team: row?.team || "—",
      });
    }
    const sleeperByUid = new Map();
    for (const entry of playerIds || []) {
      if (entry?.id_type === "sleeper" && entry?.player_uid && entry?.id_value) {
        sleeperByUid.set(String(entry.player_uid), String(entry.id_value));
      }
    }
    for (const player of players || []) {
      pushRow({
        id: sleeperByUid.get(String(player?.player_uid)),
        name: player?.full_name,
        position: player?.position || "—",
        team: player?.nfl_team || "—",
      });
    }
    return combined;
  }, [players, playerIds, playerSearch]);

  const filteredResults = useMemo(() => {
    if (!search.trim()) return [];
    const needle = search.trim().toLowerCase();
    return playerIndex.filter((row) => row.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [search, playerIndex]);

  return (
    <>
      <CommandMenu />
      <div className="app-shell">
        <header className="site-header">
          {/* Logo/Brand */}
          <Link to="/" className="brand flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="brand-title">Tatnall Legacy League</div>
              <div className="brand-subtitle hidden sm:block">League Encyclopedia</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="site-nav hidden lg:flex">
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

          {/* Right side tools */}
          <div className="header-tools">
            {/* Search */}
            <div className="header-search hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onFocus={() => setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  placeholder="Find a player..."
                  className="pl-9"
                />
              </div>
              {showResults && filteredResults.length > 0 && (
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
              )}
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-[var(--text-primary)]" />
              ) : (
                <Menu className="w-6 h-6 text-[var(--text-primary)]" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                onClick={() => setMobileMenuOpen(false)}
              />

              {/* Mobile Menu Drawer */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed top-0 left-0 bottom-0 w-72 bg-[var(--bg-secondary)] border-r border-[var(--border)] z-50 lg:hidden overflow-y-auto"
              >
                {/* Mobile Menu Header */}
                <div className="p-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent)] flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">Tatnall Legacy</div>
                      <div className="text-sm text-[var(--text-muted)]">League Encyclopedia</div>
                    </div>
                  </div>

                  {/* Mobile Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a player..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Mobile Navigation Links */}
                <nav className="p-4">
                  <div className="space-y-1">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-[var(--accent-light)] text-[var(--accent)]"
                                : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                            }`
                          }
                        >
                          <Icon className="w-5 h-5" />
                          {item.label}
                        </NavLink>
                      );
                    })}
                  </div>
                </nav>

                {/* Mobile Menu Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)]">Theme</span>
                    <ThemeToggle />
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="site-main">
          <div className="content-container">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

