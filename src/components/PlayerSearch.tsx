import Fuse from "fuse.js";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { normalizePlayerName, selectPlayerSearchIndex } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePlayerProfile } from "./PlayerProfileProvider";

const MAX_SUGGESTIONS = 8;

export function PlayerSearch() {
  const { openProfile } = usePlayerProfile();
  const { status, seasons, loadAllSeasons } = useAllSeasonsData();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 200);

  const normalizedQuery = useMemo(() => normalizePlayerName(debouncedQuery), [debouncedQuery]);

  const players = useMemo(() => {
    if (status !== "ready") {
      return [];
    }
    return selectPlayerSearchIndex(seasons);
  }, [seasons, status]);

  const fuse = useMemo(() => {
    if (!players.length) {
      return null;
    }
    return new Fuse(players, {
      keys: ["name", "team", "position", "normalized"],
      threshold: 0.35,
      ignoreLocation: true,
      includeMatches: true,
    });
  }, [players]);

  const matches = useMemo(() => {
    if (!normalizedQuery || !fuse) {
      return [];
    }
    return fuse
      .search(normalizedQuery)
      .slice(0, MAX_SUGGESTIONS);
  }, [fuse, normalizedQuery]);

  const highlightMatch = (name: string, indices?: [number, number][]) => {
    if (!indices || indices.length === 0) {
      return name;
    }
    const parts: Array<string | JSX.Element> = [];
    let lastIndex = 0;
    indices.forEach(([start, end], index) => {
      if (lastIndex < start) {
        parts.push(name.slice(lastIndex, start));
      }
      parts.push(
        <mark className="player-search__highlight" key={`${start}-${end}-${index}`}>
          {name.slice(start, end + 1)}
        </mark>,
      );
      lastIndex = end + 1;
    });
    if (lastIndex < name.length) {
      parts.push(name.slice(lastIndex));
    }
    return <>{parts}</>;
  };

  const formatHint = (position?: string, team?: string) => {
    const parts = [position, team].filter(Boolean);
    return parts.length ? parts.join(" · ") : "";
  };

  const handleSelect = (playerName: string) => {
    openProfile(playerName);
    setQuery(playerName);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedQuery) {
      return;
    }
    const exactMatch = players.find((player) => player.normalized === normalizedQuery);
    const fallback = exactMatch?.name ?? matches[0]?.item.name;
    if (fallback) {
      handleSelect(fallback);
    }
  };

  const disabled = status === "loading" || status === "error";
  const placeholder =
    status === "loading"
      ? "Loading players…"
      : status === "error"
        ? "Player data unavailable"
        : "Search players…";

  return (
    <form className="player-search" onSubmit={handleSubmit} role="search">
      <label htmlFor="playerSearch" className="sr-only">
        Search players
      </label>
      <div className="player-search__field">
        <div className="player-search__input-wrap">
          <span className="player-search__icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={inputRef}
            id="playerSearch"
            type="search"
            placeholder={placeholder}
            aria-label="Search players"
            className="input player-search__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              loadAllSeasons();
              setIsOpen(true);
            }}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            disabled={disabled}
          />
        </div>
        <button type="submit" className="btn player-search__button" disabled={disabled}>
          <span aria-hidden="true">➜</span>
          <span className="sr-only">View player profile</span>
        </button>
      </div>
      {isOpen && !disabled ? (
        <div className="player-search__panel">
          {query.trim() && matches.length === 0 ? (
            <p className="player-search__empty">No matches found.</p>
          ) : (
            <ul className="player-search__list">
              {matches.map((match) => {
                const player = match.item;
                const nameMatch = match.matches?.find((item) => item.key === "name");
                const recent = player.recentPerformance;
                return (
                  <li key={player.name}>
                  <button
                    type="button"
                    className="player-search__item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(player.name)}
                    aria-label={`View ${player.name}`}
                  >
                    <span className="player-search__item-name">
                      {highlightMatch(player.name, nameMatch?.indices)}
                    </span>
                    <span className="player-search__meta">
                      {formatHint(player.position, player.team) ? (
                        <span className="player-search__hint">
                          {formatHint(player.position, player.team)}
                        </span>
                      ) : null}
                      {recent ? (
                        <span className="player-search__stat">
                          W{recent.week} {recent.points.toFixed(1)} pts
                        </span>
                      ) : (
                        <span className="player-search__stat">No recent points</span>
                      )}
                      <span className="player-search__stat">
                        Consensus #{player.consensusRank ?? "—"}
                      </span>
                    </span>
                  </button>
                </li>
              );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </form>
  );
}
