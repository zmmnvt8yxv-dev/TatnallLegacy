import { useMemo, useRef, useState, type FormEvent } from "react";
import { normalizePlayerName, selectPlayerSearchIndex } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePlayerProfile } from "./PlayerProfileProvider";

const MAX_SUGGESTIONS = 8;

type PlayerMatch = {
  item: ReturnType<typeof selectPlayerSearchIndex>[number];
  indices?: [number, number][];
  score: number;
};

const mergeIndices = (indices: [number, number][]) => {
  if (indices.length <= 1) {
    return indices;
  }
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }
  return merged;
};

const findMatchIndices = (name: string, terms: string[]) => {
  if (terms.length === 0) {
    return [];
  }
  const normalizedName = name.toLowerCase();
  const indices: [number, number][] = [];
  terms.forEach((term) => {
    const cleaned = term.trim().toLowerCase();
    if (!cleaned) {
      return;
    }
    const start = normalizedName.indexOf(cleaned);
    if (start >= 0) {
      indices.push([start, start + cleaned.length - 1]);
    }
  });
  return mergeIndices(indices);
};

export function PlayerSearch() {
  const { openProfile } = usePlayerProfile();
  const { status, seasons, loadAllSeasons } = useAllSeasonsData();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 200);
  const queryTerms = useMemo(
    () => debouncedQuery.trim().split(/\s+/).filter(Boolean),
    [debouncedQuery],
  );

  const normalizedQuery = useMemo(() => normalizePlayerName(debouncedQuery), [debouncedQuery]);

  const players = useMemo(() => {
    if (status !== "ready") {
      return [];
    }
    return selectPlayerSearchIndex(seasons);
  }, [seasons, status]);

  const matches = useMemo(() => {
    if (!normalizedQuery || players.length === 0) {
      return [];
    }
    const normalizedParts = normalizedQuery.split(" ").filter(Boolean);
    const results: PlayerMatch[] = [];
    players.forEach((player) => {
      const normalizedName = player.normalized;
      if (!normalizedName) {
        return;
      }
      const matchesAll = normalizedParts.every((part) => normalizedName.includes(part));
      if (!matchesAll) {
        return;
      }
      let score = normalizedParts.reduce((total, part) => total + normalizedName.indexOf(part), 0);
      if (normalizedName === normalizedQuery) {
        score -= 10;
      } else if (normalizedName.startsWith(normalizedQuery)) {
        score -= 5;
      }
      if (player.team && normalizePlayerName(player.team).includes(normalizedQuery)) {
        score -= 1;
      }
      if (player.position && player.position.toLowerCase().startsWith(normalizedQuery)) {
        score -= 0.5;
      }
      results.push({
        item: player,
        indices: findMatchIndices(player.name, queryTerms),
        score,
      });
    });
    return results
      .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.item.name.localeCompare(b.item.name)))
      .slice(0, MAX_SUGGESTIONS);
  }, [normalizedQuery, players, queryTerms]);

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
                        {highlightMatch(player.name, match.indices)}
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
