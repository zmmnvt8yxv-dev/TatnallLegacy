#!/usr/bin/env python3
"""
Advanced Metrics Engine

Centralized calculation of fantasy football metrics including:
    - Fantasy points (multiple scoring systems)
    - WAR (Wins Above Replacement) with configurable replacement levels
    - Position Z-scores (weekly and season)
    - Boom/bust classification
    - Consistency scores
    - Opponent-adjusted metrics
    - Availability/durability scores

Usage:
    # Calculate all metrics for a season
    python calculate_all.py --season 2024

    # Calculate specific metrics
    python calculate_all.py --season 2024 --metrics war,zscore

    # Calculate for all seasons
    python calculate_all.py --all

    # Export metrics to JSON
    python calculate_all.py --season 2024 --export json
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

# Path setup for imports
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
STATS_DB_PATH = PROJECT_ROOT / "db" / "stats.sqlite"
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
OUTPUT_PATH = PROJECT_ROOT / "data_raw" / "metrics"

# Positions relevant for fantasy
FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
SKILL_POSITIONS = ["QB", "RB", "WR", "TE"]


@dataclass
class LeagueSettings:
    """League settings for metrics calculation."""
    num_teams: int = 8
    roster_size: int = 15

    # Starting lineup slots per position
    starting_qb: int = 2
    starting_rb: int = 3
    starting_wr: int = 3
    starting_te: int = 2
    starting_flex: int = 2  # RB/WR/TE
    starting_k: int = 1
    starting_def: int = 1

    # Waiver/replacement buffer beyond starters
    buffer_qb: int = 4
    buffer_rb: int = 6
    buffer_wr: int = 6
    buffer_te: int = 4

    # Boom/bust thresholds
    boom_threshold: float = 20.0
    bust_threshold: float = 5.0

    # Consistency scoring
    consistency_weeks_min: int = 6  # Minimum weeks to qualify

    @property
    def total_starters(self) -> Dict[str, int]:
        """Total starters per position across all teams."""
        return {
            "QB": self.num_teams * self.starting_qb,
            "RB": self.num_teams * self.starting_rb,
            "WR": self.num_teams * self.starting_wr,
            "TE": self.num_teams * self.starting_te,
            "K": self.num_teams * self.starting_k,
            "DEF": self.num_teams * self.starting_def,
        }

    @property
    def replacement_level(self) -> Dict[str, int]:
        """Replacement level rank per position (starters + buffer)."""
        return {
            "QB": self.total_starters["QB"] + self.buffer_qb,
            "RB": self.total_starters["RB"] + self.buffer_rb,
            "WR": self.total_starters["WR"] + self.buffer_wr,
            "TE": self.total_starters["TE"] + self.buffer_te,
            "K": self.total_starters["K"] + 2,
            "DEF": self.total_starters["DEF"] + 2,
        }


@dataclass
class PlayerMetrics:
    """Computed metrics for a player-season."""
    player_uid: str
    season: int
    position: str

    # Games
    games_played: int = 0
    games_started: int = 0

    # Fantasy points
    fantasy_points_total: float = 0.0
    fantasy_points_ppg: float = 0.0
    fantasy_points_median: float = 0.0

    # WAR metrics
    war_total: float = 0.0
    war_per_game: float = 0.0
    points_above_replacement: float = 0.0
    replacement_level_ppg: float = 0.0

    # Z-scores
    zscore_weekly_avg: float = 0.0
    zscore_season: float = 0.0
    zscore_vs_position: float = 0.0

    # Boom/bust
    boom_weeks: int = 0
    bust_weeks: int = 0
    boom_rate: float = 0.0
    bust_rate: float = 0.0
    boom_bust_diff: float = 0.0

    # Consistency
    consistency_score: float = 0.0
    std_dev: float = 0.0
    coefficient_of_variation: float = 0.0
    floor: float = 0.0  # 10th percentile
    ceiling: float = 0.0  # 90th percentile

    # Opponent-adjusted
    sos_factor: float = 1.0  # Strength of schedule factor
    adjusted_ppg: float = 0.0

    # Availability
    availability_rate: float = 0.0
    durability_score: float = 0.0
    injury_adjusted_value: float = 0.0

    # Rankings
    position_rank: int = 0
    overall_rank: int = 0


@dataclass
class WeeklyZScore:
    """Z-score data for a player-week."""
    player_uid: str
    season: int
    week: int
    position: str
    fantasy_points: float
    zscore_overall: float
    zscore_position: float
    percentile_overall: float
    percentile_position: float


class MetricsCalculator:
    """Calculates advanced fantasy football metrics."""

    def __init__(
        self,
        stats_db_path: Path = STATS_DB_PATH,
        players_db_path: Path = PLAYERS_DB_PATH,
        settings: Optional[LeagueSettings] = None
    ):
        self.stats_db_path = stats_db_path
        self.players_db_path = players_db_path
        self.settings = settings or LeagueSettings()
        self._stats_conn: Optional[sqlite3.Connection] = None
        self._players_conn: Optional[sqlite3.Connection] = None
        self._defense_rankings: Dict[int, Dict[str, Dict[str, float]]] = {}

    def _get_stats_connection(self) -> sqlite3.Connection:
        """Get connection to stats database."""
        if self._stats_conn is None:
            if not self.stats_db_path.exists():
                raise FileNotFoundError(f"Stats database not found: {self.stats_db_path}")
            self._stats_conn = sqlite3.connect(str(self.stats_db_path))
            self._stats_conn.row_factory = sqlite3.Row
        return self._stats_conn

    def _get_players_connection(self) -> sqlite3.Connection:
        """Get connection to players database."""
        if self._players_conn is None:
            if not self.players_db_path.exists():
                raise FileNotFoundError(f"Players database not found: {self.players_db_path}")
            self._players_conn = sqlite3.connect(str(self.players_db_path))
            self._players_conn.row_factory = sqlite3.Row
        return self._players_conn

    def close(self) -> None:
        """Close database connections."""
        if self._stats_conn:
            self._stats_conn.close()
            self._stats_conn = None
        if self._players_conn:
            self._players_conn.close()
            self._players_conn = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def _load_weekly_stats(
        self,
        season: int,
        positions: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """Load weekly stats from database."""
        conn = self._get_stats_connection()

        query = """
            SELECT
                pgs.player_uid,
                pgs.season,
                pgs.week,
                pgs.team,
                pgs.opponent,
                pgs.position,
                pgs.fantasy_points_ppr as fantasy_points,
                pgs.fantasy_points_half,
                pgs.fantasy_points_std,
                pgs.fantasy_points_custom,
                pgs.played,
                pgs.stats
            FROM player_game_stats pgs
            WHERE pgs.season = ?
              AND pgs.is_current = 1
              AND pgs.played = 1
        """
        params: List[Any] = [season]

        if positions:
            placeholders = ",".join("?" * len(positions))
            query += f" AND pgs.position IN ({placeholders})"
            params.extend(positions)

        df = pd.read_sql_query(query, conn, params=params)
        return df

    def _load_season_aggregates(self, season: int) -> pd.DataFrame:
        """Load season-level aggregated stats."""
        conn = self._get_stats_connection()

        query = """
            SELECT
                player_uid,
                season,
                position,
                team,
                games_played,
                games_started,
                fantasy_points_ppr as fantasy_points,
                fantasy_ppg_ppr as fantasy_ppg,
                stats,
                metrics
            FROM player_season_stats
            WHERE season = ?
              AND season_type = 'REG'
              AND source = 'computed'
        """

        df = pd.read_sql_query(query, conn, params=[season])
        return df

    # =========================================================================
    # WAR (Wins Above Replacement)
    # =========================================================================

    def calculate_war(
        self,
        weekly_df: pd.DataFrame,
        position: str,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """
        Calculate WAR for a position within weekly data.

        WAR = (Player Points - Replacement Level Points) / Points per Win

        Where Points per Win is approximately the marginal value of a win
        in fantasy matchups (typically ~15-20 points).
        """
        POINTS_PER_WIN = 15.0  # Approximate points difference per win

        if position not in weekly_df["position"].values:
            return pd.DataFrame()

        pos_df = weekly_df[weekly_df["position"] == position].copy()

        # Group by season/week to calculate replacement level per week
        results = []

        for (season, week), week_df in pos_df.groupby(["season", "week"]):
            week_df = week_df.copy()
            week_df = week_df.sort_values(points_col, ascending=False)

            # Determine replacement level rank
            replacement_rank = self.settings.replacement_level.get(position, 20)

            # Get replacement level points
            if len(week_df) >= replacement_rank:
                replacement_points = week_df.iloc[replacement_rank - 1][points_col]
            else:
                # Not enough players, use last available
                replacement_points = week_df.iloc[-1][points_col] if len(week_df) > 0 else 0

            # Calculate points above replacement for each player
            week_df["replacement_points"] = replacement_points
            week_df["points_above_replacement"] = week_df[points_col] - replacement_points
            week_df["war_week"] = week_df["points_above_replacement"] / POINTS_PER_WIN

            results.append(week_df)

        if not results:
            return pd.DataFrame()

        return pd.concat(results, ignore_index=True)

    def calculate_season_war(
        self,
        weekly_df: pd.DataFrame,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """
        Calculate season-level WAR for all positions.

        Returns DataFrame with player_uid, season, and WAR metrics.
        """
        all_war = []

        for position in SKILL_POSITIONS:
            war_df = self.calculate_war(weekly_df, position, points_col)
            if not war_df.empty:
                all_war.append(war_df)

        if not all_war:
            return pd.DataFrame()

        combined = pd.concat(all_war, ignore_index=True)

        # Aggregate to season level
        season_war = combined.groupby(["player_uid", "season", "position"]).agg({
            points_col: ["sum", "mean", "count"],
            "points_above_replacement": "sum",
            "war_week": "sum",
            "replacement_points": "mean",
        }).reset_index()

        # Flatten column names
        season_war.columns = [
            "player_uid", "season", "position",
            "fantasy_points_total", "fantasy_ppg", "games_played",
            "points_above_replacement", "war_total", "replacement_level_ppg"
        ]

        season_war["war_per_game"] = season_war["war_total"] / season_war["games_played"]

        return season_war

    # =========================================================================
    # Z-Scores
    # =========================================================================

    def calculate_weekly_zscores(
        self,
        weekly_df: pd.DataFrame,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """
        Calculate Z-scores for each player-week.

        Computes both overall Z-score and position-specific Z-score.
        """
        results = []

        for (season, week), week_df in weekly_df.groupby(["season", "week"]):
            week_df = week_df.copy()

            # Overall Z-score
            overall_mean = week_df[points_col].mean()
            overall_std = week_df[points_col].std()

            if overall_std > 0:
                week_df["zscore_overall"] = (week_df[points_col] - overall_mean) / overall_std
            else:
                week_df["zscore_overall"] = 0

            # Position-specific Z-score
            def calc_pos_zscore(group):
                mean = group[points_col].mean()
                std = group[points_col].std()
                if std > 0:
                    return (group[points_col] - mean) / std
                return pd.Series(0, index=group.index)

            week_df["zscore_position"] = week_df.groupby("position", group_keys=False).apply(
                calc_pos_zscore
            )

            # Percentiles
            week_df["percentile_overall"] = week_df[points_col].rank(pct=True)

            def calc_pos_percentile(group):
                return group[points_col].rank(pct=True)

            week_df["percentile_position"] = week_df.groupby("position", group_keys=False).apply(
                calc_pos_percentile
            )

            results.append(week_df)

        if not results:
            return pd.DataFrame()

        return pd.concat(results, ignore_index=True)

    def calculate_season_zscores(
        self,
        weekly_df: pd.DataFrame,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """Calculate season-level Z-scores."""
        # First get weekly Z-scores
        weekly_with_z = self.calculate_weekly_zscores(weekly_df, points_col)

        if weekly_with_z.empty:
            return pd.DataFrame()

        # Aggregate to season
        season_z = weekly_with_z.groupby(["player_uid", "season", "position"]).agg({
            "zscore_overall": "mean",
            "zscore_position": "mean",
            "percentile_overall": "mean",
            "percentile_position": "mean",
            points_col: ["sum", "mean"],
        }).reset_index()

        season_z.columns = [
            "player_uid", "season", "position",
            "zscore_weekly_avg", "zscore_position_avg",
            "percentile_overall_avg", "percentile_position_avg",
            "fantasy_points_total", "fantasy_ppg"
        ]

        # Calculate season-level position Z-score
        for position in season_z["position"].unique():
            mask = season_z["position"] == position
            pos_data = season_z.loc[mask, "fantasy_points_total"]
            mean = pos_data.mean()
            std = pos_data.std()
            if std > 0:
                season_z.loc[mask, "zscore_season"] = (pos_data - mean) / std
            else:
                season_z.loc[mask, "zscore_season"] = 0

        return season_z

    # =========================================================================
    # Boom/Bust Analysis
    # =========================================================================

    def calculate_boom_bust(
        self,
        weekly_df: pd.DataFrame,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """
        Calculate boom/bust metrics for each player-season.

        Boom: >= boom_threshold points
        Bust: < bust_threshold points
        """
        weekly_df = weekly_df.copy()

        # Classify each week
        weekly_df["is_boom"] = (weekly_df[points_col] >= self.settings.boom_threshold).astype(int)
        weekly_df["is_bust"] = (weekly_df[points_col] < self.settings.bust_threshold).astype(int)

        # Aggregate to season
        boom_bust = weekly_df.groupby(["player_uid", "season", "position"]).agg({
            "is_boom": "sum",
            "is_bust": "sum",
            points_col: "count",
        }).reset_index()

        boom_bust.columns = ["player_uid", "season", "position", "boom_weeks", "bust_weeks", "games_played"]

        boom_bust["boom_rate"] = boom_bust["boom_weeks"] / boom_bust["games_played"]
        boom_bust["bust_rate"] = boom_bust["bust_weeks"] / boom_bust["games_played"]
        boom_bust["boom_bust_diff"] = boom_bust["boom_rate"] - boom_bust["bust_rate"]

        return boom_bust

    # =========================================================================
    # Consistency Scores
    # =========================================================================

    def calculate_consistency(
        self,
        weekly_df: pd.DataFrame,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """
        Calculate consistency metrics for each player-season.

        Consistency Score = 1 - (StdDev / Mean) normalized to 0-100 scale
        Higher score = more consistent
        """
        def calc_consistency_metrics(group):
            points = group[points_col].values
            n = len(points)

            if n < self.settings.consistency_weeks_min:
                return pd.Series({
                    "games_played": n,
                    "std_dev": np.nan,
                    "mean": np.nan,
                    "cv": np.nan,
                    "consistency_score": np.nan,
                    "floor": np.nan,
                    "ceiling": np.nan,
                    "median": np.nan,
                })

            mean = np.mean(points)
            std = np.std(points)
            cv = std / mean if mean > 0 else np.nan

            # Consistency score: inverse of CV, scaled to 0-100
            # Lower CV = higher consistency
            if cv is not None and not np.isnan(cv):
                consistency_score = max(0, min(100, 100 * (1 - cv)))
            else:
                consistency_score = np.nan

            return pd.Series({
                "games_played": n,
                "std_dev": std,
                "mean": mean,
                "cv": cv,
                "consistency_score": consistency_score,
                "floor": np.percentile(points, 10),
                "ceiling": np.percentile(points, 90),
                "median": np.median(points),
            })

        consistency = weekly_df.groupby(["player_uid", "season", "position"]).apply(
            calc_consistency_metrics
        ).reset_index()

        return consistency

    # =========================================================================
    # Opponent-Adjusted Metrics
    # =========================================================================

    def calculate_defense_rankings(
        self,
        weekly_df: pd.DataFrame,
        season: int,
        points_col: str = "fantasy_points"
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate defense rankings for opponent adjustment.

        Returns dict of {team: {position: fantasy_points_allowed_factor}}
        where factor > 1.0 means soft defense, < 1.0 means tough defense.
        """
        if season in self._defense_rankings:
            return self._defense_rankings[season]

        # Calculate average fantasy points allowed per position per team
        rankings: Dict[str, Dict[str, float]] = {}

        for position in SKILL_POSITIONS:
            pos_df = weekly_df[weekly_df["position"] == position]

            if pos_df.empty:
                continue

            # Group by opponent and calculate average points allowed
            defense_avg = pos_df.groupby("opponent")[points_col].mean()
            league_avg = pos_df[points_col].mean()

            for team in defense_avg.index:
                if team not in rankings:
                    rankings[team] = {}
                # Factor: defense_points_allowed / league_avg
                rankings[team][position] = defense_avg[team] / league_avg if league_avg > 0 else 1.0

        self._defense_rankings[season] = rankings
        return rankings

    def calculate_opponent_adjusted(
        self,
        weekly_df: pd.DataFrame,
        season: int,
        points_col: str = "fantasy_points"
    ) -> pd.DataFrame:
        """
        Calculate opponent-adjusted fantasy points.

        Adjusts for strength of schedule by normalizing against defense rankings.
        """
        defense_rankings = self.calculate_defense_rankings(weekly_df, season, points_col)

        weekly_df = weekly_df.copy()

        def get_sos_factor(row):
            team = row.get("opponent")
            position = row.get("position")
            if team and position:
                return defense_rankings.get(team, {}).get(position, 1.0)
            return 1.0

        weekly_df["sos_factor"] = weekly_df.apply(get_sos_factor, axis=1)

        # Adjusted points = actual points / sos_factor
        # If sos_factor > 1 (soft defense), adjusted points decrease
        # If sos_factor < 1 (tough defense), adjusted points increase
        weekly_df["adjusted_points"] = weekly_df[points_col] / weekly_df["sos_factor"]

        # Aggregate to season
        adj_season = weekly_df.groupby(["player_uid", "season", "position"]).agg({
            "sos_factor": "mean",
            "adjusted_points": ["sum", "mean"],
            points_col: ["sum", "mean"],
        }).reset_index()

        adj_season.columns = [
            "player_uid", "season", "position",
            "sos_factor_avg",
            "adjusted_points_total", "adjusted_ppg",
            "raw_points_total", "raw_ppg"
        ]

        return adj_season

    # =========================================================================
    # Availability/Durability
    # =========================================================================

    def calculate_availability(
        self,
        weekly_df: pd.DataFrame,
        max_weeks: int = 17
    ) -> pd.DataFrame:
        """
        Calculate availability and durability metrics.

        Availability Rate = Games Played / Max Possible Games
        Durability Score = Weighted availability with recency bias
        """
        # Count games played per player-season
        availability = weekly_df.groupby(["player_uid", "season", "position"]).agg({
            "played": "sum",
            "week": "max",
        }).reset_index()

        availability.columns = ["player_uid", "season", "position", "games_played", "last_week"]

        # Availability rate
        availability["availability_rate"] = availability["games_played"] / max_weeks

        # Durability score: games played weighted by season recency
        # (more recent seasons weighted higher)
        def calc_durability(group):
            # Normalize by season (more recent = higher weight)
            seasons = group["season"].values
            games = group["games_played"].values

            if len(seasons) == 0:
                return pd.Series({"durability_score": 0.0, "career_games": 0})

            max_season = max(seasons)
            weights = np.array([1.0 - 0.1 * (max_season - s) for s in seasons])
            weights = np.maximum(weights, 0.1)  # Minimum weight of 0.1

            weighted_availability = np.sum(games * weights) / (np.sum(weights) * max_weeks)

            return pd.Series({
                "durability_score": weighted_availability * 100,
                "career_games": sum(games)
            })

        durability = availability.groupby("player_uid").apply(calc_durability).reset_index()

        return availability.merge(durability, on="player_uid", how="left")

    # =========================================================================
    # Main Calculation Entry Points
    # =========================================================================

    def calculate_all_metrics(
        self,
        season: int,
        points_col: str = "fantasy_points"
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Calculate all metrics for a season.

        Returns:
            Tuple of (season_metrics_df, weekly_zscores_df)
        """
        logger.info(f"Calculating metrics for season {season}")

        # Load weekly data
        weekly_df = self._load_weekly_stats(season, SKILL_POSITIONS)

        if weekly_df.empty:
            logger.warning(f"No weekly stats found for season {season}")
            return pd.DataFrame(), pd.DataFrame()

        logger.info(f"Loaded {len(weekly_df)} weekly stat records")

        # Calculate all metrics
        war_df = self.calculate_season_war(weekly_df, points_col)
        zscore_df = self.calculate_season_zscores(weekly_df, points_col)
        boom_bust_df = self.calculate_boom_bust(weekly_df, points_col)
        consistency_df = self.calculate_consistency(weekly_df, points_col)
        opponent_adj_df = self.calculate_opponent_adjusted(weekly_df, season, points_col)
        availability_df = self.calculate_availability(weekly_df)

        # Weekly Z-scores for export
        weekly_zscores = self.calculate_weekly_zscores(weekly_df, points_col)

        # Merge all season metrics
        season_metrics = war_df.copy()

        if not zscore_df.empty:
            season_metrics = season_metrics.merge(
                zscore_df[["player_uid", "season", "zscore_weekly_avg", "zscore_season"]],
                on=["player_uid", "season"],
                how="left"
            )

        if not boom_bust_df.empty:
            season_metrics = season_metrics.merge(
                boom_bust_df[["player_uid", "season", "boom_weeks", "bust_weeks", "boom_rate", "bust_rate", "boom_bust_diff"]],
                on=["player_uid", "season"],
                how="left"
            )

        if not consistency_df.empty:
            season_metrics = season_metrics.merge(
                consistency_df[["player_uid", "season", "std_dev", "cv", "consistency_score", "floor", "ceiling", "median"]],
                on=["player_uid", "season"],
                how="left"
            )

        if not opponent_adj_df.empty:
            season_metrics = season_metrics.merge(
                opponent_adj_df[["player_uid", "season", "sos_factor_avg", "adjusted_ppg"]],
                on=["player_uid", "season"],
                how="left"
            )

        if not availability_df.empty:
            season_metrics = season_metrics.merge(
                availability_df[["player_uid", "season", "availability_rate", "durability_score"]],
                on=["player_uid", "season"],
                how="left"
            )

        # Calculate rankings
        for position in SKILL_POSITIONS:
            pos_mask = season_metrics["position"] == position
            season_metrics.loc[pos_mask, "position_rank"] = (
                season_metrics.loc[pos_mask, "fantasy_points_total"]
                .rank(ascending=False, method="min")
                .astype(int)
            )

        season_metrics["overall_rank"] = (
            season_metrics["fantasy_points_total"]
            .rank(ascending=False, method="min")
            .astype(int)
        )

        # Calculate injury-adjusted value
        # (fantasy points * availability rate to account for missed games)
        if "availability_rate" in season_metrics.columns:
            season_metrics["injury_adjusted_value"] = (
                season_metrics["fantasy_points_total"] *
                season_metrics["availability_rate"].fillna(1.0)
            )

        logger.info(f"Calculated metrics for {len(season_metrics)} player-seasons")

        return season_metrics, weekly_zscores

    def save_metrics_to_db(
        self,
        season_metrics: pd.DataFrame,
        season: int
    ) -> int:
        """
        Save calculated metrics to the stats database.

        Updates the player_season_stats table with metrics JSON.
        """
        if season_metrics.empty:
            return 0

        conn = self._get_stats_connection()
        updated = 0

        for _, row in season_metrics.iterrows():
            metrics_dict = {
                "war_total": row.get("war_total"),
                "war_per_game": row.get("war_per_game"),
                "points_above_replacement": row.get("points_above_replacement"),
                "zscore_weekly_avg": row.get("zscore_weekly_avg"),
                "zscore_season": row.get("zscore_season"),
                "boom_weeks": row.get("boom_weeks"),
                "bust_weeks": row.get("bust_weeks"),
                "boom_rate": row.get("boom_rate"),
                "bust_rate": row.get("bust_rate"),
                "consistency_score": row.get("consistency_score"),
                "std_dev": row.get("std_dev"),
                "floor": row.get("floor"),
                "ceiling": row.get("ceiling"),
                "sos_factor": row.get("sos_factor_avg"),
                "adjusted_ppg": row.get("adjusted_ppg"),
                "availability_rate": row.get("availability_rate"),
                "durability_score": row.get("durability_score"),
                "position_rank": row.get("position_rank"),
                "overall_rank": row.get("overall_rank"),
            }

            # Filter out NaN values
            metrics_dict = {k: v for k, v in metrics_dict.items() if pd.notna(v)}

            try:
                conn.execute("""
                    UPDATE player_season_stats
                    SET metrics = ?,
                        updated_at = datetime('now')
                    WHERE player_uid = ? AND season = ? AND season_type = 'REG'
                """, (json.dumps(metrics_dict), row["player_uid"], season))
                updated += 1
            except sqlite3.Error as e:
                logger.warning(f"Failed to update metrics for {row['player_uid']}: {e}")

        conn.commit()
        logger.info(f"Updated metrics for {updated} player-seasons")
        return updated

    def export_metrics(
        self,
        season_metrics: pd.DataFrame,
        weekly_zscores: pd.DataFrame,
        season: int,
        output_dir: Path = OUTPUT_PATH,
        format: Literal["json", "parquet", "csv"] = "parquet"
    ) -> List[Path]:
        """Export metrics to files."""
        output_dir.mkdir(parents=True, exist_ok=True)
        exported = []

        if not season_metrics.empty:
            season_file = output_dir / f"player_season_metrics_{season}.{format}"
            if format == "json":
                season_metrics.to_json(season_file, orient="records", indent=2)
            elif format == "csv":
                season_metrics.to_csv(season_file, index=False)
            else:
                season_metrics.to_parquet(season_file, index=False)
            exported.append(season_file)
            logger.info(f"Exported season metrics to {season_file}")

        if not weekly_zscores.empty:
            weekly_file = output_dir / f"player_weekly_zscores_{season}.{format}"
            if format == "json":
                weekly_zscores.to_json(weekly_file, orient="records", indent=2)
            elif format == "csv":
                weekly_zscores.to_csv(weekly_file, index=False)
            else:
                weekly_zscores.to_parquet(weekly_file, index=False)
            exported.append(weekly_file)
            logger.info(f"Exported weekly Z-scores to {weekly_file}")

        return exported


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Calculate advanced fantasy football metrics"
    )

    parser.add_argument(
        "--season",
        type=int,
        help="Season to calculate metrics for"
    )

    parser.add_argument(
        "--seasons",
        type=str,
        help="Comma-separated list of seasons (e.g., 2023,2024)"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Calculate for all available seasons"
    )

    parser.add_argument(
        "--metrics",
        type=str,
        help="Comma-separated list of metrics to calculate (war,zscore,boombust,consistency,opponent,availability)"
    )

    parser.add_argument(
        "--export",
        choices=["json", "parquet", "csv"],
        help="Export format for metrics files"
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Output directory for exported files (default: {OUTPUT_PATH})"
    )

    parser.add_argument(
        "--save-to-db",
        action="store_true",
        help="Save metrics to the stats database"
    )

    parser.add_argument(
        "--teams",
        type=int,
        default=8,
        help="Number of teams in the league (default: 8)"
    )

    parser.add_argument(
        "--stats-db",
        type=Path,
        default=STATS_DB_PATH,
        help=f"Path to stats database (default: {STATS_DB_PATH})"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Determine seasons to process
    seasons: List[int] = []
    if args.season:
        seasons = [args.season]
    elif args.seasons:
        seasons = [int(s) for s in args.seasons.split(",")]
    elif args.all:
        seasons = list(range(2015, 2026))
    else:
        parser.print_help()
        print("\nExamples:")
        print("  python calculate_all.py --season 2024")
        print("  python calculate_all.py --seasons 2023,2024 --export json")
        print("  python calculate_all.py --all --save-to-db")
        return

    # Create settings
    settings = LeagueSettings(num_teams=args.teams)

    # Calculate metrics
    with MetricsCalculator(
        stats_db_path=args.stats_db,
        settings=settings
    ) as calculator:
        for season in seasons:
            try:
                season_metrics, weekly_zscores = calculator.calculate_all_metrics(season)

                if season_metrics.empty:
                    logger.warning(f"No metrics calculated for season {season}")
                    continue

                # Print summary
                print(f"\n=== Season {season} Metrics ===")
                print(f"Players processed: {len(season_metrics)}")
                print(f"\nTop 10 by WAR:")
                top_war = season_metrics.nsmallest(10, "overall_rank")[
                    ["player_uid", "position", "fantasy_points_total", "war_total", "consistency_score", "position_rank"]
                ]
                print(top_war.to_string(index=False))

                # Save to database
                if args.save_to_db:
                    calculator.save_metrics_to_db(season_metrics, season)

                # Export
                if args.export:
                    calculator.export_metrics(
                        season_metrics,
                        weekly_zscores,
                        season,
                        args.output_dir,
                        args.export
                    )

            except Exception as e:
                logger.error(f"Failed to calculate metrics for season {season}: {e}")
                if args.verbose:
                    import traceback
                    traceback.print_exc()


if __name__ == "__main__":
    main()
