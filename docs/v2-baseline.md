# Tatnall Legacy v2 baseline

Audit date: 2026-08-09
Baseline commit: `70ead8b400bcc7df3e9ef74c3a67da036f7d6ae1` (`main`)

## Executive baseline

Tatnall Legacy is a working React 19 + Vite 7 static application deployed under `/TatnallLegacy/` on GitHub Pages. The current site contains eleven seasons (2015–2025), extensive generated JSON, player metrics, historical pages, and a scheduled deployment. The frontend test suite and production build pass unchanged.

The main architectural risk is not the frontend framework. The repository currently contains overlapping data systems with different contracts:

1. the production `npm run build:data` JSON pipeline;
2. a broader YAML-configured SQLite/orchestrator pipeline that is not the Pages data source;
3. checked-in historical exports and public JSON;
4. a separate `zmmnvt8yxv-dev/datarepo` used by scheduled workflows.

The v2 work should consolidate these incrementally around canonical entities and audited corrections while preserving the existing Pages build.

## Application and routes

Routes are declared in `src/App.jsx`.

| Route | Page | Current data behavior |
| --- | --- | --- |
| `/` | Summary | Infers the active season with `max(manifest.seasons)`, loads that season and its transactions, loads all season summaries, and defers global metrics/history. |
| `/matchups` | Matchups | Loads one weekly chunk plus the selected season's full player-stat file. |
| `/matchups/:season/:week/:matchupId` | Matchup detail | Loads the weekly chunk plus the selected season's full player-stat file. |
| `/players/:playerId` | Player profile | Loads global career/metric files, all season summaries, all season player-stat summaries, selected-season metrics/stats/transactions/full stats, and every weekly chunk for the selected season. The page also contains an additional all-season weekly-stat fetch. |
| `/transactions` | Transactions | Loads one season transaction file. |
| `/standings` | Standings | Loads the selected season, every historical season summary, and all-time records. |
| `/teams` | Teams | Loads one season summary. |
| `/owners/:ownerId` | Owner profile | Loads every season summary, every season transaction file, and all-time records. |
| `/seasons` | Season | Loads one season summary, player-season stats, and transactions. Season selection is a query parameter; there is no `/seasons/:season` route yet. |
| `/records` | Records | Loads every season summary and all-time records, then derives records in the browser. |
| `/head-to-head` | Head-to-head | Loads every season summary and, after two owners are selected, every weekly chunk across all seasons. |
| `/data-health` | Data health | Loads `public/data/integrity_report.json` directly. |

Unknown routes redirect to `/`. There are no `/players`, `/owners`, or `/history` index routes.

## Frontend data layer

- `src/data/DataContext.tsx` globally loads the manifest plus `players`, `player_ids`, `teams`, ESPN names, and player search.
- `src/data/loader.ts` contains the manifest-aware fetch client and all domain loaders. It also maintains a second permanent in-memory cache in addition to React Query.
- `src/hooks/` provides domain-named React Query hooks, but owner, records, standings, head-to-head, and player hooks still fan out across most or all seasons.
- Zod schemas live in one `src/schemas/index.ts` file and validation is normally warning-only.
- Manifest paths correctly include the browser-relative `data/` prefix. The baseline validator incorrectly joined those paths under `public/data`, producing `public/data/data/...`; this foundation branch corrects it to resolve from `public/`.

## Data repositories and layouts

### Main repository

| Path | Baseline size | Role |
| --- | ---: | --- |
| `data/` | 6.3 MB | Checked-in league season exports and manual history. |
| `data_raw/` | empty after clone | Ignored raw/master datasets supplied externally. |
| `public/data/` | 231 MB | 284 tracked browser JSON files. |
| `db/tatnall_legacy.sqlite` | 1.3 MB | A separate SQLite experiment/current-era dataset. |
| `scripts/` | 1.3 MB | Production builders plus newer identity, league, validation, export, and orchestration modules. |

### External data repository

`zmmnvt8yxv-dev/datarepo` is shallow-cloned by `pages.yml`. A no-smudge audit checkout used about 186 MB and contained:

- ESPN lineups for 2015–2024;
- ESPN transactions for 2015–2024;
- ESPN athlete identity/index data;
- Sleeper transactions for 2025;
- prebuilt full player-stat JSON;
- seven CSV/Parquet paths managed with Git LFS.

It does not contain `data_raw/master`, even though `pages.yml` checks for that folder. Therefore the scheduled Pages workflow follows its fallback path (`build_site_weekly_chunks.py`) rather than the complete `npm run build:data` path.

## Build and validation baseline

| Command | Baseline result |
| --- | --- |
| `npm test -- --runInBand` | Pass: 7 suites, 82 tests. |
| `npm run build` | Pass. Main JS bundle is 1,104.99 KB (316.57 KB gzip), above Vite's 500 KB warning threshold. |
| `python3 scripts/verify_inputs.py` | Fail: required WAR weekly/season/career master inputs are absent from the cloned repositories. |
| `python3 scripts/validate_manifest.py` | Fail before this branch because of the double-`data/` path bug, despite targets being present. |
| `python3 scripts/verify_player_integrity.py` | Warning-only: 330,364 of 330,364 inspected stat rows are reported unmapped. |
| `python3 scripts/validate_outputs.py` | Pass, including its golden manual-history check. |
| `python3 scripts/pipeline/orchestrator.py --dry-run` | Reports success, but orders `verify_inputs` last and is not the production Pages pipeline. |

The initial `npm ci` also encountered a pre-existing ownership problem in the user's global npm cache. Installation succeeds without repository changes when npm is given a temporary cache.

## Season coverage in checked-in public outputs

`present` means rows exist; it does not yet assert semantic completeness.

| Season | Matchups | Published lineups | Published transactions | Draft in source | Champion source |
| --- | ---: | ---: | ---: | ---: | --- |
| 2015 | 65 | unavailable (0) | unavailable (0) | 136 rows | manual history |
| 2016 | 65 | unavailable (0) | unavailable (0) | 136 rows | manual history |
| 2017 | 65 | unavailable (0) | unavailable (0) | 136 rows | manual history |
| 2018 | 65 | 2,269 | 3,617 | 136 rows | manual history |
| 2019 | 65 | 2,287 | 1,205 | 136 rows | manual history |
| 2020 | 65 | 2,670 | 1,272 | 152 rows | manual history |
| 2021 | 69 | 2,745 | 834 | 152 rows | manual history |
| 2022 | 69 | partial (136) | 773 | 152 rows | corrected manual history |
| 2023 | 69 | 2,759 | 1,283 | 152 rows | manual history |
| 2024 | 69 | 2,773 | 1,280 | 152 rows | manual history |
| 2025 | 64 | 1,768 | 44 | nonstandard object (3 keys) | manual history |

Important coverage details:

- ESPN raw lineup pulls are empty for 2015–2017 and populated for 2018–2024.
- The external ESPN pull has 2,883 lineup rows for 2022, but `data/2022.json` has partial rows in every week. The builder only falls back to ESPN when a whole week is empty, leaving the checked-in public result at 136 rows.
- 2025 source lineups mark all 1,872 source rows as started, so bench/optimal-lineup analytics are not trustworthy from that export.
- Checked-in 2025 transaction output cites only `trades-2025.json`; the external Sleeper transaction pull contains 727 provider transactions.
- Public season outputs have no structured completeness/provenance envelope.

## Historical result handling

- `data/manual_league_history.json` is currently the authoritative champion/runner-up list used by `build_site_weekly_chunks.py`.
- The 2022 public summary names King of January as champion and King of December as runner-up.
- The same public file's raw-derived Week 17 bracket still names King of December as the championship winner, so the file is internally contradictory.
- King of January entered the playoffs as seed 5; King of December entered as seed 2.
- `build_site_weekly_chunks.py` also contains direct 2025 Kilt Bowl matchup injection. A general audited correction layer did not exist at baseline.

## Identity baseline

### Owners and franchises

- Owner aliases are hard-coded in `src/lib/identity.ts` and applied in the browser.
- Historical exports alternate among ESPN usernames, real names, Sleeper usernames, and team names.
- Owner and franchise are not separate canonical entities.
- The 2025 source contains stable Sleeper user IDs, while many earlier exports have only names/usernames. Ownership transitions require commissioner confirmation before franchise history is canonicalized.

### Players

- `public/data/player_registry.json` and `players.json` contain 19,959 records and use Sleeper IDs as canonical IDs when available.
- `public/data/player_ids.json` contains only 290 mappings, all of type `sleeper`.
- `player_search.json` contains 5,858 entries.
- The SQLite database contains 290 players and 290 player IDs, plus 2,958 lineup rows, 68 matchups, and 8 teams (2025/current-era scope).
- Player identity formats conflict: provider IDs are used by the public registry, `p_<hash>` values appear in SQLite/public mappings, and the newer Python schema expects 36-character UUIDs.
- A more capable multi-pass resolver exists under `scripts/identity/`, but it is not the source of the production `players.json` contract.

## Configuration and scoring baseline

The new league configuration reserves deterministic UUIDv5 team-season IDs. The
key contains platform, platform league ID, season, and platform team ID, so future
normalization can reproduce correction targets without relying on display names.

League constants are duplicated in:

- `build.config.yaml` (template IDs, current season 2025);
- `build_config.json` (real 2025 Sleeper ID);
- `scripts/ingest/refresh_all.sh` and `refresh_datarepo.sh`;
- the external datarepo workflow;
- legacy root `app.js`.

The checked-in scoring definitions disagree. `build.config.yaml` declares PPR, -2 passing interceptions, and three-point yardage bonuses, while active player scripts use half-PPR, -1 passing interceptions, two/four-point yardage bonuses, and additional kicker/long-touchdown logic. No `scoring.yml` should be declared authoritative until the commissioner confirms the league rules and effective seasons.

## Public data performance baseline

- 45 public JSON files exceed 500 KB.
- 21 public JSON files exceed 2 MB.
- Eleven `player_stats/full/{season}.json` files are approximately 13–15 MB each.
- `player_registry.json` is about 8.5 MB, `player_metrics/boom_bust.json` about 7.9 MB, and `players.json` about 6.6 MB.
- Opening a player, matchup, owner, records, standings, or head-to-head route can consequently trigger broad multi-season downloads.

## Security finding

A 384-byte root `cookies.txt` was tracked in Git. Its contents were not inspected or printed. This foundation branch removes the file from the current tree and ignores it going forward. Because it remains in prior Git history, the associated ESPN session should be rotated and history cleanup considered separately.

## Compatibility constraints for v2

- Preserve React/Vite, GitHub Pages, `import.meta.env.BASE_URL`, existing routes, and manifest v2 until consumers migrate.
- Preserve `data/{season}.json`, `data/manual_league_history.json`, and current public outputs as migration inputs.
- Do not treat empty historical lineup/transaction arrays as zero activity.
- Do not use `max(manifest.seasons)` or nonempty weekly chunks as the future active-season/phase signal.
- Do not activate the dormant SQLite/orchestrator pipeline wholesale; first reconcile its UID/schema/config contracts with production.
- Do not change scoring until `docs/data-questions.md` is resolved.

## Recommended next sequence

1. Land explicit league configuration and the audited 2022 correction engine/regression fixture.
2. Define canonical owner, franchise, team-season, season, and matchup schemas with one UID strategy.
3. Normalize 2015–2025 into those tables, apply corrections, and generate a champion/runner-up/seed verification report.
4. Make Sleeper ingestion season-aware and resolve the 2026 league through Sleeper's league chain.
5. Only then publish manifest v3 and migrate frontend consumers incrementally.
