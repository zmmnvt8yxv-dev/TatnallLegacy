#!/bin/zsh
# Unified data ingestion script for TatnallLegacy
# Pulls fresh data from ESPN and Sleeper APIs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."
COOKIE_FILE="${HOME}/.config/tatnall_espn_cookie.txt"

cd "${REPO_ROOT}"

echo "🔄 Starting data ingestion..."

# Check for ESPN cookie (required for private league data)
if [[ ! -f "${COOKIE_FILE}" ]]; then
  echo "⚠️  Missing ESPN cookie file: ${COOKIE_FILE}"
  echo "   ESPN historical data will not be refreshed."
  HAS_ESPN_COOKIE=0
else
  HAS_ESPN_COOKIE=1
fi

# --- ESPN Data (2015-2024 historical) ---
if [[ "${HAS_ESPN_COOKIE}" -eq 1 ]]; then
  echo ""
  echo "📊 Pulling ESPN transactions (2015-2024)..."
  ESPN_LEAGUE_ID=1773893 \
  START_SEASON=2015 \
  END_SEASON=2024 \
  MIN_NONEMPTY_SEASON=2020 \
  ESPN_COOKIE_FILE="${COOKIE_FILE}" \
  ESPN_COOKIE_PASSTHROUGH=1 \
  python3 scripts/ingest/pull_espn_transactions.py

  echo ""
  echo "📊 Pulling ESPN lineups (2015-2024)..."
  ESPN_LEAGUE_ID=1773893 \
  START_SEASON=2015 \
  END_SEASON=2024 \
  ESPN_COOKIE_FILE="${COOKIE_FILE}" \
  ESPN_COOKIE_PASSTHROUGH=1 \
  python3 scripts/ingest/pull_espn_lineups.py
fi

# --- Sleeper Data (2025+) ---
echo ""
echo "📊 Pulling Sleeper transactions (2025)..."
SLEEPER_LEAGUE_ID=1262418074540195841 \
SEASON=2025 \
MAX_ROUND=18 \
python3 scripts/ingest/pull_sleeper_transactions.py

echo ""
echo "✅ Data ingestion complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run build:data' to regenerate site data"
echo "  2. Run 'npm run build:data:full' for full pipeline with validation"
