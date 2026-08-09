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

## Resolved: 2025 third place

- Resolution: Carl Marvin / 💍💍💍 finished third.
- Evidence: the completed Sleeper winners bracket marks roster 1 as the winner
  of the Week 17 third-place game over roster 6, 127.48–101.64.
- Result: 2025 placement analytics and the third-place matchup are canonical.

## Resolved: 2025 draft representation

- Resolution: the completed Sleeper auction draft is archived directly from its
  draft endpoint.
- Evidence: draft `1262548301656363008` contains 152 purchases across 19 roster
  rounds, with team, player, price, and team-at-draft metadata.
- Result: the full 2025 auction board is canonical and published in route-sized data.

## Resolved: 2025 matchups, lineups, and transactions

- Resolution: the completed Sleeper league snapshot is the canonical season source.
- Evidence: Weeks 1–17 provide 64 paired matchups, 136 team-week lineups with
  2,794 player entries, and 727 transaction attempts. The ledger distinguishes
  551 completed moves from 176 failed waiver attempts.
- Result: 2025 is included in all-time matchup records and head-to-head results;
  failed claims remain preserved without being displayed as completed moves.

## Resolved: 2026 Sleeper league ID

- Resolution: `1389343653058609152`.
- Evidence: the official Sleeper league response points back to the configured
  2025 league (`1262418074540195841`) through `previous_league_id`, and the
  configured Conner Malley Sleeper account belongs to exactly one matching 2026
  league.
- Result: live league metadata, users, rosters, drafts, brackets, matchups, and
  transactions can now refresh without a hard-coded ingestion year.
