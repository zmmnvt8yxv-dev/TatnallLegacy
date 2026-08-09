# Data questions

These questions must be resolved from league rules or commissioner knowledge. The pipeline must not guess.

## Historical ESPN scoring rules and eras

- Affected records: all NFL/fantasy player statistics and derived WAR/Z-score/boom-bust metrics.
- Evidence: `build.config.yaml` declares full PPR, -2 passing interceptions, and three-point yardage bonuses. Active scoring scripts use half-PPR, -1 passing interceptions, two/four-point yardage bonuses, plus separate kicker and long-touchdown rules.
- Possible interpretations: the YAML is a template; the scripts encode the actual league; or scoring changed by season.
- Current resolution: Sleeper's official league settings are preserved in
  `data/config/scoring.yml` for 2025-present. The 2025 and 2026 settings match.
- Blocks: ESPN-era NFL-stat reconciliation, historical WAR baselines, and
  historical player-value analytics that require recomputing custom points.

## Historical owner and franchise continuity

- Affected seasons: especially 2018–2020, 2022–2023, and the ESPN-to-Sleeper transition in 2025.
- Evidence: historical slots/users change among Max Hardin, Jalen Del Rosario, Jackie Sheehy, Matt Maloy, Brendan Hanrahan, Samuel Kirby, and others. Team names also change every season.
- Possible interpretations: a franchise followed a real owner; a league slot transferred to a new owner; or some exported username/name pairs are aliases for the same person.
- Current resolution: every known owner and alias has an explicit stable
  `owner_uid`; the eight platform slots have stable `franchise_uid` values. The
  mappings are sufficient for canonical owner careers and head-to-head results.
- Still open: confirm whether league members consider a transferred platform
  slot to be the same named franchise for narrative franchise-history features.

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

## Resolved: 2026 Sleeper league ID

- Resolution: `1389343653058609152`.
- Evidence: the official Sleeper league response points back to the configured
  2025 league (`1262418074540195841`) through `previous_league_id`, and the
  configured Conner Malley Sleeper account belongs to exactly one matching 2026
  league.
- Result: live league metadata, users, rosters, drafts, brackets, matchups, and
  transactions can now refresh without a hard-coded ingestion year.
