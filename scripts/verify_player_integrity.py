from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_id_index():
    players_path = PUBLIC_DATA / "players.json"
    ids_path = PUBLIC_DATA / "player_ids.json"
    if not players_path.exists() or not ids_path.exists():
        return {}, {}
    ids = read_json(ids_path)
    by_type = {}
    for entry in ids:
        id_type = entry.get("id_type")
        id_value = entry.get("id_value")
        player_uid = entry.get("player_uid")
        if not id_type or not id_value or not player_uid:
            continue
        by_type.setdefault(str(id_type), {})[str(id_value)] = str(player_uid)
    return by_type, {p.get("player_uid") for p in read_json(players_path) if p.get("player_uid")}


def iter_rows(payload):
    if isinstance(payload, list):
        for row in payload:
            if isinstance(row, dict):
                yield row
        return
    if isinstance(payload, dict):
        if "rows" in payload and isinstance(payload["rows"], list):
            for row in payload["rows"]:
                if isinstance(row, dict):
                    yield row
            return
        for key in ("topWeeklyWar", "topWeeklyZ", "topSeasonWar"):
            rows = payload.get(key)
            if isinstance(rows, list):
                for row in rows:
                    if isinstance(row, dict):
                        yield row


def find_public_json(glob_pattern: str):
    return [path for path in PUBLIC_DATA.glob(glob_pattern) if path.is_file()]


def resolve_player_uid(row, id_index):
    candidates = [
        ("sleeper", row.get("sleeper_id") or row.get("player_id")),
        ("gsis", row.get("gsis_id")),
        ("espn", row.get("espn_id")),
    ]
    for id_type, id_value in candidates:
        if id_value is None:
            continue
        id_value = str(id_value)
        if id_value in id_index.get(id_type, {}):
            return id_index[id_type][id_value]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Exit non-zero if any unmapped players are found.")
    args = parser.parse_args()

    id_index, player_uids = load_id_index()
    if not id_index:
        print("WARN: players.json or player_ids.json missing; skipping player integrity check.")
        return 0

    sources = []
    sources.extend(find_public_json("player_stats/**/*.json"))
    sources.extend(find_public_json("player_metrics/**/*.json"))

    missing = []
    total_rows = 0
    for path in sources:
        payload = read_json(path)
        for row in iter_rows(payload):
            total_rows += 1
            player_uid = resolve_player_uid(row, id_index)
            if player_uid and player_uid in player_uids:
                continue
            missing.append(
                {
                    "path": path.relative_to(PUBLIC_DATA).as_posix(),
                    "display_name": row.get("display_name"),
                    "sleeper_id": row.get("sleeper_id") or row.get("player_id"),
                    "gsis_id": row.get("gsis_id"),
                    "espn_id": row.get("espn_id"),
                }
            )

    if not missing:
        print(f"PLAYER_INTEGRITY_OK: {total_rows} rows checked, all mapped.")
        return 0

    print(f"PLAYER_INTEGRITY_WARN: {len(missing)} unmapped rows out of {total_rows}.")
    for item in missing[:20]:
        print(
            f"- {item['path']} :: {item.get('display_name') or 'Unknown'}"
            f" (sleeper={item.get('sleeper_id')}, gsis={item.get('gsis_id')}, espn={item.get('espn_id')})"
        )
    if len(missing) > 20:
        print(f"... and {len(missing) - 20} more.")

    return 1 if args.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
