#!/usr/bin/env python3
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_RAW = ROOT / "data_raw"
OUTPUT_DIR = ROOT / "public" / "data"

SLEEPER_PLAYERS_PATH = DATA_RAW / "sleeper" / "players_flat.csv"
ESPN_PLAYERS_PATH = DATA_RAW / "espn_core" / "index" / "athletes_index_flat.csv"
MASTER_PLAYERS_PATH = DATA_RAW / "master" / "players_master_nflverse_espn_sleeper.csv"

REGISTRY_PATH = OUTPUT_DIR / "player_registry.json"


def normalize_string(value):
    if not value:
        return ""
    # Remove special chars, lowercase, reduce spaces
    text = str(value).lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return " ".join(text.split())


def looks_like_sleeper_id(val):
    val = str(val).strip()
    return val.isdigit() or (val.replace("-", "").isdigit() and len(val) > 4)


def main():
    print("Building Canonical Player Registry...")
    
    registry = {}  # canonical_id -> { ...data }
    
    # Lookup indices
    by_sleeper = {}
    by_espn = {}
    by_gsis = {}
    by_name = {} # normalized name -> canonical_id

    def get_or_create(canonical_id):
        if canonical_id in registry:
            return registry[canonical_id]
        
        entry = {
            "id": canonical_id,
            "name": "Unknown Player",
            "position": None,
            "team": None,
            "identifiers": {
                "sleeper_id": None,
                "espn_id": None,
                "gsis_id": None
            },
            "height": None,
            "weight": None,
            "college": None,
            "age": None,
            "years_exp": None,
            "birth_date": None
        }
        registry[canonical_id] = entry
        return entry

    def register_alias(idx_map, key, canonical_id):
        if not key:
            return
        key_str = str(key).strip()
        if not key_str:
            return
        
        # Collision resolution: 
        # If this key is already mapped to a DIFFERENT canonical ID, we have a conflict.
        # For now, first-write wins for IDs (assuming Sleeper is processed first and is best).
        # For names, we allow overwrite or handle gracefully?
        if key_str in idx_map:
            existing_cid = idx_map[key_str]
            if existing_cid != canonical_id:
                # Merge? Or Log?
                # Ideally we merge the two records if they are likely the same.
                # For this pass, we will prioritize existing.
                pass
        else:
            idx_map[key_str] = canonical_id

    # 1. PROCESS SLEEPER (Highest Confidence)
    print(f"Loading Sleeper data from {SLEEPER_PLAYERS_PATH}...")
    if SLEEPER_PLAYERS_PATH.exists():
        with SLEEPER_PLAYERS_PATH.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                sleeper_id = row.get("player_id", "").strip()
                if not sleeper_id:
                    continue
                
                # Use Sleeper ID as canonical for these
                canonical_id = sleeper_id
                entry = get_or_create(canonical_id)
                entry["identifiers"]["sleeper_id"] = sleeper_id
                
                # Metadata
                full_name = row.get("full_name") or f"{row.get('first_name','')} {row.get('last_name','')}"
                entry["name"] = full_name.strip()
                entry["position"] = row.get("position")
                entry["team"] = row.get("team")
                
                # Extended Bio
                entry["height"] = row.get("height")
                entry["weight"] = row.get("weight")
                entry["college"] = row.get("college")
                entry["age"] = row.get("age")
                entry["years_exp"] = row.get("years_exp")
                entry["birth_date"] = row.get("birth_date")

                # External IDs
                espn_id = row.get("espn_id", "").strip()
                gsis_id = row.get("gsis_id", "").strip()
                
                if espn_id:
                    entry["identifiers"]["espn_id"] = espn_id
                    register_alias(by_espn, espn_id, canonical_id)
                if gsis_id:
                    entry["identifiers"]["gsis_id"] = gsis_id
                    register_alias(by_gsis, gsis_id, canonical_id)
                
                register_alias(by_sleeper, sleeper_id, canonical_id)
                
                norm_name = normalize_string(entry["name"])
                if norm_name:
                    # Name matches are weak, so be careful. 
                    # Only register if not taken? Or construct a list?
                    # For simplicty, register if not taken.
                    if norm_name not in by_name:
                        by_name[norm_name] = canonical_id

    # 2. PROCESS MASTER (Enrichment)
    print(f"Loading Master data from {MASTER_PLAYERS_PATH}...")
    # This file often has good links between Sleeper/ESPN/GSIS
    if MASTER_PLAYERS_PATH.exists():
        with MASTER_PLAYERS_PATH.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                sleeper_id = (row.get("sleeper_id") or row.get("sleeper_player_id") or "").strip()
                espn_id = (row.get("espn_id_str") or row.get("espn_id") or "").strip()
                gsis_id = row.get("gsis_id", "").strip()
                
                canonical_id = None
                
                # Try to find existing
                if sleeper_id and sleeper_id in by_sleeper:
                    canonical_id = by_sleeper[sleeper_id]
                elif espn_id and espn_id in by_espn:
                    canonical_id = by_espn[espn_id]
                elif gsis_id and gsis_id in by_gsis:
                    canonical_id = by_gsis[gsis_id]
                
                # If we found an existing record, update it
                if canonical_id:
                    entry = registry[canonical_id]
                    # Add missing IDs
                    if not entry["identifiers"]["sleeper_id"] and sleeper_id:
                         entry["identifiers"]["sleeper_id"] = sleeper_id
                         register_alias(by_sleeper, sleeper_id, canonical_id)
                    if not entry["identifiers"]["espn_id"] and espn_id:
                         entry["identifiers"]["espn_id"] = espn_id
                         register_alias(by_espn, espn_id, canonical_id)
                    if not entry["identifiers"]["gsis_id"] and gsis_id:
                         entry["identifiers"]["gsis_id"] = gsis_id
                         register_alias(by_gsis, gsis_id, canonical_id)
                else:
                    # Creating new record from Master?
                    # If we have a sleeper_id, we can create one.
                    if sleeper_id:
                        canonical_id = sleeper_id
                        entry = get_or_create(canonical_id)
                        entry["identifiers"]["sleeper_id"] = sleeper_id
                        
                        name = row.get("display_name") or row.get("player_name")
                        if name: entry["name"] = name.strip()
                        
                        if espn_id: 
                            entry["identifiers"]["espn_id"] = espn_id
                            register_alias(by_espn, espn_id, canonical_id)
                        if gsis_id:
                            entry["identifiers"]["gsis_id"] = gsis_id
                            register_alias(by_gsis, gsis_id, canonical_id)
                        
                        register_alias(by_sleeper, sleeper_id, canonical_id)

    # 3. PROCESS ESPN (Historical fallback)
    print(f"Loading ESPN data from {ESPN_PLAYERS_PATH}...")
    if ESPN_PLAYERS_PATH.exists():
        with ESPN_PLAYERS_PATH.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                espn_id = row.get("id", "").strip()
                if not espn_id:
                    continue
                
                name = row.get("fullName") or row.get("displayName") or ""
                norm_name = normalize_string(name)
                
                canonical_id = None
                
                # Check exist
                if espn_id in by_espn:
                    canonical_id = by_espn[espn_id]
                
                # Try name match if no ID match (Risky but necessary for 2015-2018 mapping)
                if not canonical_id and norm_name and norm_name in by_name:
                    canonical_id = by_name[norm_name]
                    # Link this ESPN ID to the existing player
                    entry = registry[canonical_id]
                    entry["identifiers"]["espn_id"] = espn_id
                    register_alias(by_espn, espn_id, canonical_id)
                
                # If still no match, create new ESPN-only entry
                if not canonical_id:
                    canonical_id = f"espn:{espn_id}"
                    entry = get_or_create(canonical_id)
                    entry["identifiers"]["espn_id"] = espn_id
                    entry["name"] = name.strip()
                    register_alias(by_espn, espn_id, canonical_id)
                    if norm_name and norm_name not in by_name:
                        by_name[norm_name] = canonical_id

    # 4. WRITE OUTPUT
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # We also want to export the indices for fast lookup
    output_payload = {
        "registry": registry,
        "indices": {
            "sleeper": by_sleeper,
            "espn": by_espn,
            "gsis": by_gsis
        }
    }
    
    print(f"Writing registry to {REGISTRY_PATH}...")
    with REGISTRY_PATH.open("w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2)
        
    # Also write flat players list for loader.js compatibility
    PLAYERS_JSON_PATH = OUTPUT_DIR / "players.json"
    print(f"Writing flat players list to {PLAYERS_JSON_PATH}...")
    with PLAYERS_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(list(registry.values()), f, indent=2)
    
    print(f"Done. Registry size: {len(registry)} players.")
    print(f"Mapped ESPN IDs: {len(by_espn)}")
    print(f"Mapped Sleeper IDs: {len(by_sleeper)}")


if __name__ == "__main__":
    main()
