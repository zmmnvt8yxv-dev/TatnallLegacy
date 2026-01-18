#!/bin/bash
# Regenerate all public data for the site
# This script runs all the data generation steps in the correct order

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🔄 Regenerating all site data..."
echo ""

# Step 1: Build weekly chunks and season summaries
echo "📊 Step 1: Building weekly chunks and season summaries..."
python3 scripts/build_site_weekly_chunks.py

# Step 2: Build the manifest
echo ""
echo "📝 Step 2: Building manifest..."
python3 scripts/build_site_data_manifest.py

echo ""
echo "✅ All data regenerated successfully!"
echo ""
echo "Season week limits applied:"
echo "  - 2015-2020: Max week 16 (playoffs weeks 14-16)"
echo "  - 2021+: Max week 17 (playoffs weeks 15-17)"
