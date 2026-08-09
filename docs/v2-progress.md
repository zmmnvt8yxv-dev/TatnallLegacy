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
- Final 2025 Sleeper facts normalized as 136 team-week lineups, 2,794 lineup
  entries, 727 transaction attempts / 551 completed moves, and 152 auction buys.
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
- Refreshable state, league, users, rosters, keepers, drafts, draft picks, traded picks, brackets,
  weekly matchups, weekly transactions, and active fantasy-player snapshots.
- Explicit 2026 preseason/current-week metadata.

### Manifest v3 and public datasets

- Explicit current-season metadata instead of `max(manifest.seasons)`.
- Route-sized current, history, season, owner, record, player, search, and
  integrity resources.
- Precomputed owner careers and head-to-head ledgers.
- Generated records with source context.
- Matchup records and head-to-head results exclude only the partial 2022
  matchup export; finalized 2025 matchups are included.
- Public files expose update timestamps, coverage, corrections, and identity
  warnings.

### Frontend migration

- New phase-aware preseason home page.
- New history ledger and `/seasons/:season` yearbooks.
- New owner directory and precomputed career/rivalry profiles.
- New generated record book.
- New compact active-player directory and canonical search.
- New data-health experience.
- Finalized 2025 lineup viewer, complete-move ledger, and full auction board.
- Live 2026 keeper board and scheduled auction runway with an explicit
  not-yet-published draft-order state.
- Legacy matchup, standings, transaction, head-to-head, and player-detail routes
  remain available during migration and load their larger compatibility datasets
  only when visited.
- Root-relative favicon reference and browser startup configuration defects fixed.

## Verification

- Frontend: 7 suites / 82 tests pass.
- Python: 26 tests pass.
- Canonical output validation passes.
- Manifest v2 and v3 validation pass.
- Production Vite build passes.
- Browser QA passes for the home page, history, 2022 yearbook, owner career,
  records, player search/profile, data health, and legacy matchup route.

## Known limitations and next work

- Historical ESPN scoring settings remain unverified, so historical custom NFL
  fantasy points are not recomputed.
- 2015–2017 lineups and transactions are unavailable.
- The 2022 matchup export is partial; it remains viewable as evidence but is
  excluded from all-time matchup records and H2H results.
- Current power rankings and playoff odds wait for regular-season games and a
  verified tiebreaker/playoff-rules configuration.
- Player profiles still use the legacy detail datasets; the directory/search and
  identity path are migrated, but player-centric career files are the next
  performance phase.
- The 2025 fact archive is route- and week-chunked; every new v3 fact resource
  and production JavaScript chunk remains below 500 KB. Some compatibility-era
  player resources remain larger while their consumers are migrated.
