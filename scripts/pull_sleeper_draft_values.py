import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "data_raw" / "sleeper"


def fetch_json(url):
  req = Request(url, headers={"User-Agent": "TatnallLegacy/1.0"})
  with urlopen(req, timeout=30) as resp:
    raw = resp.read()
  return json.loads(raw)


def read_json(path: Path):
  with path.open("r", encoding="utf-8") as handle:
    return json.load(handle)


def resolve_league_id(season, league_id):
  if league_id:
    return league_id
  season_path = DATA_DIR / f"{season}.json"
  if season_path.exists():
    payload = read_json(season_path)
    value = payload.get("league_id")
    if value:
      return str(value)
  tx_path = DATA_DIR / f"transactions-{season}.json"
  if tx_path.exists():
    payload = read_json(tx_path)
    value = payload.get("league_id")
    if value:
      return str(value)
  return None


def pick_amount(pick):
  metadata = pick.get("metadata") or {}
  for key in ("amount", "auction_price", "price"):
    value = metadata.get(key)
    if value is None:
      continue
    try:
      return int(float(value))
    except (TypeError, ValueError):
      continue
  return None


def select_draft(drafts, season):
  season_str = str(season)
  candidates = [draft for draft in drafts if str(draft.get("season")) == season_str]
  if not candidates:
    return None
  def sort_key(draft):
    status = draft.get("status") == "complete"
    return (
      1 if status else 0,
      draft.get("start_time") or 0,
      draft.get("created") or 0,
    )
  candidates.sort(key=sort_key, reverse=True)
  return candidates[0]


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--season", type=int, required=True)
  parser.add_argument("--league-id", dest="league_id")
  args = parser.parse_args()

  league_id = resolve_league_id(args.season, args.league_id)
  if not league_id:
    print("ERROR: Missing league_id. Provide --league-id or ensure data/{season}.json has league_id.", file=sys.stderr)
    sys.exit(1)

  drafts_url = f"https://api.sleeper.app/v1/league/{league_id}/drafts"
  drafts = fetch_json(drafts_url)
  if not isinstance(drafts, list):
    print(f"ERROR: Expected draft list from {drafts_url}", file=sys.stderr)
    sys.exit(1)

  draft = select_draft(drafts, args.season)
  if not draft:
    print(f"ERROR: No draft found for season {args.season}.", file=sys.stderr)
    sys.exit(1)

  draft_id = draft.get("draft_id")
  if not draft_id:
    print("ERROR: Draft missing draft_id.", file=sys.stderr)
    sys.exit(1)

  picks_url = f"https://api.sleeper.app/v1/draft/{draft_id}/picks"
  picks = fetch_json(picks_url)
  if not isinstance(picks, list):
    print(f"ERROR: Expected pick list from {picks_url}", file=sys.stderr)
    sys.exit(1)

  values = {}
  picks_out = []
  for pick in picks:
    player_id = pick.get("player_id")
    if not player_id:
      continue
    amount = pick_amount(pick)
    if amount is None:
      continue
    key = str(player_id)
    prev = values.get(key)
    if prev is None or amount > prev:
      values[key] = amount
    picks_out.append(
      {
        "player_id": key,
        "amount": amount,
        "pick_no": pick.get("pick_no"),
        "round": pick.get("round"),
        "roster_id": pick.get("roster_id"),
      }
    )

  payload = {
    "season": args.season,
    "league_id": league_id,
    "draft_id": draft_id,
    "draft_type": draft.get("type"),
    "status": draft.get("status"),
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "values": values,
    "picks": picks_out,
  }

  OUT_DIR.mkdir(parents=True, exist_ok=True)
  out_path = OUT_DIR / f"draft_values_{args.season}.json"
  out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
  print(f"Wrote {out_path} ({len(values)} values)")


if __name__ == "__main__":
  main()
