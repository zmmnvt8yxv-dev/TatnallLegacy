# TatnallLegacy Architecture

## Purpose
TatnallLegacy is a Vite/React static site that serves as a fantasy football "League Encyclopedia." It aggregates league history (standings, matchups, transactions) and player statistics/metrics into a browsable site deployed on GitHub Pages.

## Core Rules / Constraints
- All fetch paths must respect `import.meta.env.BASE_URL` for GitHub Pages subpaths.
- Weekly league rule: regular season only, cap weeks to 1–18 in frontend aggregations.
- Owner/manager names must be normalized via `normalizeOwnerName()` (OWNER_ALIASES).
- Player display names should never show raw IDs; resolve to a name or fallback "(Unknown Player)".

## High-Level Data Flow
```mermaid
flowchart LR
  A[data_raw (datarepo)] --> B[scripts/build_*]
  C[data/*.json (league exports)] --> B
  B --> D[public/data/* + public/data/manifest.json]
  D --> E[src/data/loader.js]
  E --> F[Pages + components]
```

## Repository Layout (Key Paths)
- `src/`: React app (pages, components, data loaders, utilities).
- `public/data/`: Build outputs consumed by the app (manifest + JSON data).
- `data/`: Season league exports (matchups, teams, transactions).
- `data_raw/`: Raw datasets (player stats, metrics, ESPN/Sleeper pulls).
- `scripts/`: ETL/build scripts that generate `public/data`.
- `.github/workflows/pages.yml`: CI build/deploy for GitHub Pages.
- `vite.config.ts`: Base URL config for GitHub Pages subpath.

## Frontend Architecture
### App Shell + Routing
Routes are defined in `src/App.jsx`:
- `/` Summary: league snapshot, highlights, assistant, favorites.
- `/matchups` Matchups by season/week.
- `/matchups/:season/:week/:matchupId` Matchup detail.
- `/players/:playerId` Player profile.
- `/transactions` Trades/adds/drops with filters.
- `/standings` Season standings + all-time summary.

Page modules:
- `src/pages/SummaryPage.jsx`
- `src/pages/MatchupsPage.jsx`
- `src/pages/MatchupDetailPage.jsx`
- `src/pages/PlayerPage.jsx`
- `src/pages/TransactionsPage.jsx`
- `src/pages/StandingsPage.jsx`

Layout + global shell:
- `src/components/Layout.jsx`
- `src/components/ErrorBoundary.jsx`
- `src/components/LocalStatAssistant.jsx`
- `src/components/DeferredSection.jsx` (lazy section rendering)

### Runtime Data Loading
All fetches are manifest-driven and resolved against `import.meta.env.BASE_URL`:
- Loader: `src/data/loader.js`
- URL helper: `src/lib/url.js`
- Manifest: `public/data/manifest.json`

Loader resolves paths like:
- `data/season/{season}.json`
- `data/weekly/{season}/week-{week}.json`
- `data/transactions/{season}.json`
- `data/all_time.json`
- `data/player_stats/...`
- `data/player_metrics/...`

Loader hardening:
- `loadCoreData()` uses optional paths for `players`, `playerIds`, `teams` and returns empty arrays on missing inputs.
- `loadTransactions()` treats missing manifest paths as optional and returns `null` instead of throwing.

### Performance + UX Enhancements
- Sticky filter bars and table wrappers for mobile scrolling (`src/styles.css`).
- Lightweight virtualization for long tables: `src/utils/useVirtualRows.js`.
- Deferred section rendering on Summary: `src/components/DeferredSection.jsx`.
- Summary page loads heavy sections (all-time, metrics, boom/bust) only when visible.

### Personalization (Local-Only)
- Favorites stored in localStorage (`src/utils/useFavorites.js`).
- Persisted UI settings in localStorage (`src/utils/persistence.js`).
- Summary shows "Your Favorites" panel.
- Standings and Player pages include favorite toggles.

Local storage keys (examples):
- `tatnall-favorites.players`, `tatnall-favorites.teams`
- `tatnall-pref-matchups-season`, `tatnall-pref-matchups-week`
- `tatnall-pref-standings-season`
- `tatnall-pref-transactions-season`, `tatnall-pref-transactions-week`, `tatnall-pref-transactions-type`, `tatnall-pref-transactions-team`
- `tatnall-pref-player-season`, `tatnall-pref-player-tab`

### Analytics
- GA4 is wired via `src/utils/analytics.js`.
- `src/App.jsx` initializes analytics and emits page views on route changes.
- Measurement ID is injected in CI via `VITE_GA4_ID` in `.github/workflows/pages.yml`.

## Data Sources (Raw Inputs)
League/season exports:
- `data/{season}.json`: teams, matchups, standings, lineups, transactions (per season).

Sleeper/ESPN ingestion (raw):
- `scripts/pull_sleeper_transactions.py`
- `scripts/pull_espn_transactions.py`
- `scripts/pull_espn_lineups.py`
- Outputs under `data_raw/espn_transactions/` and `data_raw/espn_lineups/`.

Player master + metrics datasets:
- `data_raw/master/*.csv` and `data_raw/master/*.parquet`
- `data_raw/master/players_master_nflverse_espn_sleeper.csv`
- `data_raw/sleeper/players_flat.csv`

## Build Pipeline (Raw -> Public JSON)
The `npm run build:data` pipeline executes:
1. `scripts/verify_inputs.py`
   - Prints required/optional inputs present/missing.
   - Hard fails on missing required master datasets.
2. `scripts/build_site_weekly_chunks.py`
   - Builds `public/data/weekly/{season}/week-{week}.json`
   - Builds `public/data/transactions/{season}.json`
   - Builds `public/data/all_time.json`
   - Injects ESPN lineups when season exports lack lineups.
   - Maps ESPN IDs -> master -> Sleeper IDs for names/links.
3. `scripts/build_public_player_stats.py`
   - Builds `public/data/player_stats/weekly/{season}.json`
   - Builds `public/data/player_stats/season/{season}.json`
   - Builds `public/data/player_stats/career.json`
   - Adds availability fields based on games played.
4. `scripts/build_public_player_metrics.py`
   - Builds `public/data/player_metrics/*` (weekly/season/career/summary/boom_bust).
   - Normalizes schemas; skips optional outputs if columns are missing.
   - Adds consistency labels from boom/bust dispersion.
5. `scripts/build_site_data_manifest.py`
   - Builds `public/data/manifest.json` with paths and counts.
   - Includes only paths that exist on disk (minimal mode safe).
6. `scripts/validate_manifest.py`
   - Resolves every manifest path and asserts files exist.
7. `scripts/verify_player_integrity.py`
   - Cross-checks `players.json`/`player_ids.json` coverage.

## Page Data Dependencies (Source -> Consumer)
Summary (`src/pages/SummaryPage.jsx`)
- `loadSeasonSummary(season)` -> `public/data/season/{season}.json`
- `loadTransactions(season)` -> `public/data/transactions/{season}.json`
- `loadAllTime()` -> `public/data/all_time.json`
- `loadMetricsSummary()` -> `public/data/player_metrics/summary.json`
- `loadPlayerMetricsBoomBust()` -> `public/data/player_metrics/boom_bust.json`
- Heavy sections are deferred to avoid initial page cost.

Matchups (`src/pages/MatchupsPage.jsx`)
- `loadWeekData(season, week)` -> `public/data/weekly/{season}/week-{week}.json`

Matchup Detail (`src/pages/MatchupDetailPage.jsx`)
- Same weekly chunk + roster/lineup resolution.

Player Profile (`src/pages/PlayerPage.jsx`)
- Weekly logs: `public/data/player_stats/weekly/{season}.json`
- Season totals: `public/data/player_stats/season/{season}.json`
- Career totals: `public/data/player_stats/career.json`
- Metrics: `public/data/player_metrics/*`

Transactions (`src/pages/TransactionsPage.jsx`)
- `loadTransactions(season)` -> `public/data/transactions/{season}.json`
- Virtualized list rendering for large seasons.

Standings (`src/pages/StandingsPage.jsx`)
- `loadSeasonSummary(season)` -> `public/data/season/{season}.json`
- All-time summary aggregates by normalized owner name.

## Identity + Name Resolution
Owner normalization:
- `src/utils/owners.js` via `normalizeOwnerName()`
- Used in standings and other owner-facing labels.

Player identity:
- `src/lib/playerName.js` joins `players.json` + `player_ids.json`
- Supports Sleeper, ESPN, GSIS IDs, and name fallbacks.
- Join order: `sleeper_id` -> `gsis_id` -> `espn_id` -> `player_id` -> fallback string.

Canonical player IDs:
- UI routes use `/players/:playerId` and expect Sleeper IDs when available.
- Weekly lineups emit `player_id` as Sleeper when resolvable and include `source` and `source_player_id`.
- Transactions `entries[].players[]` include `id_type` and `source_player_id` where applicable.

## Deployment + Automation
GitHub Pages workflow (`.github/workflows/pages.yml`):
- Runs on push to `main`, every 4 hours, or manual trigger.
- Clones `datarepo` (if available) and copies `data_raw`.
- Runs `npm run build:data` when data is present; otherwise runs a minimal fallback.
- Builds with Vite and deploys `dist/` to Pages.
- Adds SPA fallback by copying `dist/index.html` to `dist/404.html`.
- Injects GA4 via `VITE_GA4_ID` env.

## Data Schemas (Public Outputs)
Schemas below reflect the current generated JSON shape in `public/data/`.

`public/data/manifest.json`
- `schemaVersion`, `generatedAt`
- `seasons`: number[]
- `weeksBySeason`: { [season]: number[] }
- `paths`: object with template paths (e.g. `seasonSummary`, `weeklyChunk`, `transactions`)
- `counts`: precomputed row counts per dataset

`public/data/players.json` (array)
- Core: `player_uid`, `full_name`, `position`, `nfl_team`, `dob`
- Optional/edge: `display_name`, `first_name`, `last_name`, `team`, `espn_id`, `gsis_id`, `sleeper_id`, `headshot_url`

`public/data/player_ids.json` (array)
- Core: `player_uid`, `id_type` (e.g. sleeper/espn/gsis), `id_value`
- Optional/edge: `source`, `confidence` (if upstream enrichments add these)

`public/data/teams.json` (array)
- Core: `team_key`, `platform`, `league_id`, `season`, `team_id`, `roster_id`, `owner_user_id`, `display_name`
- Optional/edge: `team_name`, `username`, `avatar`, `settings`

`public/data/season/{season}.json`
- `season`: number
- `teams[]`: `{ team_name, owner, record, points_for, points_against, regular_season_rank, final_rank }`
- Optional/edge: `owner_id`, `username`, `avatar`, `settings`
- `weeks[]`: number[]
- `standings[]`: `{ team, wins, losses, ties, points_for, points_against }`
- `playerSeasonTotals[]`: `{ player_id, points, games }` (optional)
- `totals`: `{ matchups, lineups }`

`public/data/weekly/{season}/week-{week}.json`
- `season`, `week`
- `matchups[]`: core `{ week, home_team, home_score, away_team, away_score }`
  - Optional/edge: `matchup_id`, `entries`, `home_roster_id`, `away_roster_id`, `home_owner_id`, `away_owner_id`, `is_playoff`
- `lineups[]`: core `{ week, team, points, started }`
  - Optional/edge: `player_id`, `player`, `source_player_id`, `source`, `position`, `nfl_team`, `opponent_team`

`public/data/transactions/{season}.json`
- `season`
- `entries[]`: `{ id, season, week, type, team, summary, created }`
  - Optional/edge: `trade_id`, `source`, `players[]`
  - `players[]`: `{ id, id_type, name, action }`
- `sources`: array of source file references

`public/data/all_time.json`
- `generatedAt`
- `topWeekly[]`: `{ player_id, player_name, team, season, week, points }`
- `topSeasons[]`: `{ season, player_id, points, games }`
- `careerLeaders[]`: `{ player_id, display_name, points, games, seasons }`

`public/data/player_stats/weekly/{season}.json`
- `season`
- `rows[]`: `{ season, week, display_name, position, team, points, war_rep, delta_to_next, pos_week_z, sleeper_id, gsis_id, player_id }`
- Optional/edge: `pos_week_percentile`, `fantasy_points_custom_week`, `fantasy_points_custom_week_with_bonus`, `starter`, `fantasy_team`

`public/data/player_stats/season/{season}.json`
- `season`
- `rows[]`: `{ season, display_name, position, team, games, fantasy_points_custom, fantasy_points_custom_pg, war_rep, war_rep_pg, delta_to_next, delta_to_next_pg, availability_ratio, availability_flag, games_possible, games_missed, sleeper_id, gsis_id, player_id }`

`public/data/player_stats/career.json`
- `rows[]`: `{ display_name, position, games, seasons, fantasy_points_custom, fantasy_points_custom_pg, war_rep, war_rep_pg, delta_to_next, delta_to_next_pg, sleeper_id, gsis_id, player_id }`

`public/data/player_stats/full/{season}.json` (optional)
- `season`
- `rows[]`: includes full stat breakdowns per game, commonly:
  `{ season, week, display_name, position, team, opponent_team, attempts, completions, passing_yards, passing_tds,
  passing_interceptions, carries, rushing_yards, rushing_tds, receptions, targets, receiving_yards, receiving_tds,
  fantasy_points_custom_week, fantasy_points_custom_week_with_bonus, pos_week_z, war_rep, delta_to_next,
  sleeper_id, gsis_id, player_id }` (only fields present in source are emitted)

`public/data/player_metrics/summary.json`
- `generatedAt`
- `topWeeklyWar[]` + `topWeeklyZ[]`: `{ season, week, display_name, position, team, points, war_rep, delta_to_next, replacement_baseline, pos_week_z, pos_week_percentile, sleeper_id, gsis_id, player_id }`
- `topSeasonWar[]`: `{ sleeper_id, season, display_name, position, team, games, points, points_pg, war_rep, war_rep_pg, delta_to_next, delta_to_next_pg }`

`public/data/player_metrics/career.json`
- `rows[]`: `{ sleeper_id, display_name, position, team, seasons, games, points, points_pg, war_rep, war_rep_pg, delta_to_next, delta_to_next_pg }`

`public/data/player_metrics/boom_bust.json`
- `rows[]`: `{ season, display_name, position, team, points, games, fp_std, boom_weeks, bust_weeks, boom_pct, bust_pct, gsis_id, consistency_label, consistency_score }`

Optional metrics outputs (if produced by build inputs):
- `public/data/player_metrics/weekly.json`
  - `rows[]`: `{ season, week, display_name, position, team, points, war_rep, delta_to_next, replacement_baseline,
    pos_week_z, pos_week_percentile, sleeper_id, gsis_id, player_id }`
- `public/data/player_metrics/season.json`
  - `rows[]`: `{ season, display_name, position, team, games, points, points_pg, war_rep, war_rep_pg,
    delta_to_next, delta_to_next_pg, sleeper_id, gsis_id, player_id }`

## Raw Input Schemas (Source Data)
`data/{season}.json` (league export)
- `season`, `teams[]`, `matchups[]`, `lineups[]`, `transactions[]`
- `teams[]`: `{ display_name, owner_id, roster_id, team_name, username, avatar, settings }`
- `matchups[]`: `{ week, matchup_id, home_team, away_team, home_score, away_score, home_roster_id, away_roster_id,
  home_owner_id, away_owner_id, entries }`
- `lineups[]`: `{ week, team, player_id, player, started, points }`
- `transactions[]`: `{ id, type, week, roster_id, adds, drops, created, status_updated, summary }`

`data/transactions-{season}.json` (Sleeper API)
- `season`, `league_id`, `transactions[]`
- `transactions[]`: `{ type, week, roster_ids, adds, drops, transaction_id, created, status_updated, metadata }`

`data/trades-{season}.json` (Sleeper trades snapshot)
- `year`, `league_id`, `teams`, `trades[]`
- `trades[]`: `{ id, week, created, status, parties[] }`
  - `parties[]`: `{ roster_id, team, gained_players[], sent_players[], gained_picks[], sent_picks[] }`

`data_raw/espn_transactions/transactions_{season}.json`
- `season`, `league_id`, `transactions[]`, `teams[]`, `members[]`
- `transactions[]`: `{ id, type, scoringPeriodId, proposedDate, status, items[] }`

`data_raw/espn_lineups/{season}/week-{week}.json`
- `season`, `week`, `lineups[]`
- `lineups[]`: `{ week, team, player_id, started, points }`

`data_raw/master/*.csv|*.parquet` (player stats/metrics)
- Weekly: `player_week_fantasy_2015_2025_with_war*`
- Season: `player_season_fantasy_2015_2025_with_war*`
- Career: `player_career_fantasy_2015_2025_with_war*`
- Metrics: `player_season_boom_bust_2015_2025*`, `player_week_fantasy_2015_2025_with_z*`

## Diagnostics / Safety Checks
- `verify_inputs.py`: reports required/optional input availability and fails fast on missing required datasets.
- `validate_manifest.py`: asserts all manifest paths resolve to files.
- `verify_player_integrity.py`: checks player ID coverage in exported datasets.
- ErrorBoundary logs `UI_RENDER_ERROR` for runtime crashes.
- DEV-only diagnostics panels exist on Transactions and data loaders.
