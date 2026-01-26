"""
Advanced Metrics Engine Module

This module provides centralized calculation of fantasy football metrics including:
    - WAR (Wins Above Replacement)
    - Position Z-scores (weekly and season)
    - Boom/bust classification
    - Consistency scores
    - Opponent-adjusted metrics
    - Availability/durability scores

Key Components:
    - calculate_all: Main entry point for computing all metrics
    - MetricsCalculator: Core calculation engine
"""

from pathlib import Path

# Module constants
STATS_DB_PATH = Path(__file__).parent.parent.parent / "db" / "stats.sqlite"
PLAYERS_DB_PATH = Path(__file__).parent.parent.parent / "db" / "players.sqlite"
