"""
NFL Data Integration Module

Provides loaders for NFL game schedules, injury reports, and other
league-wide data from various sources (NFLverse, Sportradar, etc.).
"""

from scripts.nfl.load_schedule import (
    ScheduleLoader,
    load_schedule,
    get_bye_weeks,
)

from scripts.nfl.load_injuries import (
    InjuryLoader,
    load_injuries,
)

__all__ = [
    "ScheduleLoader",
    "load_schedule",
    "get_bye_weeks",
    "InjuryLoader",
    "load_injuries",
]
