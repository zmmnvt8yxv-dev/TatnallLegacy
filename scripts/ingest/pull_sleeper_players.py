"""Fetch a compact authoritative snapshot of active fantasy players."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.ingest.sleeper_client import SleeperClient


ROOT = Path(__file__).resolve().parents[2]
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
FIELDS = (
    "player_id",
    "full_name",
    "first_name",
    "last_name",
    "position",
    "fantasy_positions",
    "team",
    "active",
    "status",
    "birth_date",
    "college",
    "height",
    "weight",
    "years_exp",
    "espn_id",
    "gsis_id",
    "sportradar_id",
)


def compact_player(player_id: str, value: Any) -> dict[str, Any]:
    player = value if isinstance(value, dict) else {}
    row = {field: player.get(field) for field in FIELDS}
    row["player_id"] = str(player.get("player_id") or player_id)
    return row


def pull_players(client: SleeperClient | None = None) -> dict[str, Any]:
    client = client or SleeperClient(timeout=60.0)
    players: dict[str, dict[str, Any]] = {}
    for position in POSITIONS:
        response = client.get(
            "players/nfl", params={"position": position, "active": "true"}
        )
        if not isinstance(response, dict):
            continue
        for player_id, value in response.items():
            row = compact_player(str(player_id), value)
            players[row["player_id"]] = row
    return {
        "schema_version": "1.0.0",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://api.sleeper.app/v1/players/nfl",
        "filters": {"positions": list(POSITIONS), "active": True},
        "players": dict(sorted(players.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data" / "raw" / "sleeper" / "players" / "current.json",
    )
    args = parser.parse_args()
    payload = pull_players()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(f"{args.output.suffix}.tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    temporary.replace(args.output)
    print(f"Sleeper players OK: {len(payload['players'])} active fantasy players")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
