import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { PlayerSearch } from "./components/PlayerSearch";
import { Button } from "./components/ui/button";
import { SleeperLoginModal } from "./components/SleeperLoginPanel";
import { useTheme } from "./components/ThemeProvider";
import { useSeasonSelection } from "./hooks/useSeasonSelection";
import { cn } from "./lib/utils";
import {
  ensureGuestLog,
  getCurrentUser,
  subscribeToUserLog,
  type SleeperUser,
} from "./lib/userLog";
import { PowerRankings } from "./pages/PowerRankings";
import { Summary } from "./pages/Summary";
import { UserLogPortal } from "./pages/UserLogPortal";
import { WeeklyRecaps } from "./pages/WeeklyRecaps";
import { DataInspectorSection } from "./sections/DataInspectorSection";
import { DraftSection } from "./sections/DraftSection";
import { LiveSection } from "./sections/LiveSection";
import { MatchupsSection } from "./sections/MatchupsSection";
import { MembersSection } from "./sections/MembersSection";
import { MostDraftedSection } from "./sections/MostDraftedSection";
import { TeamsSection } from "./sections/TeamsSection";
import { TransactionsSection } from "./sections/TransactionsSection";

const baseNavigation = [
  { label: "Summary", path: "/" },
  { label: "Teams", path: "/teams" },
  { label: "Matchups", path: "/matchups" },
  { label: "Draft", path: "/draft" },
  { label: "Most Drafted", path: "/most-drafted" },
  { label: "Transactions", path: "/transactions" },
  { label: "Members", path: "/members" },
  { label: "Rankings", path: "/rankings" },
  { label: "Recaps", path: "/recaps" },
  { label: "Live", path: "/live" },
];

const devNavigation = import.meta.env.DEV
  ? [{ label: "Data Inspector", path: "/data-inspector" }]
  : [];

const navigation = [...baseNavigation, ...devNavigation];

export default function App() {
  const [isLoginOpen, setLoginOpen] = useState(false);
  const [isNavOpen, setNavOpen] = useState(false);
  const [currentUser, setCurrentUserState] = useState<SleeperUser | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { status, years, year, setYear, error } = useSeasonSelection();

  useEffect(() => {
    ensureGuestLog();
    setCurrentUserState(getCurrentUser());
    return subscribeToUserLog(() => {
      setCurrentUserState(getCurrentUser());
    });
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const handleLoginSuccess = (user: SleeperUser) => {
    setCurrentUserState(user);
    if (user.username === "conner27lax") {
      navigate("/user-log");
      return;
    }
    navigate("/");
  };

  const canAccessLog = currentUser?.username === "conner27lax";
  const seasonOptions = useMemo(() => {
    if (status === "loading") {
      return [{ label: "Loading seasons…", value: "" }];
    }
    if (status === "error") {
      return [{ label: "Season load failed", value: "" }];
    }
    return years.map((season) => ({ label: String(season), value: String(season) }));
  }, [status, years]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-title__kicker">Tatnall Legacy</p>
            <h1 className="app-title__headline">League Operations Hub</h1>
          </div>
          <div className="app-toolbar">
            <div className="app-toolbar__row">
              <PlayerSearch />
              <div className="app-pill">
                <label htmlFor="seasonSelect" className="app-pill__label">
                  Season
                </label>
                <select
                  id="seasonSelect"
                  aria-label="Season"
                  className="input text-xs"
                  disabled={status !== "ready"}
                  value={year ?? ""}
                  onChange={(event) => setYear(Number(event.target.value))}
                >
                  {seasonOptions.map((option) => (
                    <option key={option.value || option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-border text-foreground hover:bg-surface-alt"
                onClick={toggleTheme}
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </Button>
            </div>
            <div className="app-pill">
              <div>
                <p className="app-pill__label">Sleeper Access</p>
                <p className="app-pill__value">
                  {currentUser
                    ? `Logged in as @${currentUser.username}`
                    : "Log in to access the user log"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="app-icon-button"
                aria-label="Open Sleeper login"
              >
                <img
                  src="https://sleepercdn.com/images/app-logo.png"
                  alt="Sleeper logo"
                  className="h-6 w-6"
                />
              </button>
            </div>
          </div>
        </div>
        {status === "error" ? (
          <div className="border-t border-border bg-surface px-6 py-2 text-xs text-red-500">
            Unable to load seasons: {error}
          </div>
        ) : null}
        <nav className="app-nav">
          <div className="app-nav__inner">
            <div className="app-nav__controls">
              <span className="text-xs uppercase tracking-[0.2em] text-muted md:hidden">
                Navigation
              </span>
              <button
                type="button"
                className="app-nav__toggle"
                onClick={() => setNavOpen((open) => !open)}
                aria-expanded={isNavOpen}
                aria-controls="primary-navigation"
              >
                {isNavOpen ? "Close menu" : "Open menu"}
              </button>
            </div>
            <div
              id="primary-navigation"
              className={cn("app-nav__links", isNavOpen ? "flex" : "hidden md:flex")}
            >
              {navigation.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    cn("app-nav__link", isActive && "app-nav__link--active")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <a href="trade.html" className="app-nav__link">
                Trade Analysis
              </a>
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route path="/teams" element={<TeamsSection />} />
          <Route path="/matchups" element={<MatchupsSection />} />
          <Route path="/draft" element={<DraftSection />} />
          <Route path="/most-drafted" element={<MostDraftedSection />} />
          <Route path="/transactions" element={<TransactionsSection />} />
          <Route path="/members" element={<MembersSection />} />
          <Route path="/rankings" element={<PowerRankings />} />
          <Route path="/recaps" element={<WeeklyRecaps />} />
          <Route path="/live" element={<LiveSection />} />
          <Route
            path="/user-log"
            element={<UserLogPortal canAccess={Boolean(canAccessLog)} />}
          />
          {import.meta.env.DEV ? (
            <Route path="/data-inspector" element={<DataInspectorSection />} />
          ) : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SleeperLoginModal
        isOpen={isLoginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
