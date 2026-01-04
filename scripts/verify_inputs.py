#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MASTER_DIR = ROOT / "data_raw" / "master"
ESPN_LINEUPS_DIR = ROOT / "data_raw" / "espn_lineups"
ESPN_TXN_DIR = ROOT / "data_raw" / "espn_transactions"


def parse_season_env():
    start = os.environ.get("START_SEASON")
    end = os.environ.get("END_SEASON")
    if start and end:
        try:
            return int(start), int(end)
        except ValueError:
            return None
    return None


def infer_season_range():
    seasons = []
    for path in DATA_DIR.glob("20*.json"):
        try:
            seasons.append(int(path.stem))
        except ValueError:
            continue
    if not seasons:
        return None
    return min(seasons), max(seasons)


def season_scope():
    env_range = parse_season_env()
    if env_range:
        return list(range(env_range[0], env_range[1] + 1))
    inferred = infer_season_range()
    if inferred:
        return list(range(inferred[0], inferred[1] + 1))
    return []


def readable_json(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            json.load(handle)
        return True, ""
    except Exception as exc:
        return False, str(exc)


def readable_csv(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            handle.readline()
        return True, ""
    except Exception as exc:
        return False, str(exc)


def readable_parquet(path):
    try:
        with path.open("rb") as handle:
            header = handle.read(4)
        if header != b"PAR1":
            return False, "missing PAR1 header"
        return True, ""
    except Exception as exc:
        return False, str(exc)


def check_master_dataset(base_name):
    csv_path = MASTER_DIR / f"{base_name}.csv"
    parquet_path = MASTER_DIR / f"{base_name}.parquet"
    for path in (csv_path, parquet_path):
        if not path.exists():
            continue
        if path.suffix == ".csv":
            ok, err = readable_csv(path)
        else:
            ok, err = readable_parquet(path)
        if ok:
            return True, str(path)
        return False, f"{path} ({err})"
    return False, "missing"


def check_optional_glob(pattern):
    return sorted(MASTER_DIR.glob(pattern))


def main():
    seasons = season_scope()
    required_missing = []
    warnings = []

    print("=== INPUTS REPORT ===")

    # Required: season exports
    if not seasons:
        required_missing.append("data/{season}.json (no seasons detected)")
        print("Required season exports: MISSING (no seasons detected)")
    else:
        missing_seasons = []
        for season in seasons:
            path = DATA_DIR / f"{season}.json"
            if not path.exists():
                missing_seasons.append(str(path))
                continue
            ok, err = readable_json(path)
            if not ok:
                missing_seasons.append(f"{path} ({err})")
        if missing_seasons:
            required_missing.extend(missing_seasons)
            print(f"Required season exports: missing {len(missing_seasons)}")
        else:
            print(f"Required season exports: OK ({len(seasons)} seasons)")

    # Required: master datasets
    required_master = [
        "player_week_fantasy_2015_2025_with_war",
        "player_season_fantasy_2015_2025_with_war",
        "player_career_fantasy_2015_2025_with_war",
    ]
    print("Required master datasets:")
    for base in required_master:
        ok, detail = check_master_dataset(base)
        if ok:
            print(f"  OK: {base} -> {detail}")
        else:
            required_missing.append(f"{base} ({detail})")
            print(f"  MISSING: {base} ({detail})")

    # Optional datasets
    boom_bust = check_optional_glob("player_season_boom_bust_*.*")
    week_z = check_optional_glob("player_week_*_with_z*.*")
    if not boom_bust:
        warnings.append("Optional boom/bust dataset missing: player_season_boom_bust_*")
    if not week_z:
        warnings.append("Optional z-score dataset missing: player_week_*_with_z*")

    # Optional ESPN fallbacks
    missing_lineups = []
    missing_txn = []
    for season in seasons:
        if not any((ESPN_LINEUPS_DIR / str(season)).glob("week-*.json")):
            missing_lineups.append(str(season))
        if not (ESPN_TXN_DIR / f"transactions_{season}.json").exists():
            missing_txn.append(str(season))
    if missing_lineups:
        warnings.append(f"Optional ESPN lineups missing for seasons: {', '.join(missing_lineups)}")
    if missing_txn:
        warnings.append(f"Optional ESPN transactions missing for seasons: {', '.join(missing_txn)}")

    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"  - {warning}")

    if required_missing:
        print("Missing required inputs:")
        for item in required_missing:
            print(f"  - {item}")
        sys.exit(1)

    print("All required inputs present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
