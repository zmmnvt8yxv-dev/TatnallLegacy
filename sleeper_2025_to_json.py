#!/usr/bin/env python3
# Generates data/2025.json and updates manifest.json
import json, math
from pathlib import Path
from collections import defaultdict
import os, requests

YEAR = 2025
SLEEPER_LEAGUE_ID = os.getenv("SLEEPER_LEAGUE_ID", "1262418074540195841")  # env override supported

BASE = "https://api.sleeper.app/v1"
S = requests.Session()
S.headers.update({"User-Agent": "tatnall-legacy/1.0"})

def get(url):
    r = S.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

def load_core(league_id):
    users  = get(f"{BASE}/league/{league_id}/users")
    rosters= get(f"{BASE}/league/{league_id}/rosters")
    u_by_id = {}
    for u in users:
        name = u.get("display_name") or u.get("username") or f"user_{u.get('user_id')}"
        team_nick = (u.get("metadata") or {}).get("team_name")
        u_by_id[u["user_id"]] = {"name": name, "team_nick": team_nick}
    r_by_id = {}
    for r in rosters:
        owner_id = r.get("owner_id")
        meta = r.get("metadata") or {}
        rteam = meta.get("team_name") or meta.get("nickname")
        fallback = None
        if owner_id and owner_id in u_by_id:
            fallback = u_by_id[owner_id]["team_nick"] or u_by_id[owner_id]["name"]
        r_by_id[r["roster_id"]] = {
            "owner_id": owner_id,
            "owner_name": u_by_id.get(owner_id, {}).get("name", "Unknown"),
            "team_name": rteam or fallback or f"Roster {r['roster_id']}",
        }
    return r_by_id

def discover_weeks(league_id, max_weeks=22):
    weeks = []
    for w in range(1, max_weeks+1):
        try:
            arr = get(f"{BASE}/league/{league_id}/matchups/{w}")
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                break
            raise
        if not arr:
            break
        weeks.append(w)
    return weeks

def build_matchups_and_stats(league_id, r_by_id):
    weeks = discover_weeks(league_id)
    matchups = []
    pf = defaultdict(float)
    pa = defaultdict(float)
    wl = defaultdict(lambda: [0,0,0])  # wins, losses, ties
    for w in weeks:
        wk = get(f"{BASE}/league/{league_id}/matchups/{w}")
        by_mid = defaultdict(list)
        for row in wk:
            if "roster_id" in row:
                by_mid[row.get("matchup_id")].append(row)
        for _, rows in by_mid.items():
            if len(rows) < 2:
                r = rows[0]
                rid = r["roster_id"]
                team = r_by_id.get(rid, {})
                pts = float(r.get("points") or 0)
                matchups.append({
                    "week": w,
                    "home_team": team.get("team_name"),
                    "home_score": pts,
                    "away_team": None,
                    "away_score": None,
                    "is_playoff": bool(r.get("playoff"))
                })
                pf[rid] += pts
                continue
            rows.sort(key=lambda x: float(x.get("points") or 0), reverse=True)
            a, b = rows[0], rows[1]
            a_id, b_id = a["roster_id"], b["roster_id"]
            a_pts, b_pts = float(a.get("points") or 0), float(b.get("points") or 0)
            if a_id <= b_id:
                home, away = a, b
                h_pts, a_pts2 = a_pts, b_pts
            else:
                home, away = b, a
                h_pts, a_pts2 = b_pts, a_pts
                a_id, b_id = b_id, a_id
                a_pts, b_pts = b_pts, a_pts
            matchups.append({
                "week": w,
                "home_team": r_by_id.get(home["roster_id"], {}).get("team_name"),
                "home_score": float(h_pts),
                "away_team": r_by_id.get(away["roster_id"], {}).get("team_name"),
                "away_score": float(a_pts2),
                "is_playoff": bool(home.get("playoff") or away.get("playoff")),
            })
            pf[a_id] += a_pts; pf[b_id] += b_pts
            pa[a_id] += b_pts; pa[b_id] += a_pts
            if a_pts > b_pts: wl[a_id][0]+=1; wl[b_id][1]+=1
            elif a_pts < b_pts: wl[b_id][0]+=1; wl[a_id][1]+=1
            else: wl[a_id][2]+=1; wl[b_id][2]+=1
    return matchups, pf, pa, wl, weeks

def players_index():
    data = get("https://api.sleeper.app/v1/players/nfl")
    name, team = {}, {}
    for pid, p in data.items():
        nm = p.get("full_name") or (f"{p.get('first_name','').strip()} {p.get('last_name','').strip()}".strip()) or p.get("last_name") or pid
        name[pid] = nm
        team[pid] = p.get("team")
    return name, team

def build_transactions(league_id, r_by_id, weeks, name_map):
    txns = []
    for w in weeks:
        arr = get(f"{BASE}/league/{league_id}/transactions/{w}") or []
        if not arr: 
            continue
        for t in arr:
            entries = []
            # prefer per-entry roster -> team mapping; fallback to first roster_ids
            rid_fallback = None
            if isinstance(t.get("roster_ids"), list) and t["roster_ids"]:
                rid_fallback = t["roster_ids"][0]
            # adds
            for pid, rid2 in (t.get("adds") or {}).items():
                team_name2 = r_by_id.get(rid2, {}).get("team_name") or r_by_id.get(rid_fallback, {}).get("team_name")
                entries.append({"type": "ADD", "team": team_name2, "player": name_map.get(pid, pid), "faab": t.get("waiver_bid")})
            # drops
            for pid, rid2 in (t.get("drops") or {}).items():
                team_name2 = r_by_id.get(rid2, {}).get("team_name") or r_by_id.get(rid_fallback, {}).get("team_name")
                entries.append({"type": "DROP", "team": team_name2, "player": name_map.get(pid, pid), "faab": None})
            # trades (coarse)
            if t.get("type") == "trade":
                for pid in (t.get("adds") or {}).keys():
                    entries.append({"type": "TRADE", "team": r_by_id.get(rid_fallback, {}).get("team_name"), "player": name_map.get(pid, pid), "faab": None})
            if entries:
                txns.append({"date": f"Week {w}", "entries": entries})
    return txns

def build_draft(league_id, r_by_id, name_map, team_map):
    drafts = get(f"{BASE}/league/{league_id}/drafts") or []
    if not drafts:
        return []
    drafts.sort(key=lambda d: d.get("created", 0), reverse=True)
    draft_id = drafts[0]["draft_id"]
    picks = get(f"{BASE}/draft/{draft_id}/picks") or []
    out = []
    for p in picks:
        pid = p.get("player_id")
        out.append({
            "round": p.get("round"),
            "overall": p.get("pick_no"),
            "team": r_by_id.get(p.get("roster_id"), {}).get("team_name"),
            "player": (name_map.get(pid) or pid),
            "player_nfl": team_map.get(pid),
            "keeper": bool(p.get("is_keeper"))
        })
    out.sort(key=lambda x: (x.get("overall") or 0))
    return out

def build_teams(r_by_id, pf, pa, wl):
    teams = []
    # rank by wins desc, PF desc
    order = sorted(r_by_id.keys(), key=lambda rid: (wl[rid][0], pf[rid]), reverse=True)
    rank_by_rid = {rid: i+1 for i, rid in enumerate(order)}
    for rid, meta in r_by_id.items():
        w,l,t = wl[rid]
        record = f"{w}-{l}-{t}" if t else f"{w}-{l}"
        teams.append({
            "team_id": rid,
            "team_name": meta["team_name"],
            "owner": meta["owner_name"],
            "record": record,
            "points_for": round(pf[rid], 2),
            "points_against": round(pa[rid], 2),
            "regular_season_rank": rank_by_rid.get(rid),
            "final_rank": None
        })
    teams.sort(key=lambda t: (t.get("regular_season_rank") or math.inf, t["team_name"]))
    return teams

def main():
    root = Path(__file__).resolve().parent
    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)

    r_by_id = load_core(SLEEPER_LEAGUE_ID)
    matchups, pf, pa, wl, weeks = build_matchups_and_stats(SLEEPER_LEAGUE_ID, r_by_id)
    name_map, nfl_team_map = players_index()
    transactions = build_transactions(SLEEPER_LEAGUE_ID, r_by_id, weeks, name_map)
    draft = build_draft(SLEEPER_LEAGUE_ID, r_by_id, name_map, nfl_team_map)
    teams = build_teams(r_by_id, pf, pa, wl)

    out = {"year": YEAR, "teams": teams, "matchups": matchups, "transactions": transactions, "draft": draft}
    (data_dir / f"{YEAR}.json").write_text(json.dumps(out, indent=2))

    # manifest
    manifest_path = root / "manifest.json"
    years = []
    if manifest_path.exists():
        try:
            years = json.loads(manifest_path.read_text()).get("years", [])
        except Exception:
            years = []
    if YEAR not in years:
        years.append(YEAR)
    years = sorted({int(x) for x in years})
    manifest_path.write_text(json.dumps({"years": years}, indent=2))

if __name__ == "__main__":
    main()
