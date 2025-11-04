#!/usr/bin/env python3
"""
Builds data/trades-<YEAR>.json from Sleeper, without changing your existing data/<YEAR>.json.
Schema is simple and consumption-ready for trade.html.

Output (example):
{
  "year": 2025,
  "league_id": "1262418074540195841",
  "teams": [
    {"roster_id": 1, "team": "Insane in The Achane ", "owner_id": "…", "owner_name": "…"},
    ...
  ],
  "trades": [
    {
      "id": "tx_987654321",
      "week": 3,
      "created": 1731195023123,              # epoch ms if available, else null
      "status": "complete",
      "parties": [
        {
          "roster_id": 1,
          "team": "Insane in The Achane ",
          "gained_players": [{"id":"1234","name":"Bo Nix","pos":"QB","nfl":"DEN"}],
          "sent_players":   [{"id":"5678","name":"Dylan Sampson","pos":"RB","nfl":"TEN"}],
          "gained_picks":   [{"season":2026,"round":2,"original_roster_id":5}],
          "sent_picks":     []
        },
        ...
      ]
    },
    ...
  ]
}
"""
import os, json, time, math
from collections import defaultdict
from pathlib import Path
import requests

YEAR = int(os.getenv("YEAR", "2025"))
LEAGUE_ID = os.getenv("SLEEPER_LEAGUE_ID", "1262418074540195841")
BASE = "https://api.sleeper.app/v1"

S = requests.Session()
S.headers.update({"User-Agent": "tatnall-legacy-trades/1.0"})

def get(url):
    r = S.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

def fetch_players():
    data = get(f"{BASE}/players/nfl")
    out = {}
    for pid, p in (data or {}).items():
        nm = p.get("full_name") or f"{(p.get('first_name') or '').strip()} {(p.get('last_name') or '').strip()}".strip() or p.get("last_name") or pid
        out[pid] = {
            "name": nm,
            "pos": p.get("position"),
            "nfl": p.get("team") or p.get("active_team"),
        }
    return out

def league_core(league_id):
    users = get(f"{BASE}/league/{league_id}/users") or []
    rosters = get(f"{BASE}/league/{league_id}/rosters") or []
    u_by_id = {u["user_id"]: u for u in users}
    teams = []
    for r in rosters:
        owner = u_by_id.get(r.get("owner_id"), {})
        team_name = (owner.get("metadata") or {}).get("team_name") \
                    or (owner.get("metadata") or {}).get("nickname") \
                    or owner.get("display_name") \
                    or f"Roster {r.get('roster_id')}"
        teams.append({
            "roster_id": r.get("roster_id"),
            "team": team_name,
            "owner_id": r.get("owner_id"),
            "owner_name": owner.get("display_name") or "",
        })
    rname = {t["roster_id"]: t["team"] for t in teams}
    return teams, rname

def discover_weeks(league_id, max_weeks=22):
    weeks = []
    for w in range(1, max_weeks+1):
        try:
            arr = get(f"{BASE}/league/{league_id}/matchups/{w}")
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                break
            raise
        if not arr:
            break
        weeks.append(w)
    return weeks or list(range(1, 19))

def normalize_trade_txn(t, roster_label, players_idx):
    """
    Sleeper transaction (type=trade) fields used:
      t['adds']  -> {player_id: to_roster_id}
      t['drops'] -> {player_id: from_roster_id}
      t.get('draft_picks') -> [{season, round, roster_id, owner_id, previous_owner_id, ...}]
      t['roster_ids'] -> list of involved rosters (optional but usually present)
    """
    adds  = t.get("adds")  or {}
    drops = t.get("drops") or {}
    picks = t.get("draft_picks") or []

    parties = defaultdict(lambda: {
        "gained_players": [],
        "sent_players":   [],
        "gained_picks":   [],
        "sent_picks":     [],
    })

    # players gained (adds target rid)
    for pid, to_rid in adds.items():
        meta = players_idx.get(pid, {})
        parties[int(to_rid)]["gained_players"].append({
            "id": pid, "name": meta.get("name") or pid,
            "pos": meta.get("pos"), "nfl": meta.get("nfl")
        })

    # players sent (drops source rid)
    for pid, from_rid in drops.items():
        meta = players_idx.get(pid, {})
        parties[int(from_rid)]["sent_players"].append({
            "id": pid, "name": meta.get("name") or pid,
            "pos": meta.get("pos"), "nfl": meta.get("nfl")
        })

    # picks: Sleeper provides both sides per object via previous_owner_id/owner_id.
    # Treat owner_id as "to" (gained), previous_owner_id as "from" (sent).
    for p in picks:
        to_rid   = p.get("owner_id") or p.get("roster_id")
        from_rid = p.get("previous_owner_id")
        pick_obj = {k: p.get(k) for k in ("season","round","roster_id","previous_owner_id","owner_id")}
        if to_rid:
            parties[int(to_rid)]["gained_picks"].append(pick_obj)
        if from_rid:
            parties[int(from_rid)]["sent_picks"].append(pick_obj)

    # Build final party list with labels, keep only participants
    out_parties = []
    for rid, payload in parties.items():
        if not any([payload["gained_players"], payload["sent_players"], payload["gained_picks"], payload["sent_picks"]]):
            continue
        out_parties.append({
            "roster_id": rid,
            "team": roster_label.get(rid) or f"Roster {rid}",
            **payload
        })

    # As safety, if Sleeper omitted drops for one side but adds appeared elsewhere,
    # infer "sent" as all other sides' gains not already in my gains.
    if len(out_parties) >= 2:
        all_gained = set()
        for p in out_parties:
            for gp in p["gained_players"]:
                all_gained.add(gp["id"])
        for p in out_parties:
            my_gained = {gp["id"] for gp in p["gained_players"]}
            inferred_sent = [pid for pid in all_gained if pid not in my_gained]
            if inferred_sent and not p["sent_players"]:
                for pid in inferred_sent:
                    meta = players_idx.get(pid, {})
                    p["sent_players"].append({
                        "id": pid, "name": meta.get("name") or pid,
                        "pos": meta.get("pos"), "nfl": meta.get("nfl")
                    })

    out_parties.sort(key=lambda x: (x["team"], x["roster_id"] or 0))
    return {
        "id": str(t.get("transaction_id") or f"{t.get('leg',0)}-{t.get('status_updated') or ''}"),
        "week": int(t.get("week") or 0),
        "created": t.get("status_updated") or t.get("created") or None,
        "status": t.get("status") or "complete",
        "parties": out_parties,
    }

def build_trades(league_id):
    players_idx = fetch_players()
    teams, roster_label = league_core(league_id)
    weeks = discover_weeks(league_id)

    trades = []
    for w in weeks:
        arr = get(f"{BASE}/league/{league_id}/transactions/{w}") or []
        for t in arr:
            if t.get("type") != "trade":
                continue
            tx = dict(t)
            tx["week"] = w  # ensure week present for normalization
            trades.append(normalize_trade_txn(tx, roster_label, players_idx))
    # de-dup by id if API gave overlaps
    seen = set()
    uniq = []
    for t in trades:
        key = (t["id"], t["week"])
        if key in seen: continue
        seen.add(key); uniq.append(t)
    uniq.sort(key=lambda x: (x["week"], x["created"] or 0, x["id"]))
    return {"year": YEAR, "league_id": str(league_id), "teams": teams, "trades": uniq}

def main():
    root = Path(__file__).resolve().parent
    out_path = root / "data" / f"trades-{YEAR}.json"
    out_path.parent.mkdir(exist_ok=True)
    payload = build_trades(LEAGUE_ID)
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {out_path} with {len(payload['trades'])} trades.")

if __name__ == "__main__":
    main()
