import type { ChangeEvent } from "react";
import { useCallback } from "react";

const navItems = [
  { href: "#summary", label: "Summary" },
  { href: "#teams", label: "Teams" },
  { href: "#matchups", label: "Matchups" },
  { href: "#transactions", label: "Transactions" },
  { href: "#draft", label: "Draft" },
  { href: "#members", label: "Members" },
  { href: "#mostDrafted", label: "Most Drafted" },
  { href: "#live", label: "Live", liveDot: true },
  { href: "trade.html", label: "Trade Analysis", external: true }
];

export function Header() {
  const handleNavChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    if (event.target.value) {
      window.location.href = event.target.value;
    }
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tatnall League Legacy</h1>
          <p className="text-sm text-muted">Historical league data, standings, and live insights.</p>
        </div>

        <nav className="tabs hidden flex-wrap gap-2 lg:flex" aria-label="Sections">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="tab"
              data-target={item.href.startsWith("#") ? item.href : undefined}
              data-external={item.external ? "true" : undefined}
            >
              {item.label}
              {item.liveDot ? <span id="liveDot" className="dot" aria-hidden="true" /> : null}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            id="navDropdown"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground lg:hidden"
            onChange={handleNavChange}
            aria-label="Navigate"
            defaultValue=""
          >
            <option value="">Navigate…</option>
            {navItems.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="controls flex items-center gap-2">
            <label htmlFor="seasonSelect" className="text-sm text-muted">
              Season:
            </label>
            <select
              id="seasonSelect"
              aria-label="Season"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
