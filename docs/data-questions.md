# Data questions

These questions must be resolved from league rules or commissioner knowledge. The pipeline must not guess.

## Scoring rules and eras

- Affected records: all NFL/fantasy player statistics and derived WAR/Z-score/boom-bust metrics.
- Evidence: `build.config.yaml` declares full PPR, -2 passing interceptions, and three-point yardage bonuses. Active scoring scripts use half-PPR, -1 passing interceptions, two/four-point yardage bonuses, plus separate kicker and long-touchdown rules.
- Possible interpretations: the YAML is a template; the scripts encode the actual league; or scoring changed by season.
- Blocks: authoritative `data/config/scoring.yml`, NFL-stat reconciliation, WAR baselines, and all player-value analytics.

## Owner and franchise continuity

- Affected seasons: especially 2018–2020, 2022–2023, and the ESPN-to-Sleeper transition in 2025.
- Evidence: historical slots/users change among Max Hardin, Jalen Del Rosario, Jackie Sheehy, Matt Maloy, Brendan Hanrahan, Samuel Kirby, and others. Team names also change every season.
- Possible interpretations: a franchise followed a real owner; a league slot transferred to a new owner; or some exported username/name pairs are aliases for the same person.
- Blocks: canonical `owner_uid`, `franchise_uid`, franchise history, owner career totals, and head-to-head analytics.

## 2025 third place

- Affected record: 2025 final placement.
- Evidence: `data/manual_league_history.json` records `third_place: "Unknown"`.
- Possible interpretations: a third-place game was played, placement came from the bracket, or the league does not recognize third place for 2025.
- Blocks: complete 2025 season result validation and placement analytics; it does not block champion/runner-up history.

## 2025 draft representation

- Affected record: 2025 draft history.
- Evidence: ESPN-era exports contain 136/152 draft rows, while `data/2025.json` stores a three-key draft object rather than a comparable pick list.
- Possible interpretations: picks are nested in the object, must be fetched from Sleeper's draft endpoints, or were never archived.
- Blocks: canonical 2025 draft picks, keeper history, and draft ROI.

## 2026 Sleeper league ID

- Affected record: active 2026 league ingestion.
- Evidence: only the 2025 league ID (`1262418074540195841`) is currently recorded. Sleeper league IDs are season-specific.
- Possible interpretations: resolve the next league through Sleeper's league relationship, or enter a commissioner-provided 2026 ID.
- Blocks: live 2026 rosters, transactions, matchups, drafts, brackets, week, and season phase. The new league config explicitly leaves this ID null rather than reusing 2025.
