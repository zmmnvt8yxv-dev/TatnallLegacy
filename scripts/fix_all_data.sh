#!/bin/bash
set -e

echo "🚀 Starting Data Integrity Fix Pipeline (Comprehensive Build)..."

# --- STEP 1: FETCH SOURCES ---
echo "📥 1a. Fetching Sleeper players..."
python3 scripts/pull_sleeper_players.py

echo "🏈 1b. Fetching nflverse players..."
python3 scripts/pull_nflverse_players.py

echo "🏈 1c. Fetching ESPN athlete index..."
python3 scripts/pull_espn_athletes_index.py

echo "📊 1d. Fetching nflverse stats (2015-2025)..."
python3 scripts/pull_nflverse_stats.py --seasons 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025

# --- STEP 2: ID RESOLUTION ---
echo "📦 2a. Building consolidated ESPN athlete list..."
python3 scripts/build_espn_all.py

echo "🔗 2b. Updating ESPN-Sleeper mappings..."
python3 scripts/match_espn_to_sleeper.py

echo "🔑 2c. Rebuilding Master Player Index..."
python3 scripts/build_players_master_nflverse_espn_sleeper.py

# --- STEP 3: STATS PROCESSING ---
echo "🖇️ 3a. Joining Stats to Master Index..."
python3 scripts/join_player_stats_to_master_2015_2025.py

echo "📈 3b. Building Efficiency Metrics..."
python3 scripts/build_season_and_career_efficiency.py

# --- STEP 4: FANTASY & METRICS ---
echo "✨ 4a. Building Weekly Fantasy Points (Base + Performance Bonuses)..."
python3 scripts/build_player_week_fantasy_custom.py

echo "🎁 4b. Calculating Touchdown Bonuses..."
python3 scripts/build_player_week_td_bonus.py

echo "➕ 4b(ii). Applying Bonuses to Weekly Fantasy..."
python3 scripts/apply_td_bonus_to_weekly_fantasy.py

echo "📊 4c. Calculating Z-Scores..."
python3 scripts/build_weekly_position_zscores.py

echo "⚔️ 4d. Calculating WAR & Marginal Stats..."
python3 scripts/build_player_week_war_and_marginal.py

echo "📜 4e. Aggregating Season & Career Totals..."
python3 scripts/build_season_and_career_fantasy_from_weekly.py

# --- STEP 5: SITE GENERATION ---
echo "🏗️ 5. Rebuilding Site Data..."
python3 scripts/verify_inputs.py
python3 scripts/build_site_weekly_chunks.py
python3 scripts/build_public_player_stats.py
python3 scripts/build_public_player_metrics.py
python3 scripts/build_site_data_manifest.py
python3 scripts/validate_manifest.py
python3 scripts/verify_player_integrity.py

# --- STEP 6: VERIFICATION ---
echo "🔍 6. Running final audit..."
python3 scripts/audit_data_integrity.py

echo "✅ COMPLETE! Data should be crystal perfect."
