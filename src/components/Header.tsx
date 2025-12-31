import { PageHeader } from "./PageHeader";
import { useTheme } from "./ThemeProvider";
import { useSeasonSelection } from "../hooks/useSeasonSelection";
import { PlayerSearch } from "./PlayerSearch";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { status, years, year, setYear, error } = useSeasonSelection();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <PageHeader
          title="Tatnall League Legacy"
          subtitle="Historical league data, standings, and live insights."
        />
        <div className="flex flex-wrap items-center gap-3">
          <PlayerSearch />
          <div className="controls flex items-center gap-2">
            <label htmlFor="seasonSelect" className="text-sm text-muted">
              Season:
            </label>
            <select
              id="seasonSelect"
              aria-label="Season"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              disabled={status !== "ready"}
              value={year ?? ""}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {status === "loading" && <option value="">Loading seasons…</option>}
              {status === "error" && <option value="">Season load failed</option>}
              {status === "ready" &&
                years.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            className="btn"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </div>
      {status === "error" ? (
        <div className="border-t border-border bg-surface px-4 py-2 text-xs text-red-400">
          Unable to load seasons: {error}
        </div>
      ) : null}
    </header>
  );
}
