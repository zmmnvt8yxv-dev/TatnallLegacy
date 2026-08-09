#!/usr/bin/env python3
"""Verify generated canonical Parquet and audit-report artifacts."""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[1]
NORMALIZED = ROOT / "data" / "normalized"
DERIVED = ROOT / "data" / "derived"


def main() -> int:
    schema_path = NORMALIZED / "schema.json"
    if not schema_path.exists():
        raise SystemExit("Missing canonical schema.json; run npm run data:normalize")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    for name, metadata in (schema.get("tables") or {}).items():
        path = ROOT / metadata["path"]
        if not path.exists():
            errors.append(f"Missing {path}")
            continue
        table = pq.read_table(path)
        if table.num_rows != int(metadata["rows"]):
            errors.append(
                f"{name}: expected {metadata['rows']} rows, found {table.num_rows}"
            )
        missing_fields = sorted(set(metadata.get("fields") or []).difference(table.column_names))
        if missing_fields:
            errors.append(f"{name}: missing fields {missing_fields}")

    for name in ("players", "player_ids", "player_source_records"):
        path = NORMALIZED / f"{name}.parquet"
        if not path.exists() or pq.read_table(path).num_rows == 0:
            errors.append(f"Missing or empty canonical player table: {path}")

    history = json.loads(
        (DERIVED / "history_verification.json").read_text(encoding="utf-8")
    )
    if history.get("critical"):
        errors.extend(f"history: {value}" for value in history["critical"])
    if (history.get("summary") or {}).get("seasons") != 11:
        errors.append("history: expected 11 completed seasons")

    players = json.loads(
        (DERIVED / "player_identity_report.json").read_text(encoding="utf-8")
    )
    if (players.get("summary") or {}).get("canonical_players", 0) < 19000:
        errors.append("players: canonical player population is unexpectedly small")

    if errors:
        print("Canonical output validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        "Canonical outputs OK: "
        f"{history['summary']['seasons']} seasons, "
        f"{history['summary']['matchups']} matchups, "
        f"{players['summary']['canonical_players']} players"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
