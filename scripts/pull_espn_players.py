#!/usr/bin/env python3
import argparse
import json
import os
import random
import time
from pathlib import Path

import requests
from tqdm import tqdm

BASE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{}/overview"

def fetch_espn_player(espn_id, out_dir, max_chars):
    out_path = out_dir / f"{espn_id}.json"
    tmp_path = out_dir / f".{espn_id}.tmp"

    if out_path.exists():
        return "exists", None, out_path.stat().st_size

    url = BASE_URL.format(espn_id)
    try:
        r = requests.get(url, timeout=15)
        status = r.status_code
        text = r.text[:max_chars]

        payload = {
            "meta": {
                "espn_id": espn_id,
                "url": url,
                "http_status": status,
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            "raw": text,
        }

        tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp_path, out_path)

        return "ok" if status == 200 else "http_" + str(status), status, len(text)

    except Exception as e:
        payload = {
            "meta": {
                "espn_id": espn_id,
                "url": url,
                "error": str(e),
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        }
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp_path, out_path)
        return "error", None, 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int, default=100000)
    parser.add_argument("--min-delay", type=float, default=0.25)
    parser.add_argument("--max-delay", type=float, default=0.75)
    parser.add_argument("--max-chars", type=int, default=100000)
    args = parser.parse_args()

    out_dir = Path("data_raw/espn_players")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Pulling ESPN players {args.start} → {args.end}")
    print(f"Saving up to {args.max_chars} characters per response")

    for espn_id in tqdm(range(args.start, args.end + 1)):
        status, http_status, size = fetch_espn_player(
            espn_id, out_dir, args.max_chars
        )

        # polite rate limiting
        time.sleep(random.uniform(args.min_delay, args.max_delay))


if __name__ == "__main__":
    main()
