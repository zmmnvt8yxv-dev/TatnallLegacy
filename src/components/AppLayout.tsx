import { NavLink, Outlet } from "react-router-dom";
import { externalNavigation, navigationItems } from "../navigation";
import { ChampionBanner } from "./ChampionBanner";
import { Header } from "./Header";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `tab w-full justify-between text-left ${isActive ? "active" : ""}`.trim();

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `tab ${isActive ? "active" : ""}`.trim();

export function AppLayout() {
  return (
    <>
      <Header />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <aside className="hidden w-full max-w-xs flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft lg:flex">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Sections</p>
          <nav className="flex flex-col gap-2" aria-label="Sections">
            {navigationItems.map((item) => (
              <NavLink key={item.path} to={item.path} className={navLinkClass} end>
                <span>{item.label}</span>
                {item.liveDot ? <span id="liveDot" className="dot" aria-hidden="true" /> : null}
              </NavLink>
            ))}
            {externalNavigation.map((item) => (
              <a key={item.href} href={item.href} className="tab w-full justify-between text-left">
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="flex-1 space-y-6">
          <nav className="tabs flex flex-wrap gap-2 lg:hidden" aria-label="Sections">
            {navigationItems.map((item) => (
              <NavLink key={item.path} to={item.path} className={mobileNavLinkClass} end>
                {item.label}
                {item.liveDot ? <span id="liveDot-mobile" className="dot" aria-hidden="true" /> : null}
              </NavLink>
            ))}
            {externalNavigation.map((item) => (
              <a key={item.href} href={item.href} className="tab">
                {item.label}
              </a>
            ))}
          </nav>
          <ChampionBanner />
          <main className="space-y-6">
            <Outlet />
          </main>
          <footer className="border-t border-border bg-surface py-6">
            <div className="text-sm text-muted">
              Built from ESPN/Sleeper data. Static UI on GitHub Pages.
            </div>
          </footer>
        </div>
      </div>
      <noscript>
        <div className="panel mx-auto my-6 w-full max-w-4xl">Enable JavaScript to view league data.</div>
      </noscript>
    </>
  );
}
