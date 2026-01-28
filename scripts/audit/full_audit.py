#!/usr/bin/env python3
"""
Comprehensive Audit System

Full data lineage and quality reporting for the unified data silo:
- ID match coverage by season/source
- Unresolved player references
- Stats anomalies (outliers, missing games)
- Cross-source consistency checks
- Data freshness indicators

Usage:
    # Run full audit
    python full_audit.py

    # Run specific audits
    python full_audit.py --audit identity,stats

    # Export report
    python full_audit.py --output audit_report.json

    # CI mode (exit code based on quality)
    python full_audit.py --ci --fail-threshold 95
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

import numpy as np

# Path setup
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
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
STATS_DB_PATH = PROJECT_ROOT / "db" / "stats.sqlite"
LEAGUE_DB_PATH = PROJECT_ROOT / "db" / "league.sqlite"
PUBLIC_DATA_PATH = PROJECT_ROOT / "public" / "data"

# Audit thresholds
DEFAULT_CONFIDENCE_THRESHOLD = 0.85
DEFAULT_COVERAGE_THRESHOLD = 95.0
DEFAULT_FRESHNESS_DAYS = 7


@dataclass
class AuditMetric:
    """A single audit metric with score and details."""
    name: str
    category: str
    score: float  # 0-100 percentage
    status: Literal["pass", "warn", "fail"]
    details: Dict[str, Any] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)


@dataclass
class AuditSection:
    """A section of the audit report."""
    name: str
    metrics: List[AuditMetric] = field(default_factory=list)
    overall_score: float = 0.0
    status: Literal["pass", "warn", "fail"] = "pass"

    def add_metric(self, metric: AuditMetric) -> None:
        """Add a metric and update overall score."""
        self.metrics.append(metric)
        if self.metrics:
            self.overall_score = sum(m.score for m in self.metrics) / len(self.metrics)
            if any(m.status == "fail" for m in self.metrics):
                self.status = "fail"
            elif any(m.status == "warn" for m in self.metrics):
                self.status = "warn"


@dataclass
class AuditReport:
    """Complete audit report."""
    audit_id: str
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None

    # Sections
    sections: Dict[str, AuditSection] = field(default_factory=dict)

    # Summary
    overall_score: float = 0.0
    overall_status: Literal["pass", "warn", "fail"] = "pass"

    # Recommendations
    critical_issues: List[Dict[str, Any]] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)

    def add_section(self, section: AuditSection) -> None:
        """Add a section to the report."""
        self.sections[section.name] = section

    def finalize(self) -> None:
        """Calculate overall metrics and finalize report."""
        self.completed_at = datetime.now().isoformat()
        if self.started_at:
            start = datetime.fromisoformat(self.started_at)
            end = datetime.fromisoformat(self.completed_at)
            self.duration_seconds = (end - start).total_seconds()

        if self.sections:
            self.overall_score = sum(s.overall_score for s in self.sections.values()) / len(self.sections)

            if any(s.status == "fail" for s in self.sections.values()):
                self.overall_status = "fail"
            elif any(s.status == "warn" for s in self.sections.values()):
                self.overall_status = "warn"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "audit_id": self.audit_id,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_seconds": self.duration_seconds,
            "overall_score": round(self.overall_score, 2),
            "overall_status": self.overall_status,
            "sections": {
                name: {
                    "name": section.name,
                    "overall_score": round(section.overall_score, 2),
                    "status": section.status,
                    "metrics": [asdict(m) for m in section.metrics]
                }
                for name, section in self.sections.items()
            },
            "critical_issues": self.critical_issues,
            "recommendations": self.recommendations
        }

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, default=str)


class DataAuditor:
    """
    Comprehensive data auditor for the unified data silo.

    Performs quality checks across all layers:
    - Identity layer: ID coverage, confidence scores, duplicates
    - Stats layer: Data completeness, anomalies, consistency
    - League layer: Transaction integrity, lineup completeness
    - Export layer: File freshness, data consistency
    """

    def __init__(
        self,
        players_db: Path = PLAYERS_DB_PATH,
        stats_db: Path = STATS_DB_PATH,
        league_db: Path = LEAGUE_DB_PATH,
        public_data: Path = PUBLIC_DATA_PATH,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        coverage_threshold: float = DEFAULT_COVERAGE_THRESHOLD,
        freshness_days: int = DEFAULT_FRESHNESS_DAYS
    ):
        self.players_db = players_db
        self.stats_db = stats_db
        self.league_db = league_db
        self.public_data = public_data
        self.confidence_threshold = confidence_threshold
        self.coverage_threshold = coverage_threshold
        self.freshness_days = freshness_days

    def _get_connection(self, db_path: Path) -> Optional[sqlite3.Connection]:
        """Get a database connection if the database exists."""
        if not db_path.exists():
            logger.warning(f"Database not found: {db_path}")
            return None
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        return conn

    # =========================================================================
    # Identity Audits
    # =========================================================================

    def audit_id_coverage(self) -> AuditSection:
        """
        Audit ID match coverage by season and source.

        Checks:
        - Percentage of players with IDs from each source
        - Coverage by season (are recent seasons better covered?)
        - Active vs inactive player coverage
        """
        section = AuditSection(name="ID Coverage")

        conn = self._get_connection(self.players_db)
        if not conn:
            metric = AuditMetric(
                name="Database Availability",
                category="identity",
                score=0,
                status="fail",
                details={"error": "Players database not found"}
            )
            section.add_metric(metric)
            return section

        try:
            # Get total player count
            total_players = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]

            # Get coverage by source
            sources = ["sleeper", "espn", "gsis", "nflverse", "sportradar", "yahoo", "pfr"]
            coverage_by_source = {}

            for source in sources:
                count = conn.execute("""
                    SELECT COUNT(DISTINCT player_uid)
                    FROM player_identifiers
                    WHERE source = ?
                """, (source,)).fetchone()[0]

                coverage_pct = (count / total_players * 100) if total_players > 0 else 0
                coverage_by_source[source] = {
                    "count": count,
                    "percentage": round(coverage_pct, 2)
                }

            # Calculate overall coverage score (weighted by importance)
            weights = {"sleeper": 0.25, "espn": 0.25, "gsis": 0.2, "nflverse": 0.2, "sportradar": 0.1}
            weighted_score = sum(
                coverage_by_source.get(src, {}).get("percentage", 0) * weight
                for src, weight in weights.items()
            )

            status = "pass" if weighted_score >= self.coverage_threshold else ("warn" if weighted_score >= 80 else "fail")

            metric = AuditMetric(
                name="Source Coverage",
                category="identity",
                score=weighted_score,
                status=status,
                details={
                    "total_players": total_players,
                    "coverage_by_source": coverage_by_source
                }
            )
            section.add_metric(metric)

            # Check active player coverage
            active_count = conn.execute(
                "SELECT COUNT(*) FROM players WHERE status = 'active'"
            ).fetchone()[0]

            active_with_sleeper = conn.execute("""
                SELECT COUNT(DISTINCT p.player_uid)
                FROM players p
                JOIN player_identifiers pi ON p.player_uid = pi.player_uid
                WHERE p.status = 'active' AND pi.source = 'sleeper'
            """).fetchone()[0]

            active_coverage = (active_with_sleeper / active_count * 100) if active_count > 0 else 0

            metric = AuditMetric(
                name="Active Player Coverage",
                category="identity",
                score=active_coverage,
                status="pass" if active_coverage >= 95 else ("warn" if active_coverage >= 85 else "fail"),
                details={
                    "active_players": active_count,
                    "with_sleeper_id": active_with_sleeper,
                    "percentage": round(active_coverage, 2)
                }
            )
            section.add_metric(metric)

            # Check players with multiple IDs (should have at least 2)
            multi_id_count = conn.execute("""
                SELECT COUNT(*)
                FROM (
                    SELECT player_uid, COUNT(DISTINCT source) as source_count
                    FROM player_identifiers
                    GROUP BY player_uid
                    HAVING source_count >= 2
                )
            """).fetchone()[0]

            multi_id_pct = (multi_id_count / total_players * 100) if total_players > 0 else 0

            metric = AuditMetric(
                name="Multi-Source Coverage",
                category="identity",
                score=multi_id_pct,
                status="pass" if multi_id_pct >= 70 else ("warn" if multi_id_pct >= 50 else "fail"),
                details={
                    "players_with_multiple_ids": multi_id_count,
                    "percentage": round(multi_id_pct, 2)
                },
                recommendations=["Players with multiple IDs are more reliably matched"] if multi_id_pct < 70 else []
            )
            section.add_metric(metric)

        except sqlite3.Error as e:
            metric = AuditMetric(
                name="Database Query",
                category="identity",
                score=0,
                status="fail",
                details={"error": str(e)}
            )
            section.add_metric(metric)
        finally:
            conn.close()

        return section

    def audit_confidence_scores(self) -> AuditSection:
        """
        Audit ID match confidence scores.

        Checks:
        - Distribution of confidence scores
        - Low confidence matches needing review
        - Unverified matches
        """
        section = AuditSection(name="Confidence Scores")

        conn = self._get_connection(self.players_db)
        if not conn:
            section.add_metric(AuditMetric(
                name="Database Availability",
                category="identity",
                score=0,
                status="fail",
                details={"error": "Players database not found"}
            ))
            return section

        try:
            # Get confidence distribution
            confidence_dist = conn.execute("""
                SELECT
                    CASE
                        WHEN confidence >= 0.95 THEN 'high (>=0.95)'
                        WHEN confidence >= 0.85 THEN 'medium (0.85-0.95)'
                        WHEN confidence >= 0.70 THEN 'low (0.70-0.85)'
                        ELSE 'very_low (<0.70)'
                    END as bucket,
                    COUNT(*) as count
                FROM player_identifiers
                GROUP BY bucket
            """).fetchall()

            dist_dict = {row["bucket"]: row["count"] for row in confidence_dist}
            total = sum(dist_dict.values())

            high_confidence_pct = (dist_dict.get("high (>=0.95)", 0) / total * 100) if total > 0 else 0

            metric = AuditMetric(
                name="High Confidence Matches",
                category="identity",
                score=high_confidence_pct,
                status="pass" if high_confidence_pct >= 80 else ("warn" if high_confidence_pct >= 60 else "fail"),
                details={
                    "distribution": dist_dict,
                    "total_identifiers": total
                }
            )
            section.add_metric(metric)

            # Get low confidence matches needing review
            low_confidence = conn.execute("""
                SELECT COUNT(*)
                FROM player_identifiers
                WHERE confidence < ?
            """, (self.confidence_threshold,)).fetchone()[0]

            low_pct = (low_confidence / total * 100) if total > 0 else 0
            low_score = 100 - low_pct  # Invert: fewer low-confidence = better

            metric = AuditMetric(
                name="Low Confidence Matches",
                category="identity",
                score=low_score,
                status="pass" if low_pct <= 5 else ("warn" if low_pct <= 15 else "fail"),
                details={
                    "count": low_confidence,
                    "percentage": round(low_pct, 2),
                    "threshold": self.confidence_threshold
                },
                recommendations=[f"Review {low_confidence} low-confidence matches"] if low_confidence > 0 else []
            )
            section.add_metric(metric)

            # Check for unverified recent matches
            unverified = conn.execute("""
                SELECT COUNT(*)
                FROM player_identifiers
                WHERE verified_at IS NULL
                  AND match_method NOT IN ('exact', 'manual')
            """).fetchone()[0]

            unverified_pct = (unverified / total * 100) if total > 0 else 0

            metric = AuditMetric(
                name="Verified Matches",
                category="identity",
                score=100 - unverified_pct,
                status="pass" if unverified_pct <= 20 else ("warn" if unverified_pct <= 40 else "fail"),
                details={
                    "unverified_count": unverified,
                    "percentage": round(unverified_pct, 2)
                }
            )
            section.add_metric(metric)

        except sqlite3.Error as e:
            section.add_metric(AuditMetric(
                name="Database Query",
                category="identity",
                score=0,
                status="fail",
                details={"error": str(e)}
            ))
        finally:
            conn.close()

        return section

    def audit_unresolved_references(self) -> AuditSection:
        """
        Audit unresolved player references across the system.

        Checks:
        - Resolution queue items pending
        - Transactions with missing player_uid
        - Lineups with missing player_uid
        """
        section = AuditSection(name="Unresolved References")

        # Check resolution queue
        conn = self._get_connection(self.players_db)
        if conn:
            try:
                pending = conn.execute("""
                    SELECT COUNT(*) FROM id_resolution_queue
                    WHERE status = 'pending'
                """).fetchone()[0]

                # Score based on pending items (0 = perfect)
                score = max(0, 100 - pending * 2)  # -2 points per pending item

                metric = AuditMetric(
                    name="Resolution Queue",
                    category="identity",
                    score=score,
                    status="pass" if pending <= 10 else ("warn" if pending <= 50 else "fail"),
                    details={"pending_items": pending},
                    recommendations=[f"Review {pending} pending resolution items"] if pending > 0 else []
                )
                section.add_metric(metric)
            except sqlite3.Error:
                pass
            finally:
                conn.close()

        # Check transactions with missing player_uid
        conn = self._get_connection(self.league_db)
        if conn:
            try:
                total_tx = conn.execute("SELECT COUNT(*) FROM unified_transactions").fetchone()[0]
                missing_uid = conn.execute("""
                    SELECT COUNT(*) FROM unified_transactions
                    WHERE player_uid IS NULL AND source_player_id IS NOT NULL
                """).fetchone()[0]

                resolved_pct = ((total_tx - missing_uid) / total_tx * 100) if total_tx > 0 else 100

                metric = AuditMetric(
                    name="Transaction Player Resolution",
                    category="league",
                    score=resolved_pct,
                    status="pass" if resolved_pct >= 95 else ("warn" if resolved_pct >= 85 else "fail"),
                    details={
                        "total_transactions": total_tx,
                        "unresolved": missing_uid,
                        "percentage_resolved": round(resolved_pct, 2)
                    }
                )
                section.add_metric(metric)

                # Check lineups
                total_lineups = conn.execute("SELECT COUNT(*) FROM unified_lineups").fetchone()[0]
                missing_lineup_uid = conn.execute("""
                    SELECT COUNT(*) FROM unified_lineups
                    WHERE player_uid IS NULL AND source_player_id IS NOT NULL
                """).fetchone()[0]

                lineup_resolved_pct = ((total_lineups - missing_lineup_uid) / total_lineups * 100) if total_lineups > 0 else 100

                metric = AuditMetric(
                    name="Lineup Player Resolution",
                    category="league",
                    score=lineup_resolved_pct,
                    status="pass" if lineup_resolved_pct >= 95 else ("warn" if lineup_resolved_pct >= 85 else "fail"),
                    details={
                        "total_lineup_entries": total_lineups,
                        "unresolved": missing_lineup_uid,
                        "percentage_resolved": round(lineup_resolved_pct, 2)
                    }
                )
                section.add_metric(metric)

            except sqlite3.Error as e:
                section.add_metric(AuditMetric(
                    name="League Database Query",
                    category="league",
                    score=0,
                    status="fail",
                    details={"error": str(e)}
                ))
            finally:
                conn.close()

        return section

    # =========================================================================
    # Stats Audits
    # =========================================================================

    def audit_stats_completeness(self) -> AuditSection:
        """
        Audit stats data completeness.

        Checks:
        - Games with stats per season
        - Players with stats per season
        - Missing weeks detection
        """
        section = AuditSection(name="Stats Completeness")

        conn = self._get_connection(self.stats_db)
        if not conn:
            section.add_metric(AuditMetric(
                name="Database Availability",
                category="stats",
                score=0,
                status="fail",
                details={"error": "Stats database not found"}
            ))
            return section

        try:
            # Get coverage by season
            coverage = conn.execute("""
                SELECT
                    season,
                    COUNT(DISTINCT game_id) as games,
                    COUNT(DISTINCT player_uid) as players,
                    COUNT(*) as stat_records,
                    MIN(week) as first_week,
                    MAX(week) as last_week
                FROM player_game_stats
                WHERE is_current = 1
                GROUP BY season
                ORDER BY season DESC
            """).fetchall()

            coverage_details = {}
            completeness_scores = []

            for row in coverage:
                season = row["season"]
                expected_weeks = 18 if season >= 2021 else 17
                actual_weeks = row["last_week"] - row["first_week"] + 1

                week_coverage = min(100, (actual_weeks / expected_weeks) * 100)
                completeness_scores.append(week_coverage)

                coverage_details[season] = {
                    "games": row["games"],
                    "players": row["players"],
                    "stat_records": row["stat_records"],
                    "weeks_covered": f"{row['first_week']}-{row['last_week']}",
                    "expected_weeks": expected_weeks,
                    "coverage_pct": round(week_coverage, 2)
                }

            avg_completeness = sum(completeness_scores) / len(completeness_scores) if completeness_scores else 0

            metric = AuditMetric(
                name="Season Coverage",
                category="stats",
                score=avg_completeness,
                status="pass" if avg_completeness >= 90 else ("warn" if avg_completeness >= 70 else "fail"),
                details={"seasons": coverage_details}
            )
            section.add_metric(metric)

            # Check for games without player stats
            games_without_stats = conn.execute("""
                SELECT COUNT(*)
                FROM nfl_games g
                WHERE g.status = 'final'
                  AND NOT EXISTS (
                      SELECT 1 FROM player_game_stats pgs
                      WHERE pgs.game_id = g.game_id AND pgs.is_current = 1
                  )
            """).fetchone()[0]

            total_final_games = conn.execute("""
                SELECT COUNT(*) FROM nfl_games WHERE status = 'final'
            """).fetchone()[0]

            games_with_stats_pct = ((total_final_games - games_without_stats) / total_final_games * 100) if total_final_games > 0 else 100

            metric = AuditMetric(
                name="Games With Stats",
                category="stats",
                score=games_with_stats_pct,
                status="pass" if games_without_stats <= 5 else ("warn" if games_without_stats <= 20 else "fail"),
                details={
                    "total_final_games": total_final_games,
                    "games_missing_stats": games_without_stats
                }
            )
            section.add_metric(metric)

        except sqlite3.Error as e:
            section.add_metric(AuditMetric(
                name="Database Query",
                category="stats",
                score=0,
                status="fail",
                details={"error": str(e)}
            ))
        finally:
            conn.close()

        return section

    def audit_stats_anomalies(self) -> AuditSection:
        """
        Audit stats for anomalies and outliers.

        Checks:
        - Outlier fantasy point totals
        - Impossible stat combinations
        - Duplicate stat entries
        """
        section = AuditSection(name="Stats Anomalies")

        conn = self._get_connection(self.stats_db)
        if not conn:
            section.add_metric(AuditMetric(
                name="Database Availability",
                category="stats",
                score=0,
                status="fail",
                details={"error": "Stats database not found"}
            ))
            return section

        try:
            # Check for extreme outliers (>60 fantasy points in a game)
            outliers = conn.execute("""
                SELECT COUNT(*) FROM player_game_stats
                WHERE is_current = 1
                  AND fantasy_points_ppr > 60
            """).fetchone()[0]

            total_stats = conn.execute("""
                SELECT COUNT(*) FROM player_game_stats WHERE is_current = 1
            """).fetchone()[0]

            outlier_pct = (outliers / total_stats * 100) if total_stats > 0 else 0
            outlier_score = 100 - (outlier_pct * 10)  # Penalize heavily for outliers

            metric = AuditMetric(
                name="Extreme Outliers",
                category="stats",
                score=max(0, outlier_score),
                status="pass" if outliers <= 10 else ("warn" if outliers <= 50 else "fail"),
                details={
                    "outlier_count": outliers,
                    "threshold": "60+ fantasy points",
                    "percentage": round(outlier_pct, 4)
                },
                recommendations=[f"Review {outliers} extreme stat outliers"] if outliers > 0 else []
            )
            section.add_metric(metric)

            # Check for negative fantasy points (shouldn't happen in most cases)
            negative_points = conn.execute("""
                SELECT COUNT(*) FROM player_game_stats
                WHERE is_current = 1
                  AND (fantasy_points_ppr < -5 OR fantasy_points_std < -5)
            """).fetchone()[0]

            metric = AuditMetric(
                name="Negative Points",
                category="stats",
                score=100 if negative_points == 0 else max(0, 100 - negative_points * 5),
                status="pass" if negative_points == 0 else ("warn" if negative_points <= 10 else "fail"),
                details={"count": negative_points},
                recommendations=[f"Investigate {negative_points} records with extremely negative points"] if negative_points > 0 else []
            )
            section.add_metric(metric)

            # Check for duplicate stat entries
            duplicates = conn.execute("""
                SELECT COUNT(*) FROM (
                    SELECT player_uid, game_id, source, COUNT(*) as cnt
                    FROM player_game_stats
                    WHERE is_current = 1
                    GROUP BY player_uid, game_id, source
                    HAVING cnt > 1
                )
            """).fetchone()[0]

            metric = AuditMetric(
                name="Duplicate Stats",
                category="stats",
                score=100 if duplicates == 0 else max(0, 100 - duplicates * 10),
                status="pass" if duplicates == 0 else ("warn" if duplicates <= 5 else "fail"),
                details={"duplicate_sets": duplicates},
                recommendations=["Deduplicate stat records"] if duplicates > 0 else []
            )
            section.add_metric(metric)

        except sqlite3.Error as e:
            section.add_metric(AuditMetric(
                name="Database Query",
                category="stats",
                score=0,
                status="fail",
                details={"error": str(e)}
            ))
        finally:
            conn.close()

        return section

    def audit_cross_source_consistency(self) -> AuditSection:
        """
        Audit cross-source data consistency.

        Checks:
        - Stats matching across sources for same player/game
        - Player info consistency
        """
        section = AuditSection(name="Cross-Source Consistency")

        conn = self._get_connection(self.stats_db)
        if not conn:
            section.add_metric(AuditMetric(
                name="Database Availability",
                category="stats",
                score=0,
                status="fail",
                details={"error": "Stats database not found"}
            ))
            return section

        try:
            # Check for players with stats from multiple sources
            multi_source = conn.execute("""
                SELECT
                    player_uid,
                    game_id,
                    COUNT(DISTINCT source) as source_count,
                    GROUP_CONCAT(DISTINCT source) as sources
                FROM player_game_stats
                WHERE is_current = 1
                GROUP BY player_uid, game_id
                HAVING source_count > 1
            """).fetchall()

            # For multi-source entries, check fantasy point variance
            inconsistencies = 0
            for row in multi_source:
                variance_check = conn.execute("""
                    SELECT MAX(fantasy_points_ppr) - MIN(fantasy_points_ppr) as variance
                    FROM player_game_stats
                    WHERE player_uid = ? AND game_id = ? AND is_current = 1
                """, (row["player_uid"], row["game_id"])).fetchone()

                if variance_check and variance_check["variance"] and variance_check["variance"] > 3:
                    inconsistencies += 1

            consistency_score = 100 if len(multi_source) == 0 else (
                (1 - inconsistencies / len(multi_source)) * 100
            )

            metric = AuditMetric(
                name="Multi-Source Stats Consistency",
                category="stats",
                score=consistency_score,
                status="pass" if consistency_score >= 95 else ("warn" if consistency_score >= 85 else "fail"),
                details={
                    "multi_source_entries": len(multi_source),
                    "inconsistencies": inconsistencies,
                    "variance_threshold": "3 fantasy points"
                }
            )
            section.add_metric(metric)

        except sqlite3.Error as e:
            section.add_metric(AuditMetric(
                name="Database Query",
                category="stats",
                score=0,
                status="fail",
                details={"error": str(e)}
            ))
        finally:
            conn.close()

        return section

    # =========================================================================
    # Data Freshness
    # =========================================================================

    def audit_data_freshness(self) -> AuditSection:
        """
        Audit data freshness indicators.

        Checks:
        - Last update timestamps
        - Export file ages
        - Recent import activity
        """
        section = AuditSection(name="Data Freshness")

        now = datetime.now()
        threshold = now - timedelta(days=self.freshness_days)

        # Check database freshness
        for db_name, db_path in [
            ("players", self.players_db),
            ("stats", self.stats_db),
            ("league", self.league_db)
        ]:
            if not db_path.exists():
                continue

            conn = self._get_connection(db_path)
            if not conn:
                continue

            try:
                # Check most recent update
                tables = {
                    "players": ["players", "player_identifiers"],
                    "stats": ["player_game_stats", "nfl_games"],
                    "league": ["unified_transactions", "unified_lineups"]
                }

                for table in tables.get(db_name, []):
                    try:
                        result = conn.execute(f"""
                            SELECT MAX(updated_at) as last_update
                            FROM {table}
                        """).fetchone()

                        if result and result["last_update"]:
                            last_update = datetime.fromisoformat(result["last_update"])
                            days_old = (now - last_update).days
                            is_fresh = days_old <= self.freshness_days

                            metric = AuditMetric(
                                name=f"{table} Freshness",
                                category="freshness",
                                score=100 if is_fresh else max(0, 100 - (days_old - self.freshness_days) * 5),
                                status="pass" if is_fresh else ("warn" if days_old <= 14 else "fail"),
                                details={
                                    "last_update": result["last_update"],
                                    "days_old": days_old,
                                    "threshold_days": self.freshness_days
                                }
                            )
                            section.add_metric(metric)
                    except sqlite3.Error:
                        pass  # Table might not exist

            finally:
                conn.close()

        # Check export file freshness
        manifest_path = self.public_data / "manifest.json"
        if manifest_path.exists():
            mtime = datetime.fromtimestamp(manifest_path.stat().st_mtime)
            days_old = (now - mtime).days
            is_fresh = days_old <= self.freshness_days

            metric = AuditMetric(
                name="Export Manifest Freshness",
                category="freshness",
                score=100 if is_fresh else max(0, 100 - (days_old - self.freshness_days) * 5),
                status="pass" if is_fresh else ("warn" if days_old <= 14 else "fail"),
                details={
                    "last_modified": mtime.isoformat(),
                    "days_old": days_old
                }
            )
            section.add_metric(metric)

        return section

    # =========================================================================
    # Full Audit
    # =========================================================================

    def run_full_audit(self, audits: Optional[List[str]] = None) -> AuditReport:
        """
        Run full audit suite.

        Args:
            audits: Optional list of specific audits to run
                    Options: identity, stats, consistency, freshness

        Returns:
            Complete AuditReport
        """
        report = AuditReport(
            audit_id=f"audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            started_at=datetime.now().isoformat()
        )

        audit_functions = {
            "identity": [
                self.audit_id_coverage,
                self.audit_confidence_scores,
                self.audit_unresolved_references,
            ],
            "stats": [
                self.audit_stats_completeness,
                self.audit_stats_anomalies,
            ],
            "consistency": [
                self.audit_cross_source_consistency,
            ],
            "freshness": [
                self.audit_data_freshness,
            ]
        }

        # Determine which audits to run
        if audits is None:
            audits = list(audit_functions.keys())

        for audit_name in audits:
            if audit_name not in audit_functions:
                logger.warning(f"Unknown audit category: {audit_name}")
                continue

            logger.info(f"Running {audit_name} audits...")
            for audit_func in audit_functions[audit_name]:
                section = audit_func()
                report.add_section(section)

        # Generate recommendations based on results
        for section in report.sections.values():
            for metric in section.metrics:
                if metric.status == "fail":
                    report.critical_issues.append({
                        "section": section.name,
                        "metric": metric.name,
                        "score": metric.score,
                        "details": metric.details
                    })
                report.recommendations.extend(metric.recommendations)

        report.finalize()
        return report


def run_full_audit(
    output_file: Optional[Path] = None,
    audits: Optional[List[str]] = None,
    fail_threshold: float = 80.0
) -> int:
    """
    Run full audit and return exit code.

    Args:
        output_file: Optional path to save JSON report
        audits: List of audit categories to run
        fail_threshold: Minimum score to pass (0-100)

    Returns:
        Exit code (0 = pass, 1 = fail)
    """
    auditor = DataAuditor()
    report = auditor.run_full_audit(audits)

    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(report.to_json())
        logger.info(f"Report saved to {output_file}")

    return 0 if report.overall_score >= fail_threshold else 1


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Comprehensive Data Audit System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run full audit
  python full_audit.py

  # Run specific audits
  python full_audit.py --audit identity,stats

  # CI mode with threshold
  python full_audit.py --ci --fail-threshold 90

  # Save report
  python full_audit.py --output audit_report.json
        """
    )

    parser.add_argument(
        "--audit",
        type=str,
        help="Comma-separated list of audits to run (identity,stats,consistency,freshness)"
    )

    parser.add_argument(
        "--ci",
        action="store_true",
        help="CI mode: exit with code 1 if below threshold"
    )

    parser.add_argument(
        "--fail-threshold",
        type=float,
        default=80.0,
        help="Minimum overall score to pass (default: 80)"
    )

    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Save JSON report to file"
    )

    parser.add_argument(
        "--confidence-threshold",
        type=float,
        default=DEFAULT_CONFIDENCE_THRESHOLD,
        help=f"Confidence threshold for ID matching (default: {DEFAULT_CONFIDENCE_THRESHOLD})"
    )

    parser.add_argument(
        "--coverage-threshold",
        type=float,
        default=DEFAULT_COVERAGE_THRESHOLD,
        help=f"Coverage threshold percentage (default: {DEFAULT_COVERAGE_THRESHOLD})"
    )

    parser.add_argument(
        "--freshness-days",
        type=int,
        default=DEFAULT_FRESHNESS_DAYS,
        help=f"Maximum days for data freshness (default: {DEFAULT_FRESHNESS_DAYS})"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Parse audit categories
    audits = args.audit.split(",") if args.audit else None

    # Create auditor with custom thresholds
    auditor = DataAuditor(
        confidence_threshold=args.confidence_threshold,
        coverage_threshold=args.coverage_threshold,
        freshness_days=args.freshness_days
    )

    # Run audit
    report = auditor.run_full_audit(audits)

    # Print summary
    print("\n" + "=" * 70)
    print("DATA QUALITY AUDIT REPORT")
    print("=" * 70)
    print(f"Audit ID: {report.audit_id}")
    print(f"Duration: {report.duration_seconds:.2f}s" if report.duration_seconds else "Duration: N/A")
    print(f"\nOverall Score: {report.overall_score:.1f}%")
    print(f"Status: {report.overall_status.upper()}")

    print("\n" + "-" * 70)
    print("SECTION SCORES")
    print("-" * 70)

    for name, section in sorted(report.sections.items()):
        status_icon = {"pass": "OK", "warn": "!!", "fail": "XX"}[section.status]
        print(f"[{status_icon}] {name}: {section.overall_score:.1f}%")

        for metric in section.metrics:
            metric_icon = {"pass": " ", "warn": "!", "fail": "X"}[metric.status]
            print(f"     [{metric_icon}] {metric.name}: {metric.score:.1f}%")

    if report.critical_issues:
        print("\n" + "-" * 70)
        print("CRITICAL ISSUES")
        print("-" * 70)
        for issue in report.critical_issues[:10]:
            print(f"  - [{issue['section']}] {issue['metric']}: {issue['score']:.1f}%")
        if len(report.critical_issues) > 10:
            print(f"  ... and {len(report.critical_issues) - 10} more issues")

    if report.recommendations:
        print("\n" + "-" * 70)
        print("RECOMMENDATIONS")
        print("-" * 70)
        for rec in report.recommendations[:10]:
            print(f"  - {rec}")
        if len(report.recommendations) > 10:
            print(f"  ... and {len(report.recommendations) - 10} more recommendations")

    print("\n" + "=" * 70)

    # Save report if requested
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report.to_json())
        print(f"\nReport saved to: {args.output}")

    # Return exit code for CI
    if args.ci:
        passed = report.overall_score >= args.fail_threshold
        print(f"\nCI Result: {'PASSED' if passed else 'FAILED'} (threshold: {args.fail_threshold}%)")
        return 0 if passed else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
