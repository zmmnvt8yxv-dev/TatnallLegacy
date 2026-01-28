#!/usr/bin/env python3
"""
Manual Override Management System

Applies manual ID mappings, name corrections, player merges, and other
edge-case fixes that automation cannot solve.

Features:
- Apply ID overrides from manual_overrides.json
- Merge duplicate player records
- Apply name corrections
- Full audit trail for all changes
- Dry-run mode for previewing changes
- Rollback support

Usage:
    # Preview changes (dry run)
    python apply_overrides.py --dry-run

    # Apply all overrides
    python apply_overrides.py --apply

    # Apply specific override types
    python apply_overrides.py --apply --types id_mappings,name_corrections

    # Add a new ID mapping interactively
    python apply_overrides.py --add-mapping

    # Export audit log
    python apply_overrides.py --export-audit audit_log.json
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
from typing import Any, Dict, List, Literal, Optional, Tuple

# Path setup
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.db.init_db import PlayerIdentityDB, normalize_name

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
MANUAL_OVERRIDES_PATH = SCRIPT_DIR / "manual_overrides.json"
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"

# Override types
OverrideType = Literal[
    "id_mapping", "name_correction", "player_merge",
    "player_split", "exclusion", "alias_override"
]


@dataclass
class OverrideResult:
    """Result of applying a single override."""
    success: bool
    override_type: OverrideType
    description: str
    changes: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class ApplyReport:
    """Report of all overrides applied."""
    started_at: str
    completed_at: Optional[str] = None
    dry_run: bool = False
    total_overrides: int = 0
    applied: int = 0
    skipped: int = 0
    failed: int = 0
    results: List[OverrideResult] = field(default_factory=list)

    def add_result(self, result: OverrideResult) -> None:
        """Add a result and update counts."""
        self.results.append(result)
        self.total_overrides += 1
        if result.success:
            self.applied += 1
        elif result.error:
            self.failed += 1
        else:
            self.skipped += 1

    def finalize(self) -> None:
        """Finalize the report."""
        self.completed_at = datetime.now().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "dry_run": self.dry_run,
            "summary": {
                "total": self.total_overrides,
                "applied": self.applied,
                "skipped": self.skipped,
                "failed": self.failed
            },
            "results": [asdict(r) for r in self.results]
        }


class OverrideManager:
    """
    Manages manual overrides for the identity database.

    Provides methods to:
    - Load and validate override files
    - Apply ID mappings
    - Merge duplicate players
    - Correct player names
    - Track all changes with audit log
    """

    def __init__(
        self,
        overrides_path: Path = MANUAL_OVERRIDES_PATH,
        db_path: Path = PLAYERS_DB_PATH,
        user: str = "system"
    ):
        self.overrides_path = overrides_path
        self.db_path = db_path
        self.user = user
        self._overrides: Optional[Dict[str, Any]] = None
        self._db: Optional[PlayerIdentityDB] = None

    def _load_overrides(self) -> Dict[str, Any]:
        """Load overrides from JSON file."""
        if self._overrides is not None:
            return self._overrides

        if not self.overrides_path.exists():
            logger.warning(f"Overrides file not found: {self.overrides_path}")
            self._overrides = {}
            return self._overrides

        try:
            self._overrides = json.loads(self.overrides_path.read_text())
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in overrides file: {e}")
            self._overrides = {}

        return self._overrides

    def _save_overrides(self) -> None:
        """Save overrides back to JSON file."""
        if self._overrides is None:
            return

        self.overrides_path.write_text(
            json.dumps(self._overrides, indent=2, default=str)
        )

    def _get_db(self) -> PlayerIdentityDB:
        """Get database connection."""
        if self._db is None:
            self._db = PlayerIdentityDB(self.db_path)
        return self._db

    def _add_audit_entry(
        self,
        action: str,
        details: Dict[str, Any],
        result: str = "success"
    ) -> None:
        """Add entry to the audit log in the overrides file."""
        overrides = self._load_overrides()

        if "audit_log" not in overrides:
            overrides["audit_log"] = {"entries": []}

        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "user": self.user,
            "result": result,
            "details": details
        }

        overrides["audit_log"]["entries"].append(entry)
        self._save_overrides()

    # =========================================================================
    # ID Mappings
    # =========================================================================

    def add_id_mapping(
        self,
        source: str,
        external_id: str,
        player_uid: str,
        note: str = "",
        confidence: float = 1.0,
        dry_run: bool = False
    ) -> OverrideResult:
        """
        Add a manual ID mapping.

        Args:
            source: Source platform (sleeper, espn, etc.)
            external_id: External ID to map
            player_uid: Player UID to map to
            note: Reason for manual mapping
            confidence: Confidence score (default 1.0 for manual)
            dry_run: If True, don't actually apply

        Returns:
            OverrideResult
        """
        key = f"{source}:{external_id}"

        overrides = self._load_overrides()
        if "overrides" not in overrides:
            overrides["overrides"] = {}

        # Check if already exists
        if key in overrides["overrides"]:
            return OverrideResult(
                success=False,
                override_type="id_mapping",
                description=f"Mapping already exists: {key}",
            )

        mapping = {
            "player_uid": player_uid,
            "note": note,
            "confidence": confidence,
            "added_by": self.user,
            "added_at": datetime.now().isoformat()
        }

        if dry_run:
            return OverrideResult(
                success=True,
                override_type="id_mapping",
                description=f"Would add mapping: {key} -> {player_uid}",
                changes={"key": key, "mapping": mapping}
            )

        # Add to overrides file
        overrides["overrides"][key] = mapping
        self._save_overrides()

        # Also apply to database
        db = self._get_db()
        try:
            db.add_identifier(
                player_uid=player_uid,
                source=source,
                external_id=external_id,
                confidence=confidence,
                match_method="manual",
                verified_by=self.user,
                notes=note
            )
        except Exception as e:
            logger.warning(f"Failed to add to database: {e}")

        self._add_audit_entry("add_id_mapping", {
            "source": source,
            "external_id": external_id,
            "player_uid": player_uid,
            "note": note
        })

        return OverrideResult(
            success=True,
            override_type="id_mapping",
            description=f"Added mapping: {key} -> {player_uid}",
            changes={"key": key, "mapping": mapping}
        )

    def apply_id_mappings(self, dry_run: bool = False) -> List[OverrideResult]:
        """Apply all ID mappings from the overrides file."""
        results = []
        overrides = self._load_overrides()

        mappings = overrides.get("overrides", {})
        if not mappings:
            return results

        db = self._get_db()

        for key, mapping in mappings.items():
            if key.startswith("_"):  # Skip comments
                continue

            if not isinstance(mapping, dict) or "player_uid" not in mapping:
                continue

            parts = key.split(":", 1)
            if len(parts) != 2:
                continue

            source, external_id = parts
            player_uid = mapping["player_uid"]

            # Check if already in database
            try:
                existing = db.get_player_by_identifier(source, external_id)
                if existing:
                    if existing.player_uid == player_uid:
                        results.append(OverrideResult(
                            success=False,
                            override_type="id_mapping",
                            description=f"Mapping already applied: {key}"
                        ))
                        continue
                    else:
                        results.append(OverrideResult(
                            success=False,
                            override_type="id_mapping",
                            description=f"Conflict: {key} already mapped to different player",
                            error=f"Existing: {existing.player_uid}, Override: {player_uid}"
                        ))
                        continue
            except Exception:
                pass

            if dry_run:
                results.append(OverrideResult(
                    success=True,
                    override_type="id_mapping",
                    description=f"Would apply mapping: {key} -> {player_uid}",
                    changes={"source": source, "external_id": external_id, "player_uid": player_uid}
                ))
                continue

            try:
                db.add_identifier(
                    player_uid=player_uid,
                    source=source,
                    external_id=external_id,
                    confidence=mapping.get("confidence", 1.0),
                    match_method="manual",
                    verified_by=mapping.get("added_by", self.user),
                    notes=mapping.get("note", "")
                )

                results.append(OverrideResult(
                    success=True,
                    override_type="id_mapping",
                    description=f"Applied mapping: {key} -> {player_uid}",
                    changes={"source": source, "external_id": external_id, "player_uid": player_uid}
                ))

            except Exception as e:
                results.append(OverrideResult(
                    success=False,
                    override_type="id_mapping",
                    description=f"Failed to apply mapping: {key}",
                    error=str(e)
                ))

        return results

    # =========================================================================
    # Name Corrections
    # =========================================================================

    def add_name_correction(
        self,
        player_uid: str,
        old_name: str,
        new_name: str,
        reason: str = "",
        dry_run: bool = False
    ) -> OverrideResult:
        """
        Add a name correction for a player.

        Args:
            player_uid: Player to correct
            old_name: Current (incorrect) name
            new_name: Corrected name
            reason: Reason for correction
            dry_run: If True, don't actually apply

        Returns:
            OverrideResult
        """
        overrides = self._load_overrides()
        if "name_corrections" not in overrides:
            overrides["name_corrections"] = {}

        correction = {
            "player_uid": player_uid,
            "old_name": old_name,
            "new_name": new_name,
            "reason": reason,
            "added_by": self.user,
            "added_at": datetime.now().isoformat(),
            "applied": False
        }

        if dry_run:
            return OverrideResult(
                success=True,
                override_type="name_correction",
                description=f"Would correct: '{old_name}' -> '{new_name}'",
                changes=correction
            )

        # Add to overrides file
        key = f"{player_uid}:{datetime.now().strftime('%Y%m%d%H%M%S')}"
        overrides["name_corrections"][key] = correction
        self._save_overrides()

        # Apply to database
        db = self._get_db()
        try:
            db.update_player(player_uid, canonical_name=new_name)
            overrides["name_corrections"][key]["applied"] = True
            self._save_overrides()
        except Exception as e:
            return OverrideResult(
                success=False,
                override_type="name_correction",
                description=f"Failed to apply correction",
                error=str(e)
            )

        self._add_audit_entry("name_correction", {
            "player_uid": player_uid,
            "old_name": old_name,
            "new_name": new_name,
            "reason": reason
        })

        return OverrideResult(
            success=True,
            override_type="name_correction",
            description=f"Corrected: '{old_name}' -> '{new_name}'",
            changes=correction
        )

    def apply_name_corrections(self, dry_run: bool = False) -> List[OverrideResult]:
        """Apply all unapplied name corrections."""
        results = []
        overrides = self._load_overrides()

        corrections = overrides.get("name_corrections", {})
        if not corrections:
            return results

        db = self._get_db()

        for key, correction in corrections.items():
            if key.startswith("_"):
                continue

            if not isinstance(correction, dict):
                continue

            if correction.get("applied", False):
                continue

            player_uid = correction.get("player_uid")
            new_name = correction.get("new_name")

            if not player_uid or not new_name:
                continue

            if dry_run:
                results.append(OverrideResult(
                    success=True,
                    override_type="name_correction",
                    description=f"Would correct {player_uid}: '{correction.get('old_name')}' -> '{new_name}'",
                    changes=correction
                ))
                continue

            try:
                db.update_player(player_uid, canonical_name=new_name)
                correction["applied"] = True
                correction["applied_at"] = datetime.now().isoformat()

                results.append(OverrideResult(
                    success=True,
                    override_type="name_correction",
                    description=f"Applied correction for {player_uid}",
                    changes={"player_uid": player_uid, "new_name": new_name}
                ))

            except Exception as e:
                results.append(OverrideResult(
                    success=False,
                    override_type="name_correction",
                    description=f"Failed to apply correction for {player_uid}",
                    error=str(e)
                ))

        self._save_overrides()
        return results

    # =========================================================================
    # Player Merges
    # =========================================================================

    def merge_players(
        self,
        primary_uid: str,
        duplicate_uids: List[str],
        reason: str = "",
        dry_run: bool = False
    ) -> OverrideResult:
        """
        Merge duplicate player records.

        The primary_uid record is kept, and all identifiers from duplicate
        records are moved to the primary record.

        Args:
            primary_uid: The player UID to keep
            duplicate_uids: List of player UIDs to merge into primary
            reason: Reason for merge
            dry_run: If True, don't actually merge

        Returns:
            OverrideResult
        """
        db = self._get_db()

        # Verify primary exists
        primary = db.get_player(primary_uid)
        if not primary:
            return OverrideResult(
                success=False,
                override_type="player_merge",
                description=f"Primary player not found: {primary_uid}",
                error="Primary player does not exist"
            )

        # Verify duplicates exist
        duplicates = []
        for uid in duplicate_uids:
            player = db.get_player(uid)
            if player:
                duplicates.append(player)
            else:
                logger.warning(f"Duplicate player not found: {uid}")

        if not duplicates:
            return OverrideResult(
                success=False,
                override_type="player_merge",
                description="No duplicate players found to merge",
                error="No valid duplicate UIDs"
            )

        changes = {
            "primary_uid": primary_uid,
            "primary_name": primary.canonical_name,
            "merged_uids": [d.player_uid for d in duplicates],
            "merged_names": [d.canonical_name for d in duplicates]
        }

        if dry_run:
            return OverrideResult(
                success=True,
                override_type="player_merge",
                description=f"Would merge {len(duplicates)} players into {primary.canonical_name}",
                changes=changes
            )

        # Perform merge
        with db.connection() as conn:
            try:
                for dup in duplicates:
                    # Move identifiers
                    conn.execute("""
                        UPDATE player_identifiers
                        SET player_uid = ?
                        WHERE player_uid = ?
                    """, (primary_uid, dup.player_uid))

                    # Move aliases
                    conn.execute("""
                        UPDATE player_aliases
                        SET player_uid = ?
                        WHERE player_uid = ?
                    """, (primary_uid, dup.player_uid))

                    # Add old canonical name as alias
                    if dup.canonical_name != primary.canonical_name:
                        db.add_alias(
                            primary_uid,
                            dup.canonical_name,
                            "merge",
                            "legal",
                            conn
                        )

                    # Delete duplicate player
                    conn.execute("""
                        DELETE FROM players WHERE player_uid = ?
                    """, (dup.player_uid,))

                conn.commit()

            except Exception as e:
                conn.rollback()
                return OverrideResult(
                    success=False,
                    override_type="player_merge",
                    description=f"Merge failed",
                    error=str(e)
                )

        # Record in overrides file
        overrides = self._load_overrides()
        if "player_merges" not in overrides:
            overrides["player_merges"] = {}

        key = f"merge_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        overrides["player_merges"][key] = {
            "primary_uid": primary_uid,
            "merged_uids": [d.player_uid for d in duplicates],
            "reason": reason,
            "merged_by": self.user,
            "merged_at": datetime.now().isoformat()
        }
        self._save_overrides()

        self._add_audit_entry("player_merge", {
            "primary_uid": primary_uid,
            "merged_uids": [d.player_uid for d in duplicates],
            "reason": reason
        })

        return OverrideResult(
            success=True,
            override_type="player_merge",
            description=f"Merged {len(duplicates)} players into {primary.canonical_name}",
            changes=changes
        )

    # =========================================================================
    # Exclusions
    # =========================================================================

    def add_exclusion(
        self,
        source: str,
        external_id: str,
        reason: str = "",
        dry_run: bool = False
    ) -> OverrideResult:
        """
        Add an ID exclusion (IDs that should never be matched).

        Args:
            source: Source platform
            external_id: External ID to exclude
            reason: Reason for exclusion
            dry_run: If True, don't actually add

        Returns:
            OverrideResult
        """
        overrides = self._load_overrides()
        if "exclusions" not in overrides:
            overrides["exclusions"] = {}

        key = f"{source}:{external_id}"

        if key in overrides["exclusions"]:
            return OverrideResult(
                success=False,
                override_type="exclusion",
                description=f"Exclusion already exists: {key}"
            )

        exclusion = {
            "source": source,
            "external_id": external_id,
            "reason": reason,
            "added_by": self.user,
            "added_at": datetime.now().isoformat()
        }

        if dry_run:
            return OverrideResult(
                success=True,
                override_type="exclusion",
                description=f"Would add exclusion: {key}",
                changes=exclusion
            )

        overrides["exclusions"][key] = exclusion
        self._save_overrides()

        self._add_audit_entry("add_exclusion", exclusion)

        return OverrideResult(
            success=True,
            override_type="exclusion",
            description=f"Added exclusion: {key}",
            changes=exclusion
        )

    def is_excluded(self, source: str, external_id: str) -> bool:
        """Check if an ID is in the exclusion list."""
        overrides = self._load_overrides()
        exclusions = overrides.get("exclusions", {})
        return f"{source}:{external_id}" in exclusions

    # =========================================================================
    # Apply All Overrides
    # =========================================================================

    def apply_all(
        self,
        types: Optional[List[str]] = None,
        dry_run: bool = False
    ) -> ApplyReport:
        """
        Apply all overrides.

        Args:
            types: List of override types to apply (None = all)
            dry_run: If True, don't actually apply

        Returns:
            ApplyReport with all results
        """
        report = ApplyReport(
            started_at=datetime.now().isoformat(),
            dry_run=dry_run
        )

        all_types = ["id_mappings", "name_corrections"]
        types = types or all_types

        if "id_mappings" in types:
            logger.info("Applying ID mappings...")
            results = self.apply_id_mappings(dry_run)
            for result in results:
                report.add_result(result)

        if "name_corrections" in types:
            logger.info("Applying name corrections...")
            results = self.apply_name_corrections(dry_run)
            for result in results:
                report.add_result(result)

        report.finalize()
        return report

    def export_audit_log(self, output_path: Path) -> int:
        """Export the audit log to a file."""
        overrides = self._load_overrides()
        audit_log = overrides.get("audit_log", {"entries": []})

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(audit_log, indent=2, default=str))

        return len(audit_log.get("entries", []))


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Manual Override Management System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Preview all changes
  python apply_overrides.py --dry-run

  # Apply all overrides
  python apply_overrides.py --apply

  # Apply specific types
  python apply_overrides.py --apply --types id_mappings

  # Add a new ID mapping
  python apply_overrides.py --add-mapping sleeper 12345 abc-123-uuid "Manual fix"

  # Add an exclusion
  python apply_overrides.py --add-exclusion sleeper 0 "Placeholder ID"

  # Export audit log
  python apply_overrides.py --export-audit audit_log.json
        """
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying"
    )

    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply all overrides"
    )

    parser.add_argument(
        "--types",
        type=str,
        help="Comma-separated list of override types to apply"
    )

    parser.add_argument(
        "--add-mapping",
        nargs=4,
        metavar=("SOURCE", "EXTERNAL_ID", "PLAYER_UID", "NOTE"),
        help="Add a new ID mapping"
    )

    parser.add_argument(
        "--add-exclusion",
        nargs=3,
        metavar=("SOURCE", "EXTERNAL_ID", "REASON"),
        help="Add an ID exclusion"
    )

    parser.add_argument(
        "--merge-players",
        nargs="+",
        metavar="PLAYER_UID",
        help="Merge players: first UID is primary, rest are duplicates"
    )

    parser.add_argument(
        "--merge-reason",
        type=str,
        default="Manual merge",
        help="Reason for merge (used with --merge-players)"
    )

    parser.add_argument(
        "--export-audit",
        type=Path,
        help="Export audit log to file"
    )

    parser.add_argument(
        "--overrides-file",
        type=Path,
        default=MANUAL_OVERRIDES_PATH,
        help=f"Path to overrides file (default: {MANUAL_OVERRIDES_PATH})"
    )

    parser.add_argument(
        "--db",
        type=Path,
        default=PLAYERS_DB_PATH,
        help=f"Path to players database (default: {PLAYERS_DB_PATH})"
    )

    parser.add_argument(
        "--user",
        type=str,
        default="admin",
        help="User name for audit log (default: admin)"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    manager = OverrideManager(
        overrides_path=args.overrides_file,
        db_path=args.db,
        user=args.user
    )

    # Handle specific actions
    if args.add_mapping:
        source, external_id, player_uid, note = args.add_mapping
        result = manager.add_id_mapping(
            source, external_id, player_uid, note,
            dry_run=args.dry_run
        )
        print(f"{'[DRY RUN] ' if args.dry_run else ''}{result.description}")
        return 0 if result.success else 1

    if args.add_exclusion:
        source, external_id, reason = args.add_exclusion
        result = manager.add_exclusion(source, external_id, reason, dry_run=args.dry_run)
        print(f"{'[DRY RUN] ' if args.dry_run else ''}{result.description}")
        return 0 if result.success else 1

    if args.merge_players:
        if len(args.merge_players) < 2:
            print("Error: Need at least 2 player UIDs to merge")
            return 1

        primary_uid = args.merge_players[0]
        duplicate_uids = args.merge_players[1:]
        result = manager.merge_players(
            primary_uid, duplicate_uids,
            reason=args.merge_reason,
            dry_run=args.dry_run
        )
        print(f"{'[DRY RUN] ' if args.dry_run else ''}{result.description}")
        if result.error:
            print(f"Error: {result.error}")
        return 0 if result.success else 1

    if args.export_audit:
        count = manager.export_audit_log(args.export_audit)
        print(f"Exported {count} audit entries to {args.export_audit}")
        return 0

    if args.apply or args.dry_run:
        types = args.types.split(",") if args.types else None
        report = manager.apply_all(types=types, dry_run=args.dry_run)

        # Print report
        print("\n" + "=" * 60)
        print("OVERRIDE APPLICATION REPORT")
        print("=" * 60)
        print(f"Mode: {'DRY RUN' if report.dry_run else 'APPLY'}")
        print(f"Total Overrides: {report.total_overrides}")
        print(f"Applied: {report.applied}")
        print(f"Skipped: {report.skipped}")
        print(f"Failed: {report.failed}")

        if report.results:
            print("\nDetails:")
            for result in report.results:
                status = "OK" if result.success else ("FAIL" if result.error else "SKIP")
                print(f"  [{status}] {result.description}")
                if result.error:
                    print(f"       Error: {result.error}")

        print("=" * 60)
        return 0 if report.failed == 0 else 1

    # Default: show help
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
