#!/usr/bin/env python3
"""
Data Validation Pipeline

Provides comprehensive validation capabilities for the data pipeline:
- Pre-insert validation before database writes
- Post-build verification of exported data
- CI integration with exit codes and reports

Usage:
    # Pre-insert validation (from Python)
    from scripts.validation.validate import validate_pre_insert
    errors = validate_pre_insert("player", records_to_insert)

    # Post-build verification (from CLI)
    python validate.py --post-build

    # CI integration
    python validate.py --ci --report-file validation_report.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple, Type

# Path setup
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.validation.schemas import (
    PlayerSchema,
    PlayerIdentifierSchema,
    PlayerAliasSchema,
    NFLGameSchema,
    PlayerGameStatsSchema,
    PlayerSeasonStatsSchema,
    FantasyTeamSchema,
    TransactionSchema,
    LineupSchema,
    MatchupSchema,
    ValidationResult,
    ValidationError,
    validate_record,
    validate_batch,
    get_schema,
    SCHEMA_REGISTRY,
)

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
DATA_RAW_PATH = PROJECT_ROOT / "data_raw"


@dataclass
class ValidationReport:
    """Complete validation report for a validation run."""
    run_id: str
    run_type: Literal["pre_insert", "post_build", "ci"]
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None

    # Summary stats
    total_records: int = 0
    valid_records: int = 0
    invalid_records: int = 0
    warnings_count: int = 0

    # Results by category
    results_by_schema: Dict[str, Dict[str, int]] = field(default_factory=dict)

    # Detailed errors
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)

    # Overall status
    passed: bool = True
    exit_code: int = 0

    def add_schema_result(self, schema_name: str, valid: int, invalid: int, warnings: int) -> None:
        """Add results for a schema type."""
        self.results_by_schema[schema_name] = {
            "valid": valid,
            "invalid": invalid,
            "warnings": warnings
        }
        self.total_records += valid + invalid
        self.valid_records += valid
        self.invalid_records += invalid
        self.warnings_count += warnings

        if invalid > 0:
            self.passed = False
            self.exit_code = 1

    def finalize(self) -> None:
        """Finalize the report with completion time."""
        self.completed_at = datetime.now().isoformat()
        if self.started_at:
            start = datetime.fromisoformat(self.started_at)
            end = datetime.fromisoformat(self.completed_at)
            self.duration_seconds = (end - start).total_seconds()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, default=str)


class DataValidator:
    """
    Comprehensive data validator for the pipeline.

    Handles validation at multiple stages:
    - Pre-insert: Validate records before database insertion
    - Post-build: Verify exported data integrity
    - Database: Check existing database records
    """

    def __init__(
        self,
        players_db: Path = PLAYERS_DB_PATH,
        stats_db: Path = STATS_DB_PATH,
        league_db: Path = LEAGUE_DB_PATH,
        public_data: Path = PUBLIC_DATA_PATH,
        strict: bool = False
    ):
        self.players_db = players_db
        self.stats_db = stats_db
        self.league_db = league_db
        self.public_data = public_data
        self.strict = strict

    def _get_connection(self, db_path: Path) -> Optional[sqlite3.Connection]:
        """Get a database connection if the database exists."""
        if not db_path.exists():
            logger.warning(f"Database not found: {db_path}")
            return None
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        return conn

    # =========================================================================
    # Pre-Insert Validation
    # =========================================================================

    def validate_pre_insert(
        self,
        schema_name: str,
        records: List[Dict[str, Any]],
        stop_on_first_error: bool = False
    ) -> Tuple[List[ValidationResult], int, int]:
        """
        Validate records before database insertion.

        Args:
            schema_name: Name of the schema to validate against
            records: List of records to validate
            stop_on_first_error: Stop after first invalid record

        Returns:
            Tuple of (results, valid_count, invalid_count)
        """
        schema_class = get_schema(schema_name)
        if not schema_class:
            raise ValueError(f"Unknown schema: {schema_name}")

        return validate_batch(
            schema_class,
            records,
            stop_on_first_error=stop_on_first_error,
            strict=self.strict
        )

    def validate_player_insert(self, players: List[Dict[str, Any]]) -> Tuple[List[ValidationResult], int, int]:
        """Validate player records before insertion."""
        return self.validate_pre_insert("player", players)

    def validate_identifier_insert(self, identifiers: List[Dict[str, Any]]) -> Tuple[List[ValidationResult], int, int]:
        """Validate identifier records before insertion."""
        return self.validate_pre_insert("player_identifier", identifiers)

    def validate_game_stats_insert(self, stats: List[Dict[str, Any]]) -> Tuple[List[ValidationResult], int, int]:
        """Validate game stats records before insertion."""
        return self.validate_pre_insert("player_game_stats", stats)

    def validate_transaction_insert(self, transactions: List[Dict[str, Any]]) -> Tuple[List[ValidationResult], int, int]:
        """Validate transaction records before insertion."""
        return self.validate_pre_insert("transaction", transactions)

    # =========================================================================
    # Database Validation
    # =========================================================================

    def validate_players_database(self, limit: Optional[int] = None) -> ValidationReport:
        """
        Validate all player records in the database.

        Args:
            limit: Optional limit on number of records to validate

        Returns:
            ValidationReport with results
        """
        report = ValidationReport(
            run_id=f"players_db_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            run_type="post_build",
            started_at=datetime.now().isoformat()
        )

        conn = self._get_connection(self.players_db)
        if not conn:
            report.passed = False
            report.errors.append({"error": "Players database not found"})
            report.finalize()
            return report

        try:
            # Validate players table
            query = "SELECT * FROM players"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            players = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(PlayerSchema, players, strict=self.strict)
            report.add_schema_result("player", valid, invalid, sum(len(r.warnings) for r in results))

            for result in results:
                if not result.valid:
                    for error in result.errors:
                        report.errors.append({
                            "schema": "player",
                            "record_id": result.record_id,
                            "field": error.field,
                            "message": error.message,
                            "value": error.value
                        })

            # Validate player_identifiers table
            query = "SELECT * FROM player_identifiers"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            identifiers = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(PlayerIdentifierSchema, identifiers, strict=self.strict)
            report.add_schema_result("player_identifier", valid, invalid, sum(len(r.warnings) for r in results))

            for result in results:
                if not result.valid:
                    for error in result.errors:
                        report.errors.append({
                            "schema": "player_identifier",
                            "record_id": result.record_id,
                            "field": error.field,
                            "message": error.message,
                            "value": error.value
                        })

            # Validate player_aliases table
            query = "SELECT * FROM player_aliases"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            aliases = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(PlayerAliasSchema, aliases, strict=self.strict)
            report.add_schema_result("player_alias", valid, invalid, sum(len(r.warnings) for r in results))

        except sqlite3.Error as e:
            report.passed = False
            report.errors.append({"error": f"Database error: {e}"})
        finally:
            conn.close()

        report.finalize()
        return report

    def validate_stats_database(self, limit: Optional[int] = None) -> ValidationReport:
        """Validate all stats records in the database."""
        report = ValidationReport(
            run_id=f"stats_db_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            run_type="post_build",
            started_at=datetime.now().isoformat()
        )

        conn = self._get_connection(self.stats_db)
        if not conn:
            report.passed = False
            report.errors.append({"error": "Stats database not found"})
            report.finalize()
            return report

        try:
            # Validate nfl_games table
            query = "SELECT * FROM nfl_games"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            games = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(NFLGameSchema, games, strict=self.strict)
            report.add_schema_result("nfl_game", valid, invalid, sum(len(r.warnings) for r in results))

            for result in results:
                if not result.valid:
                    for error in result.errors:
                        report.errors.append({
                            "schema": "nfl_game",
                            "record_id": result.record_id,
                            "field": error.field,
                            "message": error.message
                        })

            # Validate player_game_stats table
            query = "SELECT * FROM player_game_stats WHERE is_current = 1"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            stats = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(PlayerGameStatsSchema, stats, strict=self.strict)
            report.add_schema_result("player_game_stats", valid, invalid, sum(len(r.warnings) for r in results))

        except sqlite3.Error as e:
            report.passed = False
            report.errors.append({"error": f"Database error: {e}"})
        finally:
            conn.close()

        report.finalize()
        return report

    def validate_league_database(self, limit: Optional[int] = None) -> ValidationReport:
        """Validate all league records in the database."""
        report = ValidationReport(
            run_id=f"league_db_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            run_type="post_build",
            started_at=datetime.now().isoformat()
        )

        conn = self._get_connection(self.league_db)
        if not conn:
            report.passed = False
            report.errors.append({"error": "League database not found"})
            report.finalize()
            return report

        try:
            # Validate unified_transactions table
            query = "SELECT * FROM unified_transactions"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            transactions = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(TransactionSchema, transactions, strict=self.strict)
            report.add_schema_result("transaction", valid, invalid, sum(len(r.warnings) for r in results))

            # Validate unified_lineups table
            query = "SELECT * FROM unified_lineups"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            lineups = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(LineupSchema, lineups, strict=self.strict)
            report.add_schema_result("lineup", valid, invalid, sum(len(r.warnings) for r in results))

            # Validate unified_matchups table
            query = "SELECT * FROM unified_matchups"
            if limit:
                query += f" LIMIT {limit}"

            cursor = conn.execute(query)
            matchups = [dict(row) for row in cursor.fetchall()]

            results, valid, invalid = validate_batch(MatchupSchema, matchups, strict=self.strict)
            report.add_schema_result("matchup", valid, invalid, sum(len(r.warnings) for r in results))

        except sqlite3.Error as e:
            report.passed = False
            report.errors.append({"error": f"Database error: {e}"})
        finally:
            conn.close()

        report.finalize()
        return report

    # =========================================================================
    # Post-Build Validation (Exported JSON)
    # =========================================================================

    def validate_public_data(self) -> ValidationReport:
        """
        Validate exported public data files.

        Checks:
        - Manifest exists and is valid
        - All referenced files exist
        - JSON files are valid and non-empty
        - Player IDs are consistent
        """
        report = ValidationReport(
            run_id=f"public_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            run_type="post_build",
            started_at=datetime.now().isoformat()
        )

        if not self.public_data.exists():
            report.passed = False
            report.errors.append({"error": f"Public data directory not found: {self.public_data}"})
            report.finalize()
            return report

        # Check manifest
        manifest_path = self.public_data / "manifest.json"
        if not manifest_path.exists():
            report.passed = False
            report.errors.append({"error": "manifest.json not found"})
            report.finalize()
            return report

        try:
            manifest = json.loads(manifest_path.read_text())
            report.add_schema_result("manifest", 1, 0, 0)
        except json.JSONDecodeError as e:
            report.passed = False
            report.errors.append({"error": f"Invalid manifest.json: {e}"})
            report.finalize()
            return report

        # Check players.json
        players_path = self.public_data / "players.json"
        if players_path.exists():
            try:
                players = json.loads(players_path.read_text())
                if isinstance(players, list):
                    report.add_schema_result("players_export", len(players), 0, 0)

                    # Validate player IDs
                    player_ids = set()
                    for player in players:
                        player_id = player.get("id") or player.get("player_uid")
                        if player_id:
                            if player_id in player_ids:
                                report.warnings.append({"warning": f"Duplicate player ID: {player_id}"})
                                report.warnings_count += 1
                            player_ids.add(player_id)
                else:
                    report.warnings.append({"warning": "players.json is not an array"})
            except json.JSONDecodeError as e:
                report.errors.append({"error": f"Invalid players.json: {e}"})
                report.passed = False
        else:
            report.warnings.append({"warning": "players.json not found"})

        # Check season directories
        seasons = manifest.get("seasons", [])
        for season in seasons:
            season_file = self.public_data / "season" / f"{season}.json"
            if not season_file.exists():
                # Try alternate path
                season_file = self.public_data / f"season/{season}.json"

            if season_file.exists():
                try:
                    data = json.loads(season_file.read_text())
                    report.add_schema_result(f"season_{season}", 1, 0, 0)
                except json.JSONDecodeError:
                    report.errors.append({"error": f"Invalid season/{season}.json"})
                    report.passed = False

        # Check weekly directories if they exist
        weekly_dir = self.public_data / "weekly"
        if weekly_dir.exists():
            for season_dir in weekly_dir.iterdir():
                if season_dir.is_dir():
                    week_files = list(season_dir.glob("week-*.json"))
                    valid_weeks = 0
                    invalid_weeks = 0
                    for week_file in week_files:
                        try:
                            json.loads(week_file.read_text())
                            valid_weeks += 1
                        except json.JSONDecodeError:
                            invalid_weeks += 1
                            report.errors.append({"error": f"Invalid {week_file}"})
                    report.add_schema_result(f"weekly_{season_dir.name}", valid_weeks, invalid_weeks, 0)

        report.finalize()
        return report

    # =========================================================================
    # CI Integration
    # =========================================================================

    def run_ci_validation(
        self,
        validate_databases: bool = True,
        validate_public: bool = True,
        limit: Optional[int] = None
    ) -> ValidationReport:
        """
        Run full CI validation suite.

        Returns report with exit code for CI systems.
        """
        report = ValidationReport(
            run_id=f"ci_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            run_type="ci",
            started_at=datetime.now().isoformat()
        )

        if validate_databases:
            # Validate players database
            if self.players_db.exists():
                players_report = self.validate_players_database(limit)
                for schema, counts in players_report.results_by_schema.items():
                    report.add_schema_result(f"db_players_{schema}", counts["valid"], counts["invalid"], counts["warnings"])
                report.errors.extend(players_report.errors)

            # Validate stats database
            if self.stats_db.exists():
                stats_report = self.validate_stats_database(limit)
                for schema, counts in stats_report.results_by_schema.items():
                    report.add_schema_result(f"db_stats_{schema}", counts["valid"], counts["invalid"], counts["warnings"])
                report.errors.extend(stats_report.errors)

            # Validate league database
            if self.league_db.exists():
                league_report = self.validate_league_database(limit)
                for schema, counts in league_report.results_by_schema.items():
                    report.add_schema_result(f"db_league_{schema}", counts["valid"], counts["invalid"], counts["warnings"])
                report.errors.extend(league_report.errors)

        if validate_public:
            public_report = self.validate_public_data()
            for schema, counts in public_report.results_by_schema.items():
                report.add_schema_result(f"public_{schema}", counts["valid"], counts["invalid"], counts["warnings"])
            report.errors.extend(public_report.errors)
            report.warnings.extend(public_report.warnings)

        report.finalize()
        return report


# =============================================================================
# Convenience Functions
# =============================================================================

def validate_pre_insert(
    schema_name: str,
    records: List[Dict[str, Any]],
    strict: bool = False
) -> List[ValidationError]:
    """
    Validate records before database insertion.

    Args:
        schema_name: Name of the schema (player, player_identifier, etc.)
        records: List of records to validate
        strict: Treat warnings as errors

    Returns:
        List of validation errors (empty if all valid)
    """
    validator = DataValidator(strict=strict)
    results, valid, invalid = validator.validate_pre_insert(schema_name, records)

    errors = []
    for result in results:
        errors.extend(result.errors)
        if strict:
            for warning in result.warnings:
                errors.append(ValidationError(
                    field=warning.field,
                    message=f"[Warning] {warning.message}",
                    value=warning.value
                ))

    return errors


def validate_post_build(
    public_data_path: Path = PUBLIC_DATA_PATH
) -> ValidationReport:
    """
    Run post-build validation on exported data.

    Args:
        public_data_path: Path to public data directory

    Returns:
        ValidationReport with results
    """
    validator = DataValidator(public_data=public_data_path)
    return validator.validate_public_data()


def run_ci_validation(
    report_file: Optional[Path] = None,
    validate_databases: bool = True,
    validate_public: bool = True,
    limit: Optional[int] = None
) -> int:
    """
    Run CI validation and optionally save report.

    Args:
        report_file: Optional path to save JSON report
        validate_databases: Whether to validate databases
        validate_public: Whether to validate public data
        limit: Limit records per table (for quick checks)

    Returns:
        Exit code (0 = success, 1 = validation errors)
    """
    validator = DataValidator()
    report = validator.run_ci_validation(
        validate_databases=validate_databases,
        validate_public=validate_public,
        limit=limit
    )

    if report_file:
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(report.to_json())
        logger.info(f"Report saved to {report_file}")

    return report.exit_code


# =============================================================================
# CLI
# =============================================================================

def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Data Validation Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run full CI validation
  python validate.py --ci

  # Validate only public data
  python validate.py --post-build

  # Validate databases only (quick check)
  python validate.py --ci --no-public --limit 1000

  # Save report to file
  python validate.py --ci --report-file validation_report.json
        """
    )

    parser.add_argument(
        "--ci",
        action="store_true",
        help="Run full CI validation suite"
    )

    parser.add_argument(
        "--post-build",
        action="store_true",
        help="Validate post-build public data only"
    )

    parser.add_argument(
        "--validate-db",
        choices=["players", "stats", "league", "all"],
        help="Validate specific database"
    )

    parser.add_argument(
        "--no-public",
        action="store_true",
        help="Skip public data validation"
    )

    parser.add_argument(
        "--no-db",
        action="store_true",
        help="Skip database validation"
    )

    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors"
    )

    parser.add_argument(
        "--limit",
        type=int,
        help="Limit records per table (for quick checks)"
    )

    parser.add_argument(
        "--report-file",
        type=Path,
        help="Save JSON report to file"
    )

    parser.add_argument(
        "--public-data",
        type=Path,
        default=PUBLIC_DATA_PATH,
        help=f"Path to public data directory (default: {PUBLIC_DATA_PATH})"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    validator = DataValidator(
        public_data=args.public_data,
        strict=args.strict
    )

    report = None

    if args.post_build:
        # Post-build validation only
        report = validator.validate_public_data()

    elif args.validate_db:
        # Specific database validation
        if args.validate_db == "players":
            report = validator.validate_players_database(args.limit)
        elif args.validate_db == "stats":
            report = validator.validate_stats_database(args.limit)
        elif args.validate_db == "league":
            report = validator.validate_league_database(args.limit)
        elif args.validate_db == "all":
            report = validator.run_ci_validation(
                validate_databases=True,
                validate_public=False,
                limit=args.limit
            )

    elif args.ci:
        # Full CI validation
        report = validator.run_ci_validation(
            validate_databases=not args.no_db,
            validate_public=not args.no_public,
            limit=args.limit
        )

    else:
        # Default: run CI validation
        report = validator.run_ci_validation(
            validate_databases=not args.no_db,
            validate_public=not args.no_public,
            limit=args.limit
        )

    # Print summary
    print("\n" + "=" * 60)
    print("VALIDATION REPORT")
    print("=" * 60)
    print(f"Run ID: {report.run_id}")
    print(f"Duration: {report.duration_seconds:.2f}s" if report.duration_seconds else "Duration: N/A")
    print(f"\nTotal records: {report.total_records}")
    print(f"Valid: {report.valid_records}")
    print(f"Invalid: {report.invalid_records}")
    print(f"Warnings: {report.warnings_count}")

    print("\nResults by schema:")
    for schema, counts in sorted(report.results_by_schema.items()):
        status = "PASS" if counts["invalid"] == 0 else "FAIL"
        print(f"  {schema}: {counts['valid']} valid, {counts['invalid']} invalid [{status}]")

    if report.errors:
        print(f"\nErrors ({len(report.errors)}):")
        for error in report.errors[:20]:  # Limit output
            print(f"  - {error}")
        if len(report.errors) > 20:
            print(f"  ... and {len(report.errors) - 20} more errors")

    if report.warnings:
        print(f"\nWarnings ({len(report.warnings)}):")
        for warning in report.warnings[:10]:
            print(f"  - {warning}")
        if len(report.warnings) > 10:
            print(f"  ... and {len(report.warnings) - 10} more warnings")

    print("\n" + "=" * 60)
    print(f"RESULT: {'PASSED' if report.passed else 'FAILED'}")
    print("=" * 60)

    # Save report if requested
    if args.report_file:
        args.report_file.parent.mkdir(parents=True, exist_ok=True)
        args.report_file.write_text(report.to_json())
        print(f"\nReport saved to: {args.report_file}")

    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
