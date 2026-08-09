# Tatnall Legacy v2 progress

Updated: 2026-08-09

This document records the implemented v2 foundation after the repository
baseline in `docs/v2-baseline.md`.

## Completed phases

### Canonical configuration and corrections

- Central league configuration with the resolved 2026 Sleeper league ID.
- Explicit owner aliases and eight stable franchise slots.
- Verified Sleeper-era scoring settings for 2025-present.
- Audited 2022 champion, runner-up, seed, and matchup-result corrections.
- Explicit Lamar Jackson QB/CB identity overrides.

### Canonical history and identity

- 11 completed seasons, 88 team-seasons, 710 two-team matchups, and 118
  postseason games normalized to Parquet.
- Exactly one accepted champion and runner-up per completed season.
- 13 stable owner identities and 8 stable franchise identities.
- 20,068 canonical players and 36,254 safe provider-ID mappings.
- 88 ambiguous historical provider IDs quarantined instead of guessed.
- 2022 regression tests permanently preserve King of January / Conner Malley as
  champion from seed 5 over King of December from seed 2.

### Current Sleeper ingestion

- Current league resolved as `1389343653058609152` by validating its relationship
  to the configured 2025 league.
- Reusable public read-only Sleeper client with retries.
- Refreshable state, league, users, rosters, drafts, traded picks, brackets,
  weekly matchups, weekly transactions, and active fantasy-player snapshots.
- Explicit 2026 preseason/current-week metadata.

### Manifest v3 and public datasets

- Explicit current-season metadata instead of `max(manifest.seasons)`.
- Route-sized current, history, season, owner, record, player, search, and
  integrity resources.
- Precomputed owner careers and head-to-head ledgers.
- Generated records with source context.
- Matchup records and head-to-head results exclude the partial 2022 and 2025
  matchup exports.
- Public files expose update timestamps, coverage, corrections, and identity
  warnings.

### Frontend migration

- New phase-aware preseason home page.
- New history ledger and `/seasons/:season` yearbooks.
- New owner directory and precomputed career/rivalry profiles.
- New generated record book.
- New compact active-player directory and canonical search.
- New data-health experience.
- Legacy matchup, standings, transaction, head-to-head, and player-detail routes
  remain available during migration and load their larger compatibility datasets
  only when visited.
- Root-relative favicon reference and browser startup configuration defects fixed.

## Verification

- Frontend: 7 suites / 82 tests pass.
- Python: 23 tests pass.
- Canonical output validation passes.
- Manifest v2 and v3 validation pass.
- Production Vite build passes.
- Browser QA passes for the home page, history, 2022 yearbook, owner career,
  records, player search/profile, data health, and legacy matchup route.

## Known limitations and next work

- Historical ESPN scoring settings remain unverified, so historical custom NFL
  fantasy points are not recomputed.
- 2015–2017 lineups and transactions are unavailable.
- 2022 and 2025 matchup exports are partial; they remain viewable as evidence but
  are excluded from all-time matchup records and H2H results.
- 2025 third place is unresolved.
- Current power rankings and playoff odds wait for regular-season games and a
  verified tiebreaker/playoff-rules configuration.
- Player profiles still use the legacy detail datasets; the directory/search and
  identity path are migrated, but player-centric career files are the next
  performance phase.
- The JavaScript bundle still exceeds Vite's 500 KB advisory threshold. Route
  code splitting is the next frontend performance improvement.
