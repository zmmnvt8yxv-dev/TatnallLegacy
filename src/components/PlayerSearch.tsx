import { useMemo, useRef, useState, type FormEvent } from "react";
import { selectPlayerDirectory } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePlayerProfile } from "./PlayerProfileProvider";

const MAX_SUGGESTIONS = 8;

export function PlayerSearch() {
  const { openProfile } = usePlayerProfile();
  const { status, seasons } = useAllSeasonsData();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 200);

  const players = useMemo(() => {
    if (status !== "ready") {
      return [];
    }
    return selectPlayerDirectory(seasons);
  }, [seasons, status]);

  const matches = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return players
      .filter((player) => player.toLowerCase().includes(normalized))
      .slice(0, MAX_SUGGESTIONS);
  }, [debouncedQuery, players]);

  const handleSelect = (playerName: string) => {
    openProfile(playerName);
    setQuery(playerName);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const exactMatch = players.find((player) => player.toLowerCase() === normalized);
    const fallback = exactMatch ?? matches[0];
    if (fallback) {
      handleSelect(fallback);
    }
  };

  const disabled = status !== "ready";

  return (
    <form className="player-search" onSubmit={handleSubmit} role="search">
      <label htmlFor="playerSearch" className="sr-only">
        Search players
      </label>
      <div className="player-search__field">
        <input
          ref={inputRef}
          id="playerSearch"
          type="search"
          placeholder={disabled ? "Loading players…" : "Search players…"}
          aria-label="Search players"
          className="input player-search__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          disabled={disabled}
        />
        <button type="submit" className="btn player-search__button" disabled={disabled}>
          View
        </button>
      </div>
      {isOpen && !disabled ? (
        <div className="player-search__panel">
          {query.trim() && matches.length === 0 ? (
            <p className="player-search__empty">No matches found.</p>
          ) : (
            <ul className="player-search__list">
              {matches.map((player) => (
                <li key={player}>
                  <button
                    type="button"
                    className="player-search__item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(player)}
                  >
                    {player}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </form>
  );
}
