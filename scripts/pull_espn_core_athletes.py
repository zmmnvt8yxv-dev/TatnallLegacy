#!/usr/bin/env python3
import argparse, csv, json, os, random, time
from pathlib import Path

import requests
from tqdm import tqdm

INDEX_URL = "https://sports.core.api.espn.com/v3/sports/football/nfl/athletes?limit=200000"
DETAIL_URL = "https://sports.core.api.espn.com/v3/sports/football/nfl/athletes/{id}"

def mkdir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def get_json(session: requests.Session, url: str, timeout=45):
    r = session.get(url, timeout=timeout, headers={"User-Agent": "TatnallLegacy/1.0 (data pull)"})
    return r.status_code, r.text

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default="data_raw/espn_core")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--max-athletes", type=int, default=0, help="0 = no limit")
    ap.add_argument("--min-delay", type=float, default=0.15)
    ap.add_argument("--max-delay", type=float, default=0.45)
    ap.add_argument("--sample-chars", type=int, default=0, help="Print first N chars of FIRST fetched detail JSON then exit")
    ap.add_argument("--index-only", action="store_true", help="Only save index items, do not fetch per-athlete detail")
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    idx_dir = out_dir / "index"
    ath_dir = out_dir / "athletes"
    mkdir(idx_dir); mkdir(ath_dir)

    seen_path = out_dir / "seen_ids.txt"
    seen = set()
    if args.resume and seen_path.exists():
        seen = set(x.strip() for x in seen_path.read_text(encoding="utf-8").splitlines() if x.strip())

    log_csv = out_dir / "pull_log.csv"
    new_log = not log_csv.exists()
    lf = log_csv.open("a", newline="", encoding="utf-8")
    lw = csv.writer(lf)
    if new_log:
        lw.writerow(["espn_id","status","http_status","error","path","bytes"])

    session = requests.Session()

    # ---- Pull index
    st, text = get_json(session, INDEX_URL)
    idx_file = idx_dir / "athletes_index_001.json"
    idx_file.write_text(text, encoding="utf-8")

    if st != 200:
        raise SystemExit(f"[index] HTTP {st}")

    data = json.loads(text)
    items = data.get("items", [])
    if not isinstance(items, list) or not items:
        raise SystemExit("Index JSON has no items[] list (unexpected).")

    # Save a flat CSV of index items for Excel auditing
    idx_csv = idx_dir / "athletes_index_items.csv"
    # pick a stable set of columns + keep the raw JSON too
    cols = ["id","fullName","displayName","firstName","lastName","shortName","active","jersey","age","dateOfBirth"]
    with idx_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols + ["raw_json"])
        for it in items:
            row = [it.get(c, "") for c in cols]
            row.append(json.dumps(it, ensure_ascii=False))
            w.writerow(row)

    print(f"[index] items: {len(items)} saved to {idx_csv}")

    if args.index_only:
        print("Index-only mode: done.")
        return

    # ---- Fetch per-athlete detail
    n = 0
    for it in tqdm(items, desc="Fetching ESPN athlete detail", unit="ath"):
        espn_id = str(it.get("id","")).strip()
        if not espn_id.isdigit():
            continue
        if args.resume and espn_id in seen:
            continue

        url = DETAIL_URL.format(id=espn_id)
        st, body = get_json(session, url)

        out_path = ath_dir / f"{espn_id}.json"
        if st != 200:
            lw.writerow([espn_id,"error",st,f"HTTP {st}",str(out_path),""])
            lf.flush()
        else:
            out_path.write_text(body, encoding="utf-8")
            lw.writerow([espn_id,"ok",st,"",str(out_path),out_path.stat().st_size])
            lf.flush()

            if args.sample_chars:
                print(body[:args.sample_chars])
                return

        seen.add(espn_id)
        seen_path.write_text("\n".join(sorted(seen)), encoding="utf-8")

        n += 1
        if args.max_athletes and n >= args.max_athletes:
            break

        time.sleep(random.uniform(args.min_delay, args.max_delay))

    print("Done.")
    print("Athletes dir:", ath_dir)
    print("Log:", log_csv)

if __name__ == "__main__":
    main()
