#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API_BASE = "https://api.sleeper.app/v1"


def http_get_json(url: str, retries: int = 4, backoff: float = 0.75):
    last_err = None
    for i in range(retries + 1):
        try:
            req = Request(url, headers={"User-Agent": "TatnallLegacy/1.0"})
            with urlopen(req, timeout=30) as r:
                data = r.read().decode("utf-8")
            return json.loads(data)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as e:
            last_err = e
            if i < retries:
                time.sleep(backoff * (2 ** i))
                continue
            raise
    raise last_err


def safe_float(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def compute_points(entry: dict) -> float:
    if isinstance(entry, dict):
        if entry.get("points") is not None:
            return safe_float(entry.get("points"))
        sp = entry.get("starters_points") or []
        if isinstance(sp, list):
            return float(sum(v for v in sp if isinstance(v, (int, float))))
    return 0.0


def ensure_dirs():
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("public/data").mkdir(parents=True, exist_ok=True)


def build_maps(users, rosters):
    user_by_id = {}
    for u in users or []:
        if isinstance(u, dict) and u.get("user_id"):
            user_by_id[u["user_id"]] = u

    roster_by_id = {}
    roster_owner = {}
    roster_team_name = {}
    for r in rosters or []:
        if not isinstance(r, dict):
            continue
        rid = r.get("roster_id")
        if rid is None:
            continue
        roster_by_id[rid] = r
        roster_owner[rid] = r.get("owner_id")
        md = r.get("metadata") or {}
        tn = md.get("team_name") if isinstance(md, dict) else None
        roster_team_name[rid] = tn
    return user_by_id, roster_by_id, roster_owner, roster_team_name


def fetch_week_matchups(league_id: str, week: int):
    url = f"{API_BASE}/league/{league_id}/matchups/{week}"
    return http_get_json(url)


def pair_games_for_week(week: int, week_entries: list, roster_owner, user_by_id, roster_team_name):
    by_matchup = {}
    for e in week_entries:
        if not isinstance(e, dict):
            continue
        mid = e.get("matchup_id")
        rid = e.get("roster_id")
        if mid is None or rid is None:
            continue
        pts = compute_points(e)
        owner_id = roster_owner.get(rid)
        user = user_by_id.get(owner_id, {}) if owner_id else {}
        team_name = roster_team_name.get(rid) or user.get("display_name") or user.get("username") or str(owner_id or rid)

        row = {
            "week": week,
            "matchup_id": mid,
            "roster_id": rid,
            "owner_id": owner_id,
            "username": user.get("username"),
            "display_name": user.get("display_name"),
            "team_name": team_name,
            "points": round(float(pts), 2),
        }
        by_matchup.setdefault(mid, []).append(row)

    games = []
    for mid, rows in sorted(by_matchup.items(), key=lambda kv: (kv[0] is None, kv[0])):
        rows_sorted = sorted(rows, key=lambda r: r.get("points", 0.0), reverse=True)
        home = rows_sorted[0] if rows_sorted else None
        away = rows_sorted[1] if len(rows_sorted) > 1 else None

        game = {
            "week": week,
            "matchup_id": mid,
            "home_team": home.get("team_name") if home else None,
            "away_team": away.get("team_name") if away else None,
            "home_roster_id": home.get("roster_id") if home else None,
            "away_roster_id": away.get("roster_id") if away else None,
            "home_owner_id": home.get("owner_id") if home else None,
            "away_owner_id": away.get("owner_id") if away else None,
            "home_score": home.get("points") if home else None,
            "away_score": away.get("points") if away else None,
            "entries": rows_sorted,
        }
        games.append(game)

    return games


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league-id", default=os.getenv("LEAGUE_ID", "").strip(), help="Sleeper league id")
    ap.add_argument("--season", type=int, default=int(os.getenv("SEASON", "2025")), help="Season year (e.g. 2025)")
    ap.add_argument("--weeks", type=int, default=int(os.getenv("WEEKS", "18")), help="Max weeks to attempt (default 18)")
    ap.add_argument("--min-week", type=int, default=int(os.getenv("MIN_WEEK", "1")))
    ap.add_argument("--max-week", type=int, default=0, help="Override max week (0 = use --weeks)")
    ap.add_argument("--only-week", type=int, default=0, help="Fetch only this week")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if not args.league_id:
        print("ERROR: missing --league-id (or LEAGUE_ID env var)", file=sys.stderr)
        sys.exit(2)

    ensure_dirs()

    league = http_get_json(f"{API_BASE}/league/{args.league_id}")
    users = http_get_json(f"{API_BASE}/league/{args.league_id}/users")
    rosters = http_get_json(f"{API_BASE}/league/{args.league_id}/rosters")

    user_by_id, roster_by_id, roster_owner, roster_team_name = build_maps(users, rosters)

    max_week = args.max_week if args.max_week and args.max_week > 0 else args.weeks
    week_list = [args.only_week] if args.only_week and args.only_week > 0 else list(range(args.min_week, max_week + 1))

    all_games = []
    all_entries = []

    for w in week_list:
        try:
            raw = fetch_week_matchups(args.league_id, w)
        except HTTPError as e:
            if args.debug:
                print(f"week {w}: HTTPError {e}", file=sys.stderr)
            continue
        except Exception as e:
            if args.debug:
                print(f"week {w}: error {e}", file=sys.stderr)
            continue

        if not isinstance(raw, list) or len(raw) == 0:
            continue

        for e in raw:
            if not isinstance(e, dict):
                continue
            rid = e.get("roster_id")
            mid = e.get("matchup_id")
            pts = compute_points(e)
            owner_id = roster_owner.get(rid)
            user = user_by_id.get(owner_id, {}) if owner_id else {}
            team_name = roster_team_name.get(rid) or user.get("display_name") or user.get("username") or str(owner_id or rid)

            entry = {
                "week": w,
                "matchup_id": mid,
                "roster_id": rid,
                "owner_id": owner_id,
                "username": user.get("username"),
                "display_name": user.get("display_name"),
                "team_name": team_name,
                "points": round(float(pts), 2),
            }
            all_entries.append(entry)

        games = pair_games_for_week(w, raw, roster_owner, user_by_id, roster_team_name)
        all_games.extend(games)

    out = {
        "season": args.season,
        "league_id": args.league_id,
        "league_name": league.get("name") if isinstance(league, dict) else None,
        "users": users,
        "rosters": rosters,
        "matchups": all_games,
        "entries": all_entries,
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "schema": "tatnalllegacy.sleeper.season.v2",
    }

    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    Path(f"data/{args.season}.json").write_text(payload, encoding="utf-8")
    Path(f"public/data/{args.season}.json").write_text(payload, encoding="utf-8")

    w17 = [e for e in all_entries if isinstance(e, dict) and e.get("week") == 17]
    vals = sorted([round(float(e.get("points") or 0), 2) for e in w17], reverse=True)
    print(f"wrote data/{args.season}.json and public/data/{args.season}.json")
    print("week17_points_sorted_desc", vals)


if __name__ == "__main__":
    main()
