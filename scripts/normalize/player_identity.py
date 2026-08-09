"""Build collision-aware canonical player and provider-ID tables."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import yaml

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.lib.canonical_ids import CanonicalIds
from scripts.normalize.canonical_history import write_parquet
from scripts.normalize.corrections import apply_corrections_with_report, load_corrections


ROOT = Path(__file__).resolve().parents[2]
LEGACY_REGISTRY = ROOT / "public" / "data" / "player_registry.json"
CURRENT_SLEEPER = ROOT / "data" / "raw" / "sleeper" / "players" / "current.json"
OVERRIDES = ROOT / "data" / "corrections" / "player_identity_overrides.yml"


class PlayerIdentityError(ValueError):
    """Raised when canonical player identity cannot be built safely."""


@dataclass(frozen=True)
class CanonicalPlayers:
    players: list[dict[str, Any]]
    player_ids: list[dict[str, Any]]
    source_players: list[dict[str, Any]]
    name_fallbacks: list[dict[str, Any]]
    report: dict[str, Any]


class DisjointSet:
    def __init__(self, keys: Iterable[str]):
        self.parent = {key: key for key in keys}

    def find(self, key: str) -> str:
        parent = self.parent[key]
        if parent != key:
            self.parent[key] = self.find(parent)
        return self.parent[key]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[max(left_root, right_root)] = min(left_root, right_root)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_name(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text.casefold())
    parts = text.split()
    while parts and parts[-1] in {"jr", "sr", "ii", "iii", "iv", "v"}:
        parts.pop()
    return " ".join(parts)


def normalize_external_id(id_type: str, value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if id_type in {"espn", "sleeper"} and re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    return text or None


def numeric_value(value: Any, *, integer: bool = False) -> int | float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if integer else number


def position_family(value: Any) -> str:
    position = str(value or "").upper()
    families = {
        "DB": "DB",
        "CB": "DB",
        "S": "DB",
        "FS": "DB",
        "SS": "DB",
        "OL": "OL",
        "OT": "OL",
        "OG": "OL",
        "G": "OL",
        "C": "OL",
        "DL": "DL",
        "DT": "DL",
        "DE": "DL",
        "NT": "DL",
        "LB": "LB",
        "ILB": "LB",
        "OLB": "LB",
        "MLB": "LB",
    }
    return families.get(position, position)


def safe_same_person(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_name = normalize_name(left.get("name"))
    right_name = normalize_name(right.get("name"))
    left_duplicate = left_name in {"", "duplicate player", "unknown player"}
    right_duplicate = right_name in {"", "duplicate player", "unknown player"}
    positions_compatible = (
        not left.get("position")
        or not right.get("position")
        or position_family(left.get("position")) == position_family(right.get("position"))
    )
    if left_duplicate or right_duplicate:
        return positions_compatible
    return left_name == right_name and positions_compatible


def legacy_records() -> list[dict[str, Any]]:
    registry = read_json(LEGACY_REGISTRY).get("registry") or {}
    rows = []
    for source_id, raw in registry.items():
        identifiers = raw.get("identifiers") or {}
        rows.append(
            {
                "source_player_id": str(source_id),
                "name": raw.get("name"),
                "first_name": None,
                "last_name": None,
                "position": raw.get("position"),
                "team": raw.get("team"),
                "active": False,
                "birth_date": raw.get("birth_date"),
                "college": raw.get("college"),
                "height": raw.get("height"),
                "weight": raw.get("weight"),
                "years_exp": raw.get("years_exp"),
                "identifiers": {
                    "sleeper_id": identifiers.get("sleeper_id"),
                    "espn_id": identifiers.get("espn_id"),
                    "gsis_id": identifiers.get("gsis_id"),
                    "sportradar_id": None,
                },
                "authoritative_current": False,
                "source": "legacy_registry",
            }
        )
    return rows


def apply_player_overrides(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    corrections = load_corrections(OVERRIDES)
    result = apply_corrections_with_report({"players": rows}, corrections)
    return result.data["players"], len(result.applied)


def enrich_current_sleeper(rows: list[dict[str, Any]]) -> int:
    if not CURRENT_SLEEPER.exists():
        return 0
    current = (read_json(CURRENT_SLEEPER).get("players") or {})
    by_source = {row["source_player_id"]: row for row in rows}
    for sleeper_id, player in current.items():
        source_id = str(sleeper_id)
        row = by_source.get(source_id)
        if row is None:
            row = {
                "source_player_id": source_id,
                "identifiers": {},
                "source": "sleeper_current",
            }
            rows.append(row)
            by_source[source_id] = row
        row.update(
            {
                "name": player.get("full_name") or row.get("name"),
                "first_name": player.get("first_name"),
                "last_name": player.get("last_name"),
                "position": player.get("position") or row.get("position"),
                "team": player.get("team"),
                "active": bool(player.get("active")),
                "birth_date": player.get("birth_date") or row.get("birth_date"),
                "college": player.get("college") or row.get("college"),
                "height": player.get("height") or row.get("height"),
                "weight": player.get("weight") or row.get("weight"),
                "years_exp": player.get("years_exp"),
                "authoritative_current": True,
                "source": "sleeper_current",
            }
        )
        identifiers = row.setdefault("identifiers", {})
        identifiers.update(
            {
                "sleeper_id": source_id,
                "espn_id": normalize_external_id("espn", player.get("espn_id")),
                "gsis_id": normalize_external_id("gsis", player.get("gsis_id")),
                "sportradar_id": normalize_external_id(
                    "sportradar", player.get("sportradar_id")
                ),
            }
        )
    return len(current)


def identity_claims(rows: list[dict[str, Any]]) -> dict[tuple[str, str], list[str]]:
    claims: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in rows:
        source_id = row["source_player_id"]
        identifiers = row.get("identifiers") or {}
        for key, id_type in (
            ("sleeper_id", "sleeper"),
            ("espn_id", "espn"),
            ("gsis_id", "gsis"),
            ("sportradar_id", "sportradar"),
        ):
            value = normalize_external_id(id_type, identifiers.get(key))
            if value:
                claims[(id_type, value)].append(source_id)
    return claims


def preferred_group_key(group: list[dict[str, Any]]) -> str:
    current_sleepers = sorted(
        normalize_external_id("sleeper", row.get("identifiers", {}).get("sleeper_id"))
        for row in group
        if row.get("authoritative_current")
        and normalize_external_id("sleeper", row.get("identifiers", {}).get("sleeper_id"))
    )
    sleepers = sorted(
        value
        for row in group
        if (value := normalize_external_id("sleeper", row.get("identifiers", {}).get("sleeper_id")))
    )
    gsis = sorted(
        value
        for row in group
        if (value := normalize_external_id("gsis", row.get("identifiers", {}).get("gsis_id")))
    )
    espn = sorted(
        value
        for row in group
        if (value := normalize_external_id("espn", row.get("identifiers", {}).get("espn_id")))
    )
    if current_sleepers:
        return f"sleeper:{current_sleepers[0]}"
    if sleepers:
        return f"sleeper:{sleepers[0]}"
    if gsis:
        return f"gsis:{gsis[0]}"
    if espn:
        return f"espn:{espn[0]}"
    return f"legacy:{min(row['source_player_id'] for row in group)}"


def best_record(group: list[dict[str, Any]]) -> dict[str, Any]:
    return max(
        group,
        key=lambda row: (
            bool(row.get("authoritative_current")),
            bool(row.get("active")),
            normalize_name(row.get("name")) not in {"", "duplicate player", "unknown player"},
            sum(bool(value) for value in (row.get("identifiers") or {}).values()),
        ),
    )


def build_canonical_players(root: Path = ROOT) -> CanonicalPlayers:
    ids = CanonicalIds(root / "data" / "config" / "league.yml")
    rows, correction_count = apply_player_overrides(legacy_records())
    current_count = enrich_current_sleeper(rows)
    by_source = {row["source_player_id"]: row for row in rows}
    claims = identity_claims(rows)
    groups = DisjointSet(by_source)

    safe_merges = 0
    for source_ids in claims.values():
        candidates = [by_source[source_id] for source_id in sorted(set(source_ids))]
        for index, left in enumerate(candidates):
            for right in candidates[index + 1 :]:
                if safe_same_person(left, right):
                    before = groups.find(left["source_player_id"]) != groups.find(
                        right["source_player_id"]
                    )
                    groups.union(left["source_player_id"], right["source_player_id"])
                    safe_merges += int(before)

    records_by_root: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for source_id, row in by_source.items():
        records_by_root[groups.find(source_id)].append(row)

    canonical_uid_by_source: dict[str, str] = {}
    canonical_rows: list[dict[str, Any]] = []
    for group in records_by_root.values():
        player_key = preferred_group_key(group)
        player_uid = ids.make("player", player_key=player_key)
        preferred = best_record(group)
        name = str(preferred.get("name") or "Unknown Player").strip()
        first_name = preferred.get("first_name")
        last_name = preferred.get("last_name")
        if not first_name and not last_name and name != "Unknown Player":
            parts = name.split()
            first_name = parts[0] if parts else None
            last_name = " ".join(parts[1:]) if len(parts) > 1 else None
        row = {
            "player_uid": player_uid,
            "display_name": name,
            "first_name": first_name,
            "last_name": last_name,
            "position": preferred.get("position"),
            "nfl_team": preferred.get("team"),
            "birth_date": preferred.get("birth_date"),
            "college": preferred.get("college"),
            "height": numeric_value(preferred.get("height"), integer=True),
            "weight": numeric_value(preferred.get("weight"), integer=True),
            "years_experience": numeric_value(preferred.get("years_exp")),
            "active": any(bool(item.get("active")) for item in group),
            "identity_key": player_key,
            "source_record_count": len(group),
        }
        canonical_rows.append(row)
        for item in group:
            canonical_uid_by_source[item["source_player_id"]] = player_uid

    player_ids: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for (id_type, id_value), source_ids in sorted(claims.items()):
        canonical_uids = {
            canonical_uid_by_source[source_id] for source_id in set(source_ids)
        }
        selected_uid: str | None = None
        resolution = "unique"
        if len(canonical_uids) == 1:
            selected_uid = next(iter(canonical_uids))
        else:
            current_sources = [
                source_id
                for source_id in set(source_ids)
                if by_source[source_id].get("authoritative_current")
            ]
            current_uids = {
                canonical_uid_by_source[source_id] for source_id in current_sources
            }
            if len(current_uids) == 1:
                selected_uid = next(iter(current_uids))
                resolution = "authoritative_current"
            else:
                conflicts.append(
                    {
                        "id_type": id_type,
                        "id_value": id_value,
                        "source_player_ids": sorted(set(source_ids)),
                        "canonical_player_uids": sorted(canonical_uids),
                        "names": sorted(
                            {
                                str(by_source[source_id].get("name") or "")
                                for source_id in set(source_ids)
                            }
                        ),
                        "status": "quarantined",
                    }
                )
        if selected_uid:
            player_ids.append(
                {
                    "player_uid": selected_uid,
                    "id_type": id_type,
                    "id_value": id_value,
                    "valid_from": None,
                    "valid_to": None,
                    "confidence": 1.0 if resolution == "authoritative_current" else 0.95,
                    "source": resolution,
                }
            )

    source_players = [
        {
            "source_player_id": source_id,
            "player_uid": player_uid,
            "source": by_source[source_id].get("source"),
        }
        for source_id, player_uid in sorted(canonical_uid_by_source.items())
    ]
    player_uid_by_sleeper = {
        row["id_value"]: row["player_uid"]
        for row in player_ids
        if row["id_type"] == "sleeper"
    }
    override_document = yaml.safe_load(OVERRIDES.read_text(encoding="utf-8")) or {}
    name_fallbacks = []
    for fallback in override_document.get("name_fallbacks") or []:
        sleeper_id = str(fallback.get("sleeper_id") or "")
        player_uid = player_uid_by_sleeper.get(sleeper_id)
        if not player_uid:
            raise PlayerIdentityError(
                f"Name fallback references unresolved Sleeper player {sleeper_id}"
            )
        name_fallbacks.append(
            {
                "normalized_name": str(fallback.get("normalized_name") or ""),
                "context": str(fallback.get("context") or ""),
                "player_uid": player_uid,
                "reason": str(fallback.get("reason") or "").strip(),
            }
        )

    report = {
        "status": "warning" if conflicts else "ok",
        "summary": {
            "legacy_records": len(legacy_records()),
            "authoritative_current_records": current_count,
            "canonical_players": len(canonical_rows),
            "provider_ids": len(player_ids),
            "safe_record_merges": safe_merges,
            "quarantined_provider_id_collisions": len(conflicts),
            "manual_corrections": correction_count,
            "name_fallbacks": len(name_fallbacks),
        },
        "conflicts": conflicts,
    }
    return CanonicalPlayers(
        players=sorted(canonical_rows, key=lambda row: row["player_uid"]),
        player_ids=sorted(
            player_ids, key=lambda row: (row["id_type"], row["id_value"])
        ),
        source_players=source_players,
        name_fallbacks=name_fallbacks,
        report=report,
    )


def write_outputs(players: CanonicalPlayers, root: Path = ROOT) -> None:
    normalized = root / "data" / "normalized"
    derived = root / "data" / "derived"
    tables = {
        "players": players.players,
        "player_ids": players.player_ids,
        "player_source_records": players.source_players,
    }
    for name, rows in tables.items():
        write_parquet(normalized / f"{name}.parquet", rows)
    normalized.mkdir(parents=True, exist_ok=True)
    (normalized / "player_name_fallbacks.json").write_text(
        json.dumps(players.name_fallbacks, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    schema_path = normalized / "schema.json"
    schema = (
        json.loads(schema_path.read_text(encoding="utf-8"))
        if schema_path.exists()
        else {"schema_version": "1.0.0", "tables": {}}
    )
    schema["generated_at"] = datetime.now(timezone.utc).isoformat()
    for name, rows in tables.items():
        schema.setdefault("tables", {})[name] = {
            "path": f"data/normalized/{name}.parquet",
            "rows": len(rows),
            "fields": list(rows[0].keys()) if rows else [],
        }
    schema_path.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    derived.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **players.report,
    }
    (derived / "player_identity_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    players = build_canonical_players()
    if not args.check:
        write_outputs(players)
    summary = players.report["summary"]
    print(
        "Canonical players OK: "
        f"{summary['canonical_players']} players, {summary['provider_ids']} provider IDs, "
        f"{summary['quarantined_provider_id_collisions']} collisions quarantined"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
