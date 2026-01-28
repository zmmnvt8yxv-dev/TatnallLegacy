#!/usr/bin/env python3
"""
Search Index Builder

Builds fast player/owner search indexes with:
- Full-text search index
- Aliases included
- Phonetic matching (Soundex)
- Fuzzy matching support

Usage:
    # Build search index
    python build_search_index.py

    # Build with custom output
    python build_search_index.py --output search_index.json

    # Include team owners
    python build_search_index.py --include-owners
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sqlite3
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

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
LEAGUE_DB_PATH = PROJECT_ROOT / "db" / "league.sqlite"
PUBLIC_DATA_PATH = PROJECT_ROOT / "public" / "data"


def soundex(name: str) -> str:
    """
    Generate Soundex code for a name.

    Soundex is a phonetic algorithm for indexing names by sound,
    as pronounced in English.
    """
    if not name:
        return ""

    # Convert to uppercase and keep only letters
    name = re.sub(r"[^A-Za-z]", "", name.upper())

    if not name:
        return ""

    # Soundex coding
    soundex_map = {
        "B": "1", "F": "1", "P": "1", "V": "1",
        "C": "2", "G": "2", "J": "2", "K": "2", "Q": "2", "S": "2", "X": "2", "Z": "2",
        "D": "3", "T": "3",
        "L": "4",
        "M": "5", "N": "5",
        "R": "6"
    }

    # First letter stays as is
    code = name[0]

    # Encode remaining letters
    prev_code = soundex_map.get(name[0], "")
    for char in name[1:]:
        char_code = soundex_map.get(char, "")
        if char_code and char_code != prev_code:
            code += char_code
        prev_code = char_code if char_code else prev_code

        if len(code) >= 4:
            break

    # Pad with zeros
    code = code.ljust(4, "0")

    return code[:4]


def metaphone(name: str) -> str:
    """
    Generate a simplified Metaphone code for a name.

    This is a simplified version for common name patterns.
    """
    if not name:
        return ""

    name = name.upper().strip()

    # Remove non-alpha
    name = re.sub(r"[^A-Z]", "", name)

    if not name:
        return ""

    # Common substitutions
    replacements = [
        (r"^KN", "N"),
        (r"^GN", "N"),
        (r"^PN", "N"),
        (r"^WR", "R"),
        (r"^PS", "S"),
        (r"^X", "S"),
        (r"GH", ""),
        (r"PH", "F"),
        (r"SCH", "SK"),
        (r"SH", "X"),
        (r"TH", "0"),
        (r"TCH", "CH"),
        (r"CK", "K"),
        (r"CE", "SE"),
        (r"CI", "SI"),
        (r"CY", "SY"),
        (r"C", "K"),
        (r"DG", "J"),
        (r"GI", "J"),
        (r"GE", "J"),
        (r"GY", "J"),
        (r"GN", "N"),
        (r"MB$", "M"),
        (r"Q", "K"),
        (r"V", "F"),
        (r"Z", "S"),
        (r"X", "KS"),
    ]

    for pattern, replacement in replacements:
        name = re.sub(pattern, replacement, name)

    # Remove duplicate consonants
    result = ""
    prev = ""
    for char in name:
        if char != prev or char in "AEIOU":
            result += char
        prev = char

    return result[:6]


def normalize_for_search(text: str) -> str:
    """Normalize text for search matching."""
    if not text:
        return ""

    # Lowercase
    text = text.lower()

    # Remove punctuation
    text = re.sub(r"[^\w\s]", "", text)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


@dataclass
class SearchEntry:
    """A single entry in the search index."""
    id: str
    type: str  # "player" or "owner"
    name: str
    normalized: str
    soundex: str
    metaphone: str
    aliases: List[str] = field(default_factory=list)
    alias_soundex: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchIndex:
    """Complete search index."""
    version: str = "1.0.0"
    generated_at: str = ""
    entry_count: int = 0
    entries: List[SearchEntry] = field(default_factory=list)

    # Inverted indexes for fast lookup
    by_soundex: Dict[str, List[str]] = field(default_factory=lambda: defaultdict(list))
    by_metaphone: Dict[str, List[str]] = field(default_factory=lambda: defaultdict(list))
    by_prefix: Dict[str, List[str]] = field(default_factory=lambda: defaultdict(list))


class SearchIndexBuilder:
    """
    Builds search indexes for players and owners.

    Features:
    - Full-text search with normalized names
    - Phonetic matching via Soundex and Metaphone
    - Alias support for nicknames and variations
    - Prefix matching for autocomplete
    """

    def __init__(
        self,
        players_db: Path = PLAYERS_DB_PATH,
        league_db: Path = LEAGUE_DB_PATH,
        output_path: Path = PUBLIC_DATA_PATH
    ):
        self.players_db = players_db
        self.league_db = league_db
        self.output_path = output_path
        self._players_conn: Optional[sqlite3.Connection] = None
        self._league_conn: Optional[sqlite3.Connection] = None

    def _get_players_connection(self) -> Optional[sqlite3.Connection]:
        """Get players database connection."""
        if self._players_conn is None and self.players_db.exists():
            self._players_conn = sqlite3.connect(str(self.players_db))
            self._players_conn.row_factory = sqlite3.Row
        return self._players_conn

    def _get_league_connection(self) -> Optional[sqlite3.Connection]:
        """Get league database connection."""
        if self._league_conn is None and self.league_db.exists():
            self._league_conn = sqlite3.connect(str(self.league_db))
            self._league_conn.row_factory = sqlite3.Row
        return self._league_conn

    def close(self) -> None:
        """Close database connections."""
        if self._players_conn:
            self._players_conn.close()
            self._players_conn = None
        if self._league_conn:
            self._league_conn.close()
            self._league_conn = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def _load_players(self) -> List[SearchEntry]:
        """Load player entries for search index."""
        conn = self._get_players_connection()
        if not conn:
            return []

        # Get players with their aliases
        players = conn.execute("""
            SELECT
                p.player_uid,
                p.canonical_name,
                p.position,
                p.current_nfl_team,
                p.status,
                p.college
            FROM players p
        """).fetchall()

        entries = []
        for player in players:
            uid = player["player_uid"]
            name = player["canonical_name"]

            # Get aliases
            aliases_rows = conn.execute("""
                SELECT alias FROM player_aliases
                WHERE player_uid = ?
            """, (uid,)).fetchall()

            aliases = [r["alias"] for r in aliases_rows]

            entry = SearchEntry(
                id=uid,
                type="player",
                name=name,
                normalized=normalize_for_search(name),
                soundex=soundex(name.split()[0]) if name else "",  # First name soundex
                metaphone=metaphone(name),
                aliases=aliases,
                alias_soundex=[soundex(a.split()[0]) for a in aliases if a],
                metadata={
                    "position": player["position"],
                    "team": player["current_nfl_team"],
                    "status": player["status"],
                    "college": player["college"]
                }
            )
            entries.append(entry)

        return entries

    def _load_owners(self) -> List[SearchEntry]:
        """Load owner entries for search index."""
        conn = self._get_league_connection()
        if not conn:
            return []

        owners = conn.execute("""
            SELECT DISTINCT
                owner_id,
                owner_name
            FROM fantasy_teams
            WHERE owner_name IS NOT NULL
        """).fetchall()

        entries = []
        for owner in owners:
            if not owner["owner_name"]:
                continue

            entry = SearchEntry(
                id=owner["owner_id"] or owner["owner_name"],
                type="owner",
                name=owner["owner_name"],
                normalized=normalize_for_search(owner["owner_name"]),
                soundex=soundex(owner["owner_name"]),
                metaphone=metaphone(owner["owner_name"]),
                metadata={}
            )
            entries.append(entry)

        return entries

    def _build_inverted_indexes(self, entries: List[SearchEntry]) -> Tuple[Dict, Dict, Dict]:
        """Build inverted indexes for fast lookup."""
        by_soundex: Dict[str, List[str]] = defaultdict(list)
        by_metaphone: Dict[str, List[str]] = defaultdict(list)
        by_prefix: Dict[str, List[str]] = defaultdict(list)

        for entry in entries:
            # Soundex index
            if entry.soundex:
                by_soundex[entry.soundex].append(entry.id)
            for alias_sx in entry.alias_soundex:
                if alias_sx:
                    by_soundex[alias_sx].append(entry.id)

            # Metaphone index
            if entry.metaphone:
                by_metaphone[entry.metaphone].append(entry.id)

            # Prefix index (first 2-3 chars for autocomplete)
            normalized = entry.normalized
            if normalized:
                for i in range(2, min(5, len(normalized) + 1)):
                    prefix = normalized[:i]
                    by_prefix[prefix].append(entry.id)

                # Also index first name and last name separately
                parts = normalized.split()
                for part in parts:
                    for i in range(2, min(5, len(part) + 1)):
                        prefix = part[:i]
                        if prefix not in by_prefix or entry.id not in by_prefix[prefix]:
                            by_prefix[prefix].append(entry.id)

        return dict(by_soundex), dict(by_metaphone), dict(by_prefix)

    def build_index(
        self,
        include_players: bool = True,
        include_owners: bool = False
    ) -> SearchIndex:
        """
        Build the complete search index.

        Args:
            include_players: Include player entries
            include_owners: Include owner entries

        Returns:
            SearchIndex object
        """
        entries = []

        if include_players:
            logger.info("Loading player entries...")
            entries.extend(self._load_players())

        if include_owners:
            logger.info("Loading owner entries...")
            entries.extend(self._load_owners())

        logger.info(f"Building inverted indexes for {len(entries)} entries...")
        by_soundex, by_metaphone, by_prefix = self._build_inverted_indexes(entries)

        index = SearchIndex(
            version="1.0.0",
            generated_at=datetime.now().isoformat(),
            entry_count=len(entries),
            entries=entries,
            by_soundex=by_soundex,
            by_metaphone=by_metaphone,
            by_prefix=by_prefix
        )

        return index

    def export_index(
        self,
        index: SearchIndex,
        output_file: Optional[Path] = None,
        minify: bool = False
    ) -> Path:
        """
        Export search index to JSON.

        Args:
            index: SearchIndex to export
            output_file: Output path (default: search/index.json)
            minify: Minify JSON output

        Returns:
            Path to exported file
        """
        if output_file is None:
            output_file = self.output_path / "search" / "index.json"

        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Convert to serializable format
        data = {
            "version": index.version,
            "generatedAt": index.generated_at,
            "entryCount": index.entry_count,
            "entries": [
                {
                    "id": e.id,
                    "type": e.type,
                    "name": e.name,
                    "norm": e.normalized,
                    "sx": e.soundex,
                    "mp": e.metaphone,
                    "aliases": e.aliases if e.aliases else None,
                    "meta": e.metadata if e.metadata else None
                }
                for e in index.entries
            ],
            "indexes": {
                "soundex": index.by_soundex,
                "metaphone": index.by_metaphone,
                "prefix": index.by_prefix
            }
        }

        # Remove None values for smaller JSON
        for entry in data["entries"]:
            if entry["aliases"] is None:
                del entry["aliases"]
            if entry["meta"] is None:
                del entry["meta"]

        if minify:
            json_str = json.dumps(data, separators=(",", ":"))
        else:
            json_str = json.dumps(data, indent=2)

        output_file.write_text(json_str)

        logger.info(f"Exported search index to {output_file} ({len(json_str):,} bytes)")
        return output_file

    def export_lightweight_index(
        self,
        index: SearchIndex,
        output_file: Optional[Path] = None
    ) -> Path:
        """
        Export lightweight index for frontend autocomplete.

        Contains only essential data for fast loading.
        """
        if output_file is None:
            output_file = self.output_path / "search" / "autocomplete.json"

        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Minimal format: just names and IDs for autocomplete
        data = {
            "v": "1.0",
            "t": datetime.now().isoformat(),
            "p": [  # players
                {"i": e.id, "n": e.name, "t": e.metadata.get("team"), "pos": e.metadata.get("position")}
                for e in index.entries
                if e.type == "player"
            ],
            "px": index.by_prefix  # prefix index
        }

        json_str = json.dumps(data, separators=(",", ":"))
        output_file.write_text(json_str)

        logger.info(f"Exported lightweight index to {output_file} ({len(json_str):,} bytes)")
        return output_file


def build_search_index(
    include_owners: bool = False,
    minify: bool = False
) -> Path:
    """Build and export search index."""
    with SearchIndexBuilder() as builder:
        index = builder.build_index(include_players=True, include_owners=include_owners)
        return builder.export_index(index, minify=minify)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Build Search Index for Players/Owners"
    )

    parser.add_argument(
        "--output",
        type=Path,
        help="Output file path"
    )

    parser.add_argument(
        "--include-owners",
        action="store_true",
        help="Include fantasy team owners"
    )

    parser.add_argument(
        "--lightweight",
        action="store_true",
        help="Also export lightweight autocomplete index"
    )

    parser.add_argument(
        "--minify",
        action="store_true",
        help="Minify JSON output"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    builder = SearchIndexBuilder()

    try:
        logger.info("Building search index...")
        index = builder.build_index(
            include_players=True,
            include_owners=args.include_owners
        )

        output_file = builder.export_index(
            index,
            output_file=args.output,
            minify=args.minify
        )

        if args.lightweight:
            builder.export_lightweight_index(index)

        print(f"\nSearch Index Built:")
        print(f"  Entries: {index.entry_count}")
        print(f"  Soundex codes: {len(index.by_soundex)}")
        print(f"  Prefixes: {len(index.by_prefix)}")
        print(f"  Output: {output_file}")

        return 0

    finally:
        builder.close()


if __name__ == "__main__":
    sys.exit(main())
