import React, { useMemo, useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Archive, BarChart3, CalendarDays, Database, Gavel, Menu, Search, ShieldCheck, Swords, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggle from "./ThemeToggle.jsx";
import SamuelPowerRankings from "./v3/SamuelPowerRankings";
import { features } from "../config/features";
import { useV3Manifest, useV3Search } from "../data/v3/hooks";

const mainNav = [
  { to: "/2026", label: "2026 Projections" },
  { to: "/history", label: "History" },
  { to: "/owners", label: "Owners" },
  { to: "/players", label: "Players" },
  ...(features.playerIntelligenceV1 ? [{ to: "/war-room", label: "Draft Recap" }] : []),
  { to: "/records", label: "Records" },
];

const currentNav = [
  { to: "/2026", label: "2026 Overview", icon: Trophy },
  { to: "/2026/weeks/1", label: "Weekly Reports", icon: CalendarDays },
  { to: "/matchups", label: "Matchups", icon: Swords },
  ...(features.playerIntelligenceV1 ? [{ to: "/war-room", label: "Draft Recap", icon: Gavel }] : []),
  { to: "/standings", label: "Standings", icon: BarChart3 },
  { to: "/transactions", label: "Transactions", icon: Archive },
  { to: "/data-health", label: "Data health", icon: Database },
];

export default function Layout({ children }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const manifest = useV3Manifest();
  const searchData = useV3Search(searchOpen || search.trim().length > 0);
  const seasonLabel = manifest.data
    ? `${manifest.data.league.currentSeason} ${manifest.data.league.seasonPhase}`
    : "Current league";
  const results = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return (searchData.data?.items || [])
      .filter((item) => `${item.label} ${item.secondary}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [search, searchData.data]);
  const showSamuelRankings = location.pathname === "/" || location.pathname === "/2026";

  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchOpen(false);
    setSearch("");
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  return (
    <div className="app-shell archive-shell">
      <header className="archive-header">
        <Link to="/" className="archive-brand" aria-label="Tatnall Legacy home">
          <span className="archive-brand__mark">TL</span>
          <span><strong>Tatnall Legacy</strong><small>League archive · Est. 2015</small></span>
        </Link>

        <nav className="archive-main-nav" aria-label="Primary navigation">
          {mainNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive || (item.to === "/2026" && location.pathname === "/") ? "active" : ""}>{item.label}</NavLink>
          ))}
        </nav>

        <div className="archive-header__tools">
          <span className="season-chip"><i /> {seasonLabel}</span>
          <button className="header-search-button" type="button" onClick={() => setSearchOpen((value) => !value)} aria-label="Search archive"><Search /></button>
          <ThemeToggle />
          <button className="header-menu-button" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
        </div>
      </header>

      <AnimatePresence>
        {searchOpen ? (
          <motion.div className="archive-search-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="search-backdrop" onClick={() => setSearchOpen(false)} aria-label="Close search" />
            <motion.div className="archive-search-panel" initial={{ y: -20 }} animate={{ y: 0 }} exit={{ y: -20 }}>
              <Search />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players, owners, and seasons…" />
              <button type="button" onClick={() => setSearchOpen(false)}><X /></button>
              {search.trim() ? (
                <div className="archive-search-results">
                  {searchData.isLoading ? <span>Searching the archive…</span> : results.length ? results.map((item) => (
                    <Link to={item.url} key={`${item.type}-${item.id}`}><span className={`search-type search-type--${item.type}`}>{item.type[0]}</span><span><strong>{item.label}</strong><small>{item.secondary}</small></span></Link>
                  )) : <span>No matching archive entries.</span>}
                </div>
              ) : <small className="search-hint">Try an owner, a season, or an NFL player.</small>}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mobileMenuOpen ? (
          <motion.div className="archive-mobile-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 320 }}>
              <div className="mobile-menu-head"><span className="archive-brand__mark">TL</span><button type="button" onClick={() => setMobileMenuOpen(false)}><X /></button></div>
              <nav>{mainNav.map((item) => <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>)}</nav>
              <span className="mobile-nav-label">Current league</span>
              <nav className="mobile-subnav">{currentNav.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to}><Icon />{item.label}</NavLink>; })}</nav>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="site-main"><div className="content-container">{showSamuelRankings ? <SamuelPowerRankings /> : null}{children}</div></main>
      <footer className="archive-footer">
        <div><span className="archive-brand__mark">TL</span><p><strong>Tatnall Legacy</strong><small>The permanent record and current-season command center.</small></p></div>
        <nav>{currentNav.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}</nav>
        <Link to="/data-health" className="footer-integrity"><ShieldCheck /> Canonical data · public audit trail</Link>
      </footer>
    </div>
  );
}
