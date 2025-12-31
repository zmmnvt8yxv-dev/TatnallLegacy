import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { SleeperLoginModal } from '@/components/SleeperLoginPanel';
import { cn } from '@/lib/utils';
import {
  ensureGuestLog,
  getCurrentUser,
  subscribeToUserLog,
  type SleeperUser
} from '@/lib/userLog';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { PowerRankings } from '@/pages/PowerRankings';
import { Summary } from '@/pages/Summary';
import { UserLogPortal } from '@/pages/UserLogPortal';
import { WeeklyRecaps } from '@/pages/WeeklyRecaps';

const navigation = [
  { label: 'Summary', path: '/' },
  { label: 'Teams', path: '/teams' },
  { label: 'Matchups', path: '/matchups' },
  { label: 'Draft', path: '/draft' },
  { label: 'Transactions', path: '/transactions' },
  { label: 'Rankings', path: '/rankings' },
  { label: 'Recaps', path: '/recaps' },
  { label: 'Live', path: '/live' }
];

function App() {
  const [isLoginOpen, setLoginOpen] = useState(false);
  const [currentUser, setCurrentUserState] = useState<SleeperUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    ensureGuestLog();
    setCurrentUserState(getCurrentUser());
    return subscribeToUserLog(() => {
      setCurrentUserState(getCurrentUser());
    });
  }, []);

  const handleLoginSuccess = (user: SleeperUser) => {
    setCurrentUserState(user);
    if (user.username === 'conner27lax') {
      navigate('/user-log');
      return;
    }
    navigate('/');
  };

  const canAccessLog = currentUser?.username === 'conner27lax';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              Tatnall Legacy
            </p>
            <h1 className="text-2xl font-semibold text-white">
              League Operations Hub
            </h1>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
            <Button className="w-full md:w-auto">Generate League Report</Button>
            <div className="flex items-center justify-between gap-3 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 md:justify-end">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Sleeper Access
                </p>
                <p className="text-xs text-slate-200">
                  {currentUser
                    ? `Logged in as @${currentUser.username}`
                    : 'Log in to access the user log'}
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
        <nav className="mx-auto w-full max-w-6xl px-6 pb-4">
          <div className="flex flex-wrap gap-2">
            {navigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route
            path="/teams"
            element={
              <PlaceholderPage
                title="Teams"
                description="Roster overviews, contract status, and scouting summaries."
              />
            }
          />
          <Route
            path="/matchups"
            element={
              <PlaceholderPage
                title="Matchups"
                description="Weekly head-to-head projections, win probabilities, and trends."
              />
            }
          />
          <Route
            path="/draft"
            element={
              <PlaceholderPage
                title="Draft"
                description="Pick-by-pick draft board, needs tracking, and historical comps."
              />
            }
          />
          <Route
            path="/transactions"
            element={
              <PlaceholderPage
                title="Transactions"
                description="Trade proposals, waiver history, and free-agent analysis."
              />
            }
          />
          <Route
            path="/rankings"
            element={<PowerRankings />}
          />
          <Route
            path="/recaps"
            element={<WeeklyRecaps />}
          />
          <Route
            path="/live"
            element={
              <PlaceholderPage
                title="Live"
                description="Real-time scoreboard monitoring and in-progress alerts."
              />
            }
          />
          <Route
            path="/user-log"
            element={<UserLogPortal canAccess={Boolean(canAccessLog)} />}
          />
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

export default App;
