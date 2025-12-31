import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

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
  const [currentUser, setCurrentUserState] = useState<SleeperUser | null>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { status, years, year, setYear, error } = useSeasonSelection();

  useEffect(() => {
    ensureGuestLog();
    setCurrentUserState(getCurrentUser());
    return subscribeToUserLog(() => {
      setCurrentUserState(getCurrentUser());
    });
  }, []);

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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              Tatnall Legacy
            </p>
            <h1 className="text-2xl font-semibold text-white">
              League Operations Hub
            </h1>
          </div>
          <div className="flex w-full flex-col gap-4 lg:w-auto lg:items-end">
            <div className="flex w-full flex-wrap items-center gap-3 lg:justify-end">
              <PlayerSearch />
              <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                <label htmlFor="seasonSelect" className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Season
                </label>
                <select
                  id="seasonSelect"
                  aria-label="Season"
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
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
                className="border-slate-700 text-slate-200 hover:bg-slate-900"
                onClick={toggleTheme}
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Sleeper Access
                </p>
                <p className="text-xs text-slate-200">
                  {currentUser
                    ? `Logged in as @${currentUser.username}`
                    : "Log in to access the user log"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950/60 hover:border-slate-500"
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
          <div className="border-t border-slate-800 bg-slate-950 px-6 py-2 text-xs text-red-400">
            Unable to load seasons: {error}
          </div>
        ) : null}
        <nav className="mx-auto w-full max-w-6xl px-6 pb-4">
          <div className="flex flex-wrap gap-2">
            {navigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <a
              href="trade.html"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800/70 hover:text-white"
            >
              Trade Analysis
            </a>
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
