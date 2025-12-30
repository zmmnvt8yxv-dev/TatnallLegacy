import { NavLink, Route, Routes } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { PowerRankings } from '@/pages/PowerRankings';
import { Summary } from '@/pages/Summary';
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
          <Button className="w-full md:w-auto">Generate League Report</Button>
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
        </Routes>
      </main>
    </div>
  );
}

export default App;
