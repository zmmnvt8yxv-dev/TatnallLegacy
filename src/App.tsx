import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";

import { PlayerSearch } from "./components/PlayerSearch";
import { Button } from "./components/ui/button";
import { SleeperLoginModal } from "./components/SleeperLoginPanel";
import { useTheme } from "./components/ThemeProvider";
import { useSeasonSelection } from "./hooks/useSeasonSelection";
import { cn } from "./lib/utils";
import {
  ensureGuestLog,
  getCurrentUser,
  setCurrentUser,
  subscribeToUserLog,
  type SleeperUser,
} from "./lib/userLog";
import { PowerRankings } from "./pages/PowerRankings";
import { PlayerComparePage } from "./pages/PlayerComparePage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
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
  { label: "Compare", path: "/compare" },
];

const devNavigation = import.meta.env.DEV
  ? [{ label: "Data Inspector", path: "/data-inspector" }]
  : [];

const navigation = [...baseNavigation, ...devNavigation];
const adminUsername = import.meta.env.VITE_ADMIN_USERNAME ?? "conner27lax";

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
    toast.success(`Welcome back, @${user.username}.`);
    if (user.username === adminUsername) {
      navigate("/user-log");
      return;
    }
    navigate("/");
  };

  const canAccessLog = currentUser?.username === adminUsername;
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
        <div className="app-topbar">
          <div className="app-brand">
            <p className="app-title__kicker">Tatnall Legacy</p>
            <h1 className="app-title__headline">League Operations Hub</h1>
          </div>
          <div className="app-topbar__actions">
            <PlayerSearch />
            <div className="app-pill app-pill--compact">
              <label htmlFor="seasonSelect" className="app-pill__label">
                League
              </label>
              <select
                id="seasonSelect"
                aria-label="League season"
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
            <button
              type="button"
              className={cn("app-hamburger md:hidden", isNavOpen && "is-open")}
              onClick={() => setNavOpen((open) => !open)}
              aria-expanded={isNavOpen}
              aria-controls="primary-navigation"
              aria-label={isNavOpen ? "Close navigation" : "Open navigation"}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
        <div className="app-statusbar">
          <div className="app-pill app-pill--wide">
            <div>
              <p className="app-pill__label">Sleeper Access</p>
              <p className="app-pill__value">
                {currentUser
                  ? `Logged in as @${currentUser.username}`
                  : "Log in to personalize the experience"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentUser ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-border text-xs text-foreground hover:bg-surface-alt"
                  onClick={() => {
                    setCurrentUser(null);
                    setCurrentUserState(null);
                  }}
                >
                  Log out
                </Button>
              ) : null}
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="app-icon-button"
                aria-label="Open Sleeper login"
                title="Log in with your Sleeper username (no password required)"
              >
                <img
                  src={`${import.meta.env.BASE_URL}sleeper-logo.svg`}
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
            <div
              id="primary-navigation"
              className={cn("app-nav__panel", isNavOpen && "is-open")}
            >
              <div className="app-nav__links">
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
          <Route path="/player/:name" element={<PlayerProfilePage />} />
          <Route path="/compare" element={<PlayerComparePage />} />
          <Route
            path="/user-log"
            element={
              <UserLogPortal
                canAccess={Boolean(canAccessLog)}
                adminUsername={adminUsername}
              />
            }
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
      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme={theme}
      />
    </div>
  );
}
