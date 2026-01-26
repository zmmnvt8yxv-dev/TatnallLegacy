#!/usr/bin/env python3
"""
Unified Transaction Model (Phase 3, Task 3.1)

Normalizes ESPN + Sleeper transactions with player_uid resolution.

Features:
    - Map all player references to player_uid
    - Normalize transaction types across platforms
    - Handle trade grouping (same trade, multiple parties)
    - Preserve original source data for audit

Usage:
    # Process all available seasons
    python unify_transactions.py --all

    # Process specific season
    python unify_transactions.py --season 2024

    # Process specific source
    python unify_transactions.py --source sleeper --season 2025

    # Dry run (no database writes)
    python unify_transactions.py --season 2024 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

# Path setup for imports
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from lib.player_lookup import (
    resolve,
    batch_resolve,
    get_canonical_name,
    configure as configure_player_lookup
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
DATA_DIR = PROJECT_ROOT / "data"
DATA_RAW_DIR = PROJECT_ROOT / "data_raw"
LEAGUE_DB_PATH = PROJECT_ROOT / "db" / "league.sqlite"
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
SCHEMA_PATH = SCRIPT_DIR.parent / "db" / "league_schema.sql"

# Transaction type mappings
SLEEPER_TYPE_MAP = {
    "waiver": "waiver",
    "free_agent": "add",
    "trade": "trade",
    "commissioner": "commissioner",
}

ESPN_TYPE_MAP = {
    "ADD": "add",
    "DROP": "drop",
    "WAIVER": "waiver",
    "TRADE": "trade",
    "FREEAGENT": "add",
}


@dataclass
class UnifiedTransaction:
    """Represents a normalized transaction."""
    transaction_id: str
    season: int
    week: int
    transaction_type: str
    status: str
    team_id: str
    team_name: Optional[str]
    player_uid: Optional[str]
    action: str  # 'added' or 'dropped'
    trade_group_id: Optional[str] = None
    trade_partner_team_id: Optional[str] = None
    waiver_bid: Optional[int] = None
    waiver_priority: Optional[int] = None
    draft_picks_json: Optional[str] = None
    transaction_timestamp: Optional[int] = None
    processed_at: Optional[str] = None
    source: str = "unknown"
    source_league_id: Optional[str] = None
    source_transaction_id: Optional[str] = None
    source_data_json: Optional[str] = None
    source_player_id: Optional[str] = None
    resolution_confidence: Optional[float] = None
    resolution_method: Optional[str] = None


class TransactionUnifier:
    """
    Unifies transactions from multiple fantasy platforms.

    Handles normalization of transaction types, player ID resolution,
    and trade grouping across ESPN and Sleeper data sources.
    """

    def __init__(
        self,
        league_db_path: Path = LEAGUE_DB_PATH,
        players_db_path: Path = PLAYERS_DB_PATH,
        dry_run: bool = False
    ):
        self.league_db_path = league_db_path
        self.players_db_path = players_db_path
        self.dry_run = dry_run

        # Stats tracking
        self.stats = {
            "transactions_processed": 0,
            "transactions_inserted": 0,
            "transactions_updated": 0,
            "transactions_skipped": 0,
            "players_resolved": 0,
            "players_unresolved": 0,
            "errors": []
        }

        # Cache for team name lookups
        self._team_cache: Dict[str, Dict[str, str]] = {}

        # Configure player lookup
        if players_db_path.exists():
            configure_player_lookup(players_db_path)

    def _get_league_connection(self) -> sqlite3.Connection:
        """Get connection to league database."""
        conn = sqlite3.connect(str(self.league_db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_league_db(self) -> None:
        """Initialize league database with schema if needed."""
        if not self.league_db_path.exists():
            self.league_db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = self._get_league_connection()
        try:
            # Check if schema is already initialized
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'"
            )
            if cursor.fetchone() is None:
                # Need to initialize - run schema SQL
                if SCHEMA_PATH.exists():
                    schema_sql = SCHEMA_PATH.read_text()
                    conn.executescript(schema_sql)
                    conn.commit()
                    logger.info(f"Initialized league database at {self.league_db_path}")
                else:
                    # Create minimal schema_meta table
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS schema_meta (
                            key TEXT PRIMARY KEY,
                            value TEXT NOT NULL,
                            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                        )
                    """)
                    if SCHEMA_PATH.exists():
                        conn.executescript(SCHEMA_PATH.read_text())
                    conn.commit()
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Sleeper Transaction Processing
    # -------------------------------------------------------------------------

    def _load_sleeper_teams(self, season: int) -> Dict[str, Dict[str, Any]]:
        """Load team data from Sleeper for a season."""
        # Try trades file first (has team info)
        trades_path = DATA_DIR / f"trades-{season}.json"
        if trades_path.exists():
            data = json.loads(trades_path.read_text())
            teams = data.get("teams", [])
            return {
                str(t.get("roster_id")): {
                    "team_name": t.get("team"),
                    "owner_id": t.get("owner_id"),
                    "owner_name": t.get("owner_name")
                }
                for t in teams
            }

        # Fallback to season file
        season_path = DATA_DIR / f"{season}.json"
        if season_path.exists():
            data = json.loads(season_path.read_text())
            teams = data.get("teams", [])
            return {
                str(t.get("team_id", t.get("roster_id"))): {
                    "team_name": t.get("team_name", t.get("team")),
                    "owner_id": t.get("owner_id"),
                    "owner_name": t.get("owner_name")
                }
                for t in teams
            }

        return {}

    def _process_sleeper_transactions(
        self,
        season: int,
        transactions_data: List[Dict[str, Any]],
        league_id: str,
        teams: Dict[str, Dict[str, Any]]
    ) -> List[UnifiedTransaction]:
        """Process Sleeper transactions into unified format."""
        unified = []

        for tx in transactions_data:
            try:
                tx_id = tx.get("transaction_id", str(uuid.uuid4()))
                tx_type = tx.get("type", "unknown")
                status = tx.get("status", "complete")
                week = tx.get("week", tx.get("leg", 1))
                created = tx.get("created")

                # Normalize status
                if status == "complete":
                    norm_status = "complete"
                elif status == "failed":
                    norm_status = "failed"
                else:
                    norm_status = status

                # Normalize type
                norm_type = SLEEPER_TYPE_MAP.get(tx_type, tx_type)

                # Get waiver details
                settings = tx.get("settings", {})
                waiver_bid = settings.get("waiver_bid")
                waiver_seq = settings.get("seq")

                # Handle draft picks for trades
                draft_picks = tx.get("draft_picks", [])
                draft_picks_json = json.dumps(draft_picks) if draft_picks else None

                # Get roster IDs involved
                roster_ids = tx.get("roster_ids", [])

                # Generate trade group ID for trades
                trade_group_id = None
                if norm_type == "trade":
                    trade_group_id = f"sleeper_{tx_id}"

                # Process adds
                adds = tx.get("adds") or {}
                for player_id, roster_id in adds.items():
                    roster_id_str = str(roster_id)
                    team_info = teams.get(roster_id_str, {})

                    # Resolve player
                    player_uid = None
                    confidence = None
                    method = None

                    if player_id and not player_id.startswith(("DEF", "D/")):
                        player_uid = resolve(player_id, "sleeper")
                        if player_uid:
                            self.stats["players_resolved"] += 1
                            confidence = 1.0
                            method = "exact"
                        else:
                            self.stats["players_unresolved"] += 1

                    # Determine action type
                    action_type = "trade_add" if norm_type == "trade" else norm_type

                    # Find trade partner
                    trade_partner = None
                    if norm_type == "trade" and len(roster_ids) > 1:
                        partners = [str(r) for r in roster_ids if str(r) != roster_id_str]
                        trade_partner = partners[0] if partners else None

                    unified.append(UnifiedTransaction(
                        transaction_id=f"sleeper_{tx_id}_{player_id}_add",
                        season=season,
                        week=week,
                        transaction_type=action_type,
                        status=norm_status,
                        team_id=roster_id_str,
                        team_name=team_info.get("team_name"),
                        player_uid=player_uid,
                        action="added",
                        trade_group_id=trade_group_id,
                        trade_partner_team_id=trade_partner,
                        waiver_bid=waiver_bid,
                        waiver_priority=waiver_seq,
                        draft_picks_json=draft_picks_json if norm_type == "trade" else None,
                        transaction_timestamp=created,
                        source="sleeper",
                        source_league_id=league_id,
                        source_transaction_id=tx_id,
                        source_data_json=json.dumps(tx),
                        source_player_id=player_id,
                        resolution_confidence=confidence,
                        resolution_method=method
                    ))

                # Process drops
                drops = tx.get("drops") or {}
                for player_id, roster_id in drops.items():
                    roster_id_str = str(roster_id)
                    team_info = teams.get(roster_id_str, {})

                    # Resolve player
                    player_uid = None
                    confidence = None
                    method = None

                    if player_id and not player_id.startswith(("DEF", "D/")):
                        player_uid = resolve(player_id, "sleeper")
                        if player_uid:
                            self.stats["players_resolved"] += 1
                            confidence = 1.0
                            method = "exact"
                        else:
                            self.stats["players_unresolved"] += 1

                    # Determine action type
                    action_type = "trade_drop" if norm_type == "trade" else "drop"

                    # Find trade partner
                    trade_partner = None
                    if norm_type == "trade" and len(roster_ids) > 1:
                        partners = [str(r) for r in roster_ids if str(r) != roster_id_str]
                        trade_partner = partners[0] if partners else None

                    unified.append(UnifiedTransaction(
                        transaction_id=f"sleeper_{tx_id}_{player_id}_drop",
                        season=season,
                        week=week,
                        transaction_type=action_type,
                        status=norm_status,
                        team_id=roster_id_str,
                        team_name=team_info.get("team_name"),
                        player_uid=player_uid,
                        action="dropped",
                        trade_group_id=trade_group_id,
                        trade_partner_team_id=trade_partner,
                        waiver_bid=waiver_bid,
                        waiver_priority=waiver_seq,
                        draft_picks_json=draft_picks_json if norm_type == "trade" else None,
                        transaction_timestamp=created,
                        source="sleeper",
                        source_league_id=league_id,
                        source_transaction_id=tx_id,
                        source_data_json=json.dumps(tx),
                        source_player_id=player_id,
                        resolution_confidence=confidence,
                        resolution_method=method
                    ))

                self.stats["transactions_processed"] += 1

            except Exception as e:
                logger.error(f"Error processing Sleeper transaction: {e}")
                self.stats["errors"].append({
                    "source": "sleeper",
                    "transaction_id": tx.get("transaction_id"),
                    "error": str(e)
                })

        return unified

    def process_sleeper_season(self, season: int) -> List[UnifiedTransaction]:
        """Process all Sleeper transactions for a season."""
        # Try transactions file
        tx_path = DATA_DIR / f"transactions-{season}.json"
        if not tx_path.exists():
            # Try data_raw
            tx_path = DATA_RAW_DIR / "sleeper" / f"transactions-{season}.json"

        if not tx_path.exists():
            logger.warning(f"No Sleeper transactions found for season {season}")
            return []

        data = json.loads(tx_path.read_text())
        transactions = data.get("transactions", [])
        league_id = data.get("league_id", "")

        # Load team data
        teams = self._load_sleeper_teams(season)

        logger.info(f"Processing {len(transactions)} Sleeper transactions for {season}")
        return self._process_sleeper_transactions(season, transactions, league_id, teams)

    # -------------------------------------------------------------------------
    # ESPN Transaction Processing
    # -------------------------------------------------------------------------

    def _load_espn_teams(
        self,
        season: int,
        teams_data: List[Dict[str, Any]],
        members_data: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """Load team data from ESPN payload."""
        member_by_id = {m.get("id"): m for m in members_data}

        teams = {}
        for team in teams_data:
            team_id = str(team.get("id"))
            name = team.get("name") or ""
            if not name:
                location = team.get("location", "")
                nickname = team.get("nickname", "")
                name = f"{location} {nickname}".strip()

            owners = team.get("owners", [])
            owner_id = owners[0] if owners else None
            owner = member_by_id.get(owner_id, {}) if owner_id else {}

            teams[team_id] = {
                "team_name": name or f"Team {team_id}",
                "owner_id": owner_id,
                "owner_name": owner.get("displayName") or owner.get("firstName")
            }

        return teams

    def _process_espn_transactions(
        self,
        season: int,
        transactions_data: List[Dict[str, Any]],
        league_id: str,
        teams: Dict[str, Dict[str, Any]]
    ) -> List[UnifiedTransaction]:
        """Process ESPN transactions into unified format."""
        unified = []

        for tx in transactions_data:
            try:
                tx_id = str(tx.get("id", uuid.uuid4()))
                tx_type = tx.get("type", "UNKNOWN")
                status = tx.get("status", "EXECUTED")
                week = tx.get("scoringPeriodId", 1)
                prop_date = tx.get("proposedDate")
                exec_date = tx.get("executionDate") or tx.get("processDate")

                # Normalize status
                if status == "EXECUTED":
                    norm_status = "complete"
                elif status == "FAILED":
                    norm_status = "failed"
                elif status == "VETOED":
                    norm_status = "vetoed"
                else:
                    norm_status = status.lower()

                # Normalize type
                norm_type = ESPN_TYPE_MAP.get(tx_type, tx_type.lower())

                # Generate trade group ID for trades
                trade_group_id = None
                if norm_type == "trade":
                    trade_group_id = f"espn_{tx_id}"

                # Get items (player movements)
                items = tx.get("items", [])

                for item in items:
                    player_id = str(item.get("playerId", ""))
                    from_team = str(item.get("fromTeamId", 0))
                    to_team = str(item.get("toTeamId", 0))
                    item_type = item.get("type", "")

                    # Skip if no player
                    if not player_id or player_id == "0":
                        continue

                    # Resolve player
                    player_uid = None
                    confidence = None
                    method = None

                    player_uid = resolve(player_id, "espn")
                    if player_uid:
                        self.stats["players_resolved"] += 1
                        confidence = 1.0
                        method = "exact"
                    else:
                        self.stats["players_unresolved"] += 1

                    # Determine action based on item type
                    if item_type == "ADD" or (to_team != "0" and from_team == "0"):
                        # Player added to team
                        team_id = to_team
                        action = "added"
                        action_type = "trade_add" if norm_type == "trade" else norm_type

                        team_info = teams.get(team_id, {})
                        unified.append(UnifiedTransaction(
                            transaction_id=f"espn_{tx_id}_{player_id}_add",
                            season=season,
                            week=week,
                            transaction_type=action_type,
                            status=norm_status,
                            team_id=team_id,
                            team_name=team_info.get("team_name"),
                            player_uid=player_uid,
                            action=action,
                            trade_group_id=trade_group_id,
                            trade_partner_team_id=from_team if norm_type == "trade" else None,
                            transaction_timestamp=exec_date,
                            source="espn",
                            source_league_id=league_id,
                            source_transaction_id=tx_id,
                            source_data_json=json.dumps(tx),
                            source_player_id=player_id,
                            resolution_confidence=confidence,
                            resolution_method=method
                        ))

                    if item_type == "DROP" or (from_team != "0" and to_team == "0"):
                        # Player dropped from team
                        team_id = from_team
                        action = "dropped"
                        action_type = "trade_drop" if norm_type == "trade" else "drop"

                        team_info = teams.get(team_id, {})
                        unified.append(UnifiedTransaction(
                            transaction_id=f"espn_{tx_id}_{player_id}_drop",
                            season=season,
                            week=week,
                            transaction_type=action_type,
                            status=norm_status,
                            team_id=team_id,
                            team_name=team_info.get("team_name"),
                            player_uid=player_uid,
                            action=action,
                            trade_group_id=trade_group_id,
                            trade_partner_team_id=to_team if norm_type == "trade" else None,
                            transaction_timestamp=exec_date,
                            source="espn",
                            source_league_id=league_id,
                            source_transaction_id=tx_id,
                            source_data_json=json.dumps(tx),
                            source_player_id=player_id,
                            resolution_confidence=confidence,
                            resolution_method=method
                        ))

                    # For trades, the same player appears in both teams
                    if norm_type == "trade" and from_team != "0" and to_team != "0":
                        # Drop from source team
                        team_info = teams.get(from_team, {})
                        unified.append(UnifiedTransaction(
                            transaction_id=f"espn_{tx_id}_{player_id}_trade_drop",
                            season=season,
                            week=week,
                            transaction_type="trade_drop",
                            status=norm_status,
                            team_id=from_team,
                            team_name=team_info.get("team_name"),
                            player_uid=player_uid,
                            action="dropped",
                            trade_group_id=trade_group_id,
                            trade_partner_team_id=to_team,
                            transaction_timestamp=exec_date,
                            source="espn",
                            source_league_id=league_id,
                            source_transaction_id=tx_id,
                            source_data_json=json.dumps(tx),
                            source_player_id=player_id,
                            resolution_confidence=confidence,
                            resolution_method=method
                        ))

                        # Add to destination team
                        team_info = teams.get(to_team, {})
                        unified.append(UnifiedTransaction(
                            transaction_id=f"espn_{tx_id}_{player_id}_trade_add",
                            season=season,
                            week=week,
                            transaction_type="trade_add",
                            status=norm_status,
                            team_id=to_team,
                            team_name=team_info.get("team_name"),
                            player_uid=player_uid,
                            action="added",
                            trade_group_id=trade_group_id,
                            trade_partner_team_id=from_team,
                            transaction_timestamp=exec_date,
                            source="espn",
                            source_league_id=league_id,
                            source_transaction_id=tx_id,
                            source_data_json=json.dumps(tx),
                            source_player_id=player_id,
                            resolution_confidence=confidence,
                            resolution_method=method
                        ))

                self.stats["transactions_processed"] += 1

            except Exception as e:
                logger.error(f"Error processing ESPN transaction: {e}")
                self.stats["errors"].append({
                    "source": "espn",
                    "transaction_id": tx.get("id"),
                    "error": str(e)
                })

        return unified

    def process_espn_season(self, season: int) -> List[UnifiedTransaction]:
        """Process all ESPN transactions for a season."""
        # Try data_raw first
        tx_path = DATA_RAW_DIR / "espn_transactions" / f"transactions_{season}.json"

        if not tx_path.exists():
            logger.warning(f"No ESPN transactions found for season {season}")
            return []

        data = json.loads(tx_path.read_text())
        transactions = data.get("transactions", [])
        teams_data = data.get("teams", [])
        members_data = data.get("members", [])
        league_id = data.get("league_id", "")

        # Load team data
        teams = self._load_espn_teams(season, teams_data, members_data)

        logger.info(f"Processing {len(transactions)} ESPN transactions for {season}")
        return self._process_espn_transactions(season, transactions, league_id, teams)

    # -------------------------------------------------------------------------
    # Database Operations
    # -------------------------------------------------------------------------

    def _save_transactions(
        self,
        conn: sqlite3.Connection,
        transactions: List[UnifiedTransaction]
    ) -> Tuple[int, int]:
        """Save unified transactions to database."""
        inserted = 0
        updated = 0

        for tx in transactions:
            try:
                # Check if exists
                cursor = conn.execute("""
                    SELECT id FROM unified_transactions
                    WHERE source = ? AND source_transaction_id = ?
                      AND team_id = ? AND COALESCE(player_uid, '') = COALESCE(?, '')
                """, (tx.source, tx.source_transaction_id, tx.team_id, tx.player_uid))

                existing = cursor.fetchone()

                if existing:
                    # Update existing
                    conn.execute("""
                        UPDATE unified_transactions SET
                            week = ?,
                            transaction_type = ?,
                            status = ?,
                            team_name = ?,
                            action = ?,
                            trade_group_id = ?,
                            trade_partner_team_id = ?,
                            waiver_bid = ?,
                            waiver_priority = ?,
                            draft_picks_json = ?,
                            transaction_timestamp = ?,
                            source_data_json = ?,
                            resolution_confidence = ?,
                            resolution_method = ?
                        WHERE id = ?
                    """, (
                        tx.week, tx.transaction_type, tx.status, tx.team_name,
                        tx.action, tx.trade_group_id, tx.trade_partner_team_id,
                        tx.waiver_bid, tx.waiver_priority, tx.draft_picks_json,
                        tx.transaction_timestamp, tx.source_data_json,
                        tx.resolution_confidence, tx.resolution_method,
                        existing["id"]
                    ))
                    updated += 1
                else:
                    # Insert new
                    conn.execute("""
                        INSERT INTO unified_transactions (
                            transaction_id, season, week, transaction_type, status,
                            team_id, team_name, player_uid, action,
                            trade_group_id, trade_partner_team_id,
                            waiver_bid, waiver_priority, draft_picks_json,
                            transaction_timestamp, source, source_league_id,
                            source_transaction_id, source_data_json,
                            source_player_id, resolution_confidence, resolution_method
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        tx.transaction_id, tx.season, tx.week, tx.transaction_type,
                        tx.status, tx.team_id, tx.team_name, tx.player_uid, tx.action,
                        tx.trade_group_id, tx.trade_partner_team_id,
                        tx.waiver_bid, tx.waiver_priority, tx.draft_picks_json,
                        tx.transaction_timestamp, tx.source, tx.source_league_id,
                        tx.source_transaction_id, tx.source_data_json,
                        tx.source_player_id, tx.resolution_confidence, tx.resolution_method
                    ))
                    inserted += 1

            except sqlite3.IntegrityError as e:
                logger.warning(f"Duplicate transaction: {tx.transaction_id} - {e}")
            except Exception as e:
                logger.error(f"Error saving transaction {tx.transaction_id}: {e}")

        return inserted, updated

    def _log_import(
        self,
        conn: sqlite3.Connection,
        source: str,
        season: int,
        start_time: datetime,
        inserted: int,
        updated: int
    ) -> None:
        """Log import run to database."""
        duration = (datetime.now() - start_time).total_seconds()

        conn.execute("""
            INSERT INTO transaction_import_log (
                source, season, transactions_processed,
                transactions_inserted, transactions_updated,
                transactions_skipped, players_resolved, players_unresolved,
                completed_at, duration_seconds, errors_count, errors_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
        """, (
            source, season, self.stats["transactions_processed"],
            inserted, updated, self.stats["transactions_skipped"],
            self.stats["players_resolved"], self.stats["players_unresolved"],
            duration, len(self.stats["errors"]),
            json.dumps(self.stats["errors"][:100])  # Limit errors stored
        ))

    # -------------------------------------------------------------------------
    # Main Processing Methods
    # -------------------------------------------------------------------------

    def process_season(
        self,
        season: int,
        sources: Optional[List[str]] = None
    ) -> None:
        """Process transactions for a single season."""
        if sources is None:
            sources = ["sleeper", "espn"]

        start_time = datetime.now()
        all_transactions: List[UnifiedTransaction] = []

        # Process each source
        for source in sources:
            self.stats = {
                "transactions_processed": 0,
                "transactions_inserted": 0,
                "transactions_updated": 0,
                "transactions_skipped": 0,
                "players_resolved": 0,
                "players_unresolved": 0,
                "errors": []
            }

            if source == "sleeper":
                transactions = self.process_sleeper_season(season)
            elif source == "espn":
                transactions = self.process_espn_season(season)
            else:
                logger.warning(f"Unknown source: {source}")
                continue

            all_transactions.extend(transactions)

        if not all_transactions:
            logger.info(f"No transactions found for season {season}")
            return

        logger.info(f"Unified {len(all_transactions)} transactions for season {season}")

        # Save to database
        if not self.dry_run:
            self._init_league_db()
            conn = self._get_league_connection()
            try:
                inserted, updated = self._save_transactions(conn, all_transactions)
                self._log_import(conn, ",".join(sources), season, start_time, inserted, updated)
                conn.commit()

                self.stats["transactions_inserted"] = inserted
                self.stats["transactions_updated"] = updated

                logger.info(
                    f"Saved transactions for {season}: "
                    f"{inserted} inserted, {updated} updated"
                )
            finally:
                conn.close()
        else:
            logger.info(f"[DRY RUN] Would save {len(all_transactions)} transactions")

    def process_all_seasons(
        self,
        start_season: int = 2015,
        end_season: int = 2025,
        sources: Optional[List[str]] = None
    ) -> None:
        """Process transactions for all seasons."""
        for season in range(start_season, end_season + 1):
            try:
                self.process_season(season, sources)
            except Exception as e:
                logger.error(f"Error processing season {season}: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Unify transactions from ESPN and Sleeper"
    )
    parser.add_argument(
        "--season", type=int,
        help="Process specific season"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Process all available seasons (2015-2025)"
    )
    parser.add_argument(
        "--source", choices=["espn", "sleeper"],
        help="Process only specific source"
    )
    parser.add_argument(
        "--start-season", type=int, default=2015,
        help="Start season for --all (default: 2015)"
    )
    parser.add_argument(
        "--end-season", type=int, default=2025,
        help="End season for --all (default: 2025)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Process without saving to database"
    )
    parser.add_argument(
        "--db-path", type=Path, default=LEAGUE_DB_PATH,
        help="Path to league database"
    )
    parser.add_argument(
        "--players-db", type=Path, default=PLAYERS_DB_PATH,
        help="Path to players identity database"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    sources = [args.source] if args.source else None

    unifier = TransactionUnifier(
        league_db_path=args.db_path,
        players_db_path=args.players_db,
        dry_run=args.dry_run
    )

    if args.all:
        unifier.process_all_seasons(
            start_season=args.start_season,
            end_season=args.end_season,
            sources=sources
        )
    elif args.season:
        unifier.process_season(args.season, sources)
    else:
        parser.print_help()
        print("\nError: Must specify --season or --all")
        sys.exit(1)

    # Print summary
    stats = unifier.get_stats()
    print("\n=== Summary ===")
    print(f"Transactions processed: {stats['transactions_processed']}")
    print(f"Inserted: {stats['transactions_inserted']}")
    print(f"Updated: {stats['transactions_updated']}")
    print(f"Players resolved: {stats['players_resolved']}")
    print(f"Players unresolved: {stats['players_unresolved']}")
    if stats['errors']:
        print(f"Errors: {len(stats['errors'])}")


if __name__ == "__main__":
    main()
