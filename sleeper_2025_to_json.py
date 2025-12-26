#!/usr/bin/env python3
# Generates data/2025.json from Sleeper and updates manifest.json
import json, math, os, time
from pathlib import Path
from collections import defaultdict
import requests

YEAR = 2025
SLEEPER_LEAGUE_ID = os.getenv("SLEEPER_LEAG_ID", os.getenv("SLEEPER_LEAGUE_ID", "1262418074540195841"))

BASE = "https://api.sleeper.app/v1"
S = requests.Session()
S.headers.update({"User-Agent": "tatnall-legacy/1.2"})

# ---------- core http ----------
def get(url):
    r = S.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

# ---------- league core ----------
def load_core(league_id):
    users = get(f"{BASE}/league/{league_id}/users")
    rosters = get(f"{BASE}/league/{league_id}/rosters")

    users_out = []
    u_by_id = {}
    for u in users:
        name = u.get("display_name") or u.get("username") or f"user_{u.get('user_id')}"
        team_nick = (u.get("metadata") or {}).get("team_name")
        u_by_id[u["user_id"]] = {"name": name, "team_nick": team_nick}
        users_out.append({"user_id": u["user_id"], "display_name": name})

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

    return r_by_id, users_out, rosters

def discover_weeks(league_id, max_weeks=22):
    weeks = []
    for w in range(1, max_weeks + 1):
        try:
            arr = get(f"{BASE}/league/{league_id}/matchups/{w}")
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                break
            raise
        if not arr:
            break
        weeks.append(w)
    return weeks

def is_future_zero_zero(a_pts, b_pts):
    return YEAR == 2025 and float(a_pts or 0) == 0.0 and float(b_pts or 0) == 0.0

# ---------- standings + matchups ----------
def build_matchups_and_stats(league_id, r_by_id):
    weeks = discover_weeks(league_id)
    matchups = []
    pf = defaultdict(float)
    pa = defaultdict(float)
    wl = defaultdict(lambda: [0, 0, 0])  # wins, losses, ties

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
                pts = float(r.get("points") or 0)
                matchups.append(
                    {
                        "week": w,
                        "home_team": r_by_id.get(rid, {}).get("team_name"),
                        "home_score": pts,
                        "away_team": None,
                        "away_score": None,
                        "is_playoff": bool(r.get("playoff")),
                    }
                )
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

            matchups.append(
                {
                    "week": w,
                    "home_team": r_by_id.get(home["roster_id"], {}).get("team_name"),
                    "home_score": float(h_pts),
                    "away_team": r_by_id.get(away["roster_id"], {}).get("team_name"),
                    "away_score": float(a_pts2),
                    "is_playoff": bool(home.get("playoff") or away.get("playoff")),
                }
            )

            if is_future_zero_zero(a_pts, b_pts):
                continue

            pf[a_id] += a_pts
            pf[b_id] += b_pts
            pa[a_id] += b_pts
            pa[b_id] += a_pts
            if a_pts > b_pts:
                wl[a_id][0] += 1
                wl[b_id][1] += 1
            elif a_pts < b_pts:
                wl[b_id][0] += 1
                wl[a_id][1] += 1
            else:
                wl[a_id][2] += 1
                wl[b_id][2] += 1

    return matchups, pf, pa, wl, weeks

# ---------- player index ----------
def players_index():
    data = get("https://api.sleeper.app/v1/players/nfl")
    name, team, pos = {}, {}, {}
    for pid, p in data.items():
        nm = (
            p.get("full_name")
            or (f"{p.get('first_name','').strip()} {p.get('last_name','').strip()}".strip())
            or p.get("last_name")
            or pid
        )
        name[pid] = nm
        team[pid] = p.get("team")
        pos[pid] = p.get("position")
    return name, team, pos

# ---------- legacy transactions ----------
def build_transactions(league_id, r_by_id, weeks, name_map):
    txns = []
    for w in weeks:
        arr = get(f"{BASE}/league/{league_id}/transactions/{w}") or []
        if not arr:
            continue
        for t in arr:
            entries = []
            rid_fallback = None
            if isinstance(t.get("roster_ids"), list) and t["roster_ids"]:
                rid_fallback = t["roster_ids"][0]
            for pid, rid2 in (t.get("adds") or {}).items():
                team_name2 = r_by_id.get(rid2, {}).get("team_name") or r_by_id.get(rid_fallback, {}).get("team_name")
                entries.append({"type": "ADD", "team": team_name2, "player": name_map.get(pid, pid), "faab": t.get("waiver_bid")})
            for pid, rid2 in (t.get("drops") or {}).items():
                team_name2 = r_by_id.get(rid2, {}).get("team_name") or r_by_id.get(rid_fallback, {}).get("team_name")
                entries.append({"type": "DROP", "team": team_name2, "player": name_map.get(pid, pid), "faab": None})
            if t.get("type") == "trade":
                for pid in (t.get("adds") or {}).keys():
                    entries.append({"type": "TRADE", "team": r_by_id.get(rid_fallback, {}).get("team_name"), "player": name_map.get(pid, pid), "faab": None})
            if entries:
                txns.append({"date": f"Week {w}", "entries": entries})
    return txns

# ---------- draft table for legacy UI ----------
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
        out.append(
            {
                "round": p.get("round"),
                "overall": p.get("pick_no"),
                "team": r_by_id.get(p.get("roster_id"), {}).get("team_name"),
                "player": (name_map.get(pid) or pid),
                "player_nfl": team_map.get(pid),
                "keeper": bool(p.get("is_keeper")),
            }
        )
    out.sort(key=lambda x: (x.get("overall") or 0))
    return out

def build_teams(r_by_id, pf, pa, wl):
    teams = []
    order = sorted(r_by_id.keys(), key=lambda rid: (wl[rid][0], pf[rid]), reverse=True)
    rank_by_rid = {rid: i + 1 for i, rid in enumerate(order)}
    for rid, meta in r_by_id.items():
        w, l, t = wl[rid]
        record = f"{w}-{l}-{t}" if t else f"{w}-{l}"
        teams.append(
            {
                "team_id": rid,
                "team_name": meta["team_name"],
                "owner": meta["owner_name"],
                "record": record,
                "points_for": round(pf[rid], 2),
                "points_against": round(pa[rid], 2),
                "regular_season_rank": rank_by_rid.get(rid),
                "final_rank": None,
            }
        )
    teams.sort(key=lambda t: (t.get("regular_season_rank") or math.inf, t["team_name"]))
    return teams

# ---------- NEW: data for app ----------
def draft_day_roster(league_id):
    drafts = get(f"{BASE}/league/{league_id}/drafts") or []
    if not drafts:
        return {}, None, []
    drafts.sort(key=lambda d: d.get("created", 0), reverse=True)
    draft_id = drafts[0]["draft_id"]
    picks = get(f"{BASE}/draft/{draft_id}/picks") or []
    by_r = defaultdict(list)
    for p in picks:
        rid = p.get("roster_id")
        pid = p.get("player_id")
        if rid and pid:
            by_r[str(rid)].append(pid)
    return dict(by_r), draft_id, picks

def current_roster(rosters):
    by_r = defaultdict(list)
    for r in rosters:
        rid = r["roster_id"]
        for pid in (r.get("players") or []):
            by_r[str(rid)].append(pid)
    return dict(by_r)

def player_points(league_id, weeks):
    by_week = {}
    for w in weeks:
        m = get(f"{BASE}/league/{league_id}/matchups/{w}")
        pts = {}
        for row in m:
            for pid, ppts in (row.get("players_points") or {}).items():
                pts[pid] = pts.get(pid, 0.0) + float(ppts or 0.0)
        by_week[str(w)] = pts
    cumulative = defaultdict(float)
    for wk, mp in by_week.items():
        for pid, val in mp.items():
            cumulative[pid] += float(val or 0.0)
    return by_week, dict(cumulative), len(weeks)

def fetch_raw_transactions(league_id, weeks, tail_extra=6):
    raw = []
    last_wk = weeks[-1] if weeks else 1
    for w in range(1, last_wk + tail_extra + 1):
        arr = get(f"{BASE}/league/{league_id}/transactions/{w}") or []
        for t in arr:
            if t.get("status") != "complete":
                continue
            entry = {
                "transaction_id": t.get("transaction_id"),
                "type": t.get("type"),
                "executed": t.get("executed") or t.get("created"),
                "week": w,
                "adds": t.get("adds") or {},
                "drops": t.get("drops") or {},
                "roster_ids": t.get("roster_ids") or [],
            }
            raw.append(entry)
    raw.sort(key=lambda x: x["executed"] or 0)
    return raw

def build_acquisitions_and_scores(r_by_id, draft_map, raw_txs, points_by_week, weeks_complete):
    ownership = {}
    hist = defaultdict(list)  # (pid,rid)->list of events
    for rid, plist in draft_map.items():
        for pid in plist:
            ownership[pid] = int(rid)
            hist[(pid, int(rid))].append({"method": "draft", "week": 1})

    def points_after_week(pid, wk_inclusive):
        total = 0.0
        for wk in range(max(1, wk_inclusive), weeks_complete + 1):
            total += float(points_by_week.get(str(wk), {}).get(pid, 0.0))
        return total

    trade_evals = []
    for tx in raw_txs:
        ttype = tx["type"]
        ro_in = defaultdict(list)
        ro_out = defaultdict(list)
        for pid, rid in tx["adds"].items():
            ro_in[int(rid)].append(pid)
        for pid, rid in tx["drops"].items():
            ro_out[int(rid)].append(pid)

        for rid, pids in ro_in.items():
            for pid in pids:
                prev = ownership.get(pid)
                if prev == rid:
                    continue
                method = "trade" if ttype == "trade" else ("waivers" if ttype == "waiver" else "fa")
                hist[(pid, rid)].append({"method": method, "week": tx["week"], "from_roster_id": prev, "tx_id": tx["transaction_id"]})
                ownership[pid] = rid

        if ttype == "trade":
            per_roster = []
            for rid in sorted(set(ro_in.keys()) | set(ro_out.keys())):
                players_in = ro_in.get(rid, [])
                players_out = ro_out.get(rid, [])
                pts_in = sum(points_after_week(p, tx["week"]) for p in players_in)
                pts_out = sum(points_after_week(p, tx["week"]) for p in players_out)
                net = pts_in - pts_out
                scale = 100.0
                score = int(round(50 + 50 * math.tanh(net / scale)))
                per_roster.append(
                    {
                        "roster_id": rid,
                        "team_name": r_by_id.get(rid, {}).get("team_name"),
                        "players_in": players_in,
                        "players_out": players_out,
                        "net_points_after": round(net, 2),
                        "score_0_to_100": score,
                    }
                )
            trade_evals.append({"tx_id": tx["transaction_id"], "week": tx["week"], "executed": tx["executed"], "per_roster": per_roster})

    acquisitions = []
    for (pid, rid), h in hist.items():
        acquisitions.append({"player_id": pid, "roster_id": rid, "obtained": h[0], "history": h})

    return acquisitions, trade_evals

# ---------- driver ----------
def main():
    root = Path(__file__).resolve().parent
    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)

    r_by_id, users_out, rosters_raw = load_core(SLEEPER_LEAGUE_ID)
    matchups, pf, pa, wl, weeks = build_matchups_and_stats(SLEEPER_LEAGUE_ID, r_by_id)
    name_map, nfl_team_map, pos_map = players_index()

    transactions = build_transactions(SLEEPER_LEAGUE_ID, r_by_id, weeks, name_map)
    draft_table = build_draft(SLEEPER_LEAGUE_ID, r_by_id, name_map, nfl_team_map)
    teams = build_teams(r_by_id, pf, pa, wl)

    draft_map, draft_id, raw_picks = draft_day_roster(SLEEPER_LEAGUE_ID)
    current_map = current_roster(rosters_raw)
    by_week_pts, cumulative_pts, weeks_complete = player_points(SLEEPER_LEAGUE_ID, weeks)
    raw_txs = fetch_raw_transactions(SLEEPER_LEAGUE_ID, weeks)
    acquisitions, trade_evals = build_acquisitions_and_scores(r_by_id, draft_map, raw_txs, by_week_pts, weeks_complete)

    # FIX: never do list | set; build one set with set unions
    all_pids = set(cumulative_pts.keys())
    all_pids |= {p for lst in draft_map.values() for p in lst}
    all_pids |= {p for lst in current_map.values() for p in lst}

    player_index = {}
    for pid in all_pids:
        player_index[pid] = {"full_name": name_map.get(pid, pid), "team": nfl_team_map.get(pid), "pos": pos_map.get(pid)}

    out = {
        "year": YEAR,
        "teams": teams,
        "matchups": matchups,
        "transactions": transactions,
        "draft": draft_table,
        "users": users_out,
        "player_index": player_index,
        "draft_day_roster": draft_map,
        "current_roster": current_map,
        "raw_transactions": raw_txs,
        "player_points": {"by_week": by_week_pts, "cumulative": cumulative_pts, "weeks_complete": weeks_complete},
        "acquisitions": acquisitions,
        "trade_evals": trade_evals,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "league_id": SLEEPER_LEAGUE_ID,
        "draft_id": draft_id,
    }

    (data_dir / f"{YEAR}.json").write_text(json.dumps(out, indent=2))

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
