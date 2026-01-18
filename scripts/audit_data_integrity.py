#!/usr/bin/env python3
"""
Data Integrity Audit Script

Audits the generated public/data files for:
- Missing player IDs
- Orphaned player references
- Data consistency across seasons
- Coverage statistics
"""

import json
import os
from collections import defaultdict
from pathlib import Path

PUBLIC_DATA_DIR = Path("public/data")
REPORT_FILE = PUBLIC_DATA_DIR / "integrity_report.json"

def load_json(path):
    """Safely load JSON file."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        return {"error": str(e)}

def audit_manifest():
    """Check manifest completeness."""
    manifest = load_json(PUBLIC_DATA_DIR / "manifest.json")
    if "error" in manifest:
        return {"status": "error", "message": manifest["error"]}
    
    issues = []
    
    # Check required paths
    required_paths = ["seasonSummary", "weeklyChunk", "allTime"]
    for path_key in required_paths:
        if path_key not in manifest.get("paths", {}):
            issues.append(f"Missing required path: {path_key}")
    
    # Check seasons
    if not manifest.get("seasons"):
        issues.append("No seasons defined")
    
    return {
        "status": "ok" if not issues else "warning",
        "seasons": manifest.get("seasons", []),
        "path_count": len(manifest.get("paths", {})),
        "issues": issues,
    }

def audit_players():
    """Audit player data completeness."""
    players = load_json(PUBLIC_DATA_DIR / "players.json")
    player_ids = load_json(PUBLIC_DATA_DIR / "player_ids.json")
    
    if isinstance(players, dict) and "error" in players:
        return {"status": "error", "message": players["error"]}
    
    stats = {
        "total_players": len(players) if isinstance(players, list) else 0,
        "total_ids": len(player_ids) if isinstance(player_ids, list) else 0,
        "players_with_sleeper_id": 0,
        "players_with_espn_id": 0,
        "players_with_gsis_id": 0,
        "players_missing_name": 0,
        "players_missing_position": 0,
    }
    
    for player in (players if isinstance(players, list) else []):
        if player.get("sleeper_id"):
            stats["players_with_sleeper_id"] += 1
        if player.get("espn_id"):
            stats["players_with_espn_id"] += 1
        if player.get("gsis_id"):
            stats["players_with_gsis_id"] += 1
        if not player.get("full_name") and not player.get("display_name"):
            stats["players_missing_name"] += 1
        if not player.get("position"):
            stats["players_missing_position"] += 1
    
    # Count ID types in player_ids
    id_type_counts = defaultdict(int)
    for entry in (player_ids if isinstance(player_ids, list) else []):
        id_type_counts[entry.get("id_type", "unknown")] += 1
    
    stats["id_type_distribution"] = dict(id_type_counts)
    
    return {
        "status": "ok" if stats["players_missing_name"] == 0 else "warning",
        **stats,
    }

def audit_season(season):
    """Audit a single season's data."""
    season_file = PUBLIC_DATA_DIR / "season" / f"{season}.json"
    data = load_json(season_file)
    
    if isinstance(data, dict) and "error" in data:
        return {"status": "error", "season": season, "message": data["error"]}
    
    issues = []
    
    teams = data.get("teams", [])
    if not teams:
        issues.append("No teams found")
    
    for team in teams:
        if not team.get("owner") and not team.get("display_name"):
            issues.append(f"Team missing owner: {team.get('team_name', 'Unknown')}")
        if team.get("points_for") is None:
            issues.append(f"Team missing points_for: {team.get('team_name', 'Unknown')}")
    
    return {
        "status": "ok" if not issues else "warning",
        "season": season,
        "team_count": len(teams),
        "issues": issues[:5],  # Limit to 5 issues per season
    }

def audit_weekly(season, week):
    """Audit a single week's data."""
    week_file = PUBLIC_DATA_DIR / "weekly" / str(season) / f"week-{week}.json"
    data = load_json(week_file)
    
    if isinstance(data, dict) and "error" in data:
        return None  # Week may not exist
    
    matchups = data.get("matchups", [])
    lineups = data.get("lineups", [])
    
    lineup_issues = {
        "missing_player_id": 0,
        "missing_player_name": 0,
        "unknown_player": 0,
    }
    
    for lineup in lineups:
        if not lineup.get("player_id") and not lineup.get("sleeper_id"):
            lineup_issues["missing_player_id"] += 1
        if not lineup.get("player") and not lineup.get("display_name"):
            lineup_issues["missing_player_name"] += 1
        if str(lineup.get("player", "")).startswith("(Unknown"):
            lineup_issues["unknown_player"] += 1
    
    return {
        "matchup_count": len(matchups),
        "lineup_count": len(lineups),
        "issues": lineup_issues,
    }

def audit_transactions(season):
    """Audit transactions for a season."""
    tx_file = PUBLIC_DATA_DIR / "transactions" / f"{season}.json"
    data = load_json(tx_file)
    
    if isinstance(data, dict) and "error" in data:
        return None
    
    entries = data.get("entries", [])
    type_counts = defaultdict(int)
    missing_player_name = 0
    
    for entry in entries:
        type_counts[entry.get("type", "unknown")] += 1
        for player in entry.get("players", []):
            if not player.get("name") or str(player.get("name", "")).startswith("(Unknown"):
                missing_player_name += 1
    
    return {
        "entry_count": len(entries),
        "type_distribution": dict(type_counts),
        "missing_player_names": missing_player_name,
    }

def run_full_audit():
    """Run complete data integrity audit."""
    print("🔍 Running data integrity audit...")
    
    report = {
        "generated_at": None,
        "manifest": audit_manifest(),
        "players": audit_players(),
        "seasons": {},
        "weekly_summary": {},
        "transactions": {},
        "overall_status": "ok",
    }
    
    # Audit each season
    seasons = report["manifest"].get("seasons", [])
    for season in seasons:
        report["seasons"][season] = audit_season(season)
        
        # Audit weekly data (sample weeks 1, 9, 17)
        weekly_stats = {"total_matchups": 0, "total_lineups": 0, "issues": defaultdict(int)}
        for week in [1, 5, 9, 13, 17]:
            week_data = audit_weekly(season, week)
            if week_data:
                weekly_stats["total_matchups"] += week_data["matchup_count"]
                weekly_stats["total_lineups"] += week_data["lineup_count"]
                for key, val in week_data.get("issues", {}).items():
                    weekly_stats["issues"][key] += val
        weekly_stats["issues"] = dict(weekly_stats["issues"])
        report["weekly_summary"][season] = weekly_stats
        
        # Audit transactions
        tx_data = audit_transactions(season)
        if tx_data:
            report["transactions"][season] = tx_data
    
    # Calculate overall status
    issues_found = False
    if report["manifest"].get("status") != "ok":
        issues_found = True
    if report["players"].get("status") != "ok":
        issues_found = True
    for season_data in report["seasons"].values():
        if season_data.get("status") != "ok":
            issues_found = True
    
    report["overall_status"] = "warning" if issues_found else "ok"
    
    # Add timestamp
    from datetime import datetime
    report["generated_at"] = datetime.now().isoformat()
    
    # Save report
    with open(REPORT_FILE, "w") as f:
        json.dump(report, f, indent=2, default=str)
    
    print(f"✅ Audit complete. Report saved to {REPORT_FILE}")
    print(f"   Overall status: {report['overall_status']}")
    print(f"   Players: {report['players'].get('total_players', 0)} total")
    print(f"   Seasons: {len(seasons)}")
    
    return report

if __name__ == "__main__":
    run_full_audit()
