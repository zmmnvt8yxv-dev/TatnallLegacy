import { useMemo, useRef, useState, type FormEvent } from "react";
import { normalizePlayerName, selectPlayerDirectory } from "../data/selectors";
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

  const normalizedQuery = useMemo(() => normalizePlayerName(debouncedQuery), [debouncedQuery]);

  const players = useMemo(() => {
    if (status !== "ready") {
      return [];
    }
    return selectPlayerDirectory(seasons);
  }, [seasons, status]);

  const playerIndex = useMemo(
    () =>
      players.map((player) => ({
        name: player,
        normalized: normalizePlayerName(player),
      })),
    [players],
  );

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("");

  const isSubsequence = (needle: string, haystack: string) => {
    if (!needle) return false;
    let needleIndex = 0;
    for (const char of haystack) {
      if (char === needle[needleIndex]) {
        needleIndex += 1;
      }
      if (needleIndex >= needle.length) {
        return true;
      }
    }
    return false;
  };

  const getMatchScore = (queryValue: string, targetValue: string) => {
    if (!queryValue) return 0;
    if (targetValue.includes(queryValue)) return 3;
    if (getInitials(targetValue).startsWith(queryValue)) return 2;
    if (isSubsequence(queryValue, targetValue)) return 1;
    return 0;
  };

  const matches = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }
    return playerIndex
      .map((entry) => ({
        name: entry.name,
        score: getMatchScore(normalizedQuery, entry.normalized),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, MAX_SUGGESTIONS);
  }, [normalizedQuery, playerIndex]);

  const highlightMatch = (name: string) => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      return name;
    }
    const lowerName = name.toLowerCase();
    const lowerQuery = trimmed.toLowerCase();
    const startIndex = lowerName.indexOf(lowerQuery);
    if (startIndex === -1) {
      return name;
    }
    const endIndex = startIndex + lowerQuery.length;
    return (
      <>
        {name.slice(0, startIndex)}
        <mark className="player-search__highlight">{name.slice(startIndex, endIndex)}</mark>
        {name.slice(endIndex)}
      </>
    );
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
    const exactMatch = playerIndex.find((player) => player.normalized === normalizedQuery);
    const fallback = exactMatch?.name ?? matches[0]?.name;
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
                <li key={player.name}>
                  <button
                    type="button"
                    className="player-search__item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(player.name)}
                  >
                    {highlightMatch(player.name)}
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
