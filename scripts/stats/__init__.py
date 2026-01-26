"""
Unified Stats Management Module

This module provides functionality for loading, managing, and computing player
statistics from various sources (NFLverse, ESPN, etc.) into a unified stats database.

Key Components:
    - load_weekly_stats: Load weekly player stats with player_uid resolution
    - Stats database management and validation
"""

from pathlib import Path

# Module constants
STATS_DB_PATH = Path(__file__).parent.parent.parent / "db" / "stats.sqlite"
PLAYERS_DB_PATH = Path(__file__).parent.parent.parent / "db" / "players.sqlite"
