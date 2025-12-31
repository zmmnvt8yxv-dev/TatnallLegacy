import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup, Comment

BASE_URL = "https://www.pro-football-reference.com/players"
TABLE_IDS = {
    "passing": "passing",
    "rushing": "rushing_and_receiving",
    "defense": "defense",
    "kicking": "kicking",
}


@dataclass
class PlayerCareerStats:
    player_id: str
    name: str
    position: Optional[str]
    team: Optional[str]
    source_url: str
    career_stats: Dict[str, Dict[str, float]]


def parse_number(value: str) -> Optional[float]:
    cleaned = value.strip().replace(",", "")
    if cleaned in {"", "-"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def fetch_player_page(player_id: str) -> str:
    url = f"{BASE_URL}/{player_id[0]}/{player_id}.htm"
    response = requests.get(url, timeout=20)
    response.raise_for_status()
    return response.text


def find_table(soup: BeautifulSoup, table_id: str) -> Optional[BeautifulSoup]:
    table = soup.find("table", id=table_id)
    if table:
        return table

    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        if table_id not in comment:
            continue
        fragment = BeautifulSoup(comment, "html.parser")
        table = fragment.find("table", id=table_id)
        if table:
            return table
    return None


def parse_career_row(table: BeautifulSoup) -> Optional[BeautifulSoup]:
    tfoot = table.find("tfoot")
    if tfoot:
        row = tfoot.find("tr")
        if row:
            return row

    for row in table.select("tbody tr"):
        header = row.find("th", {"data-stat": "year_id"})
        if header and header.get_text(strip=True) == "Career":
            return row
    return None


def parse_stats_from_row(row: BeautifulSoup) -> Dict[str, float]:
    stats: Dict[str, float] = {}
    for cell in row.find_all(["td", "th"]):
        data_stat = cell.get("data-stat")
        if not data_stat:
            continue
        value = parse_number(cell.get_text())
        if value is None:
            continue
        stats[data_stat] = value
    return stats


def parse_player_meta(soup: BeautifulSoup) -> Dict[str, Optional[str]]:
    meta = soup.find(id="meta")
    if not meta:
        return {"name": None, "position": None, "team": None}

    name_tag = meta.find("h1")
    name = name_tag.get_text(strip=True) if name_tag else None

    position = None
    team = None

    for paragraph in meta.find_all("p"):
        text = paragraph.get_text(" ", strip=True)
        if "Position" in text and position is None:
            match = re.search(r"Position\s*:\s*([A-Za-z0-9/]+)", text)
            if match:
                position = match.group(1)
        if "Team" in text and team is None:
            match = re.search(r"Team\s*:\s*([A-Za-z0-9\s.]+)", text)
            if match:
                team = match.group(1).strip()

    return {"name": name, "position": position, "team": team}


def build_player_stats(player_id: str) -> PlayerCareerStats:
    html = fetch_player_page(player_id)
    soup = BeautifulSoup(html, "html.parser")
    meta = parse_player_meta(soup)

    career_stats: Dict[str, Dict[str, float]] = {}
    for label, table_id in TABLE_IDS.items():
        table = find_table(soup, table_id)
        if not table:
            continue
        row = parse_career_row(table)
        if not row:
            continue
        stats = parse_stats_from_row(row)
        if stats:
            career_stats[label] = stats

    source_url = f"{BASE_URL}/{player_id[0]}/{player_id}.htm"
    return PlayerCareerStats(
        player_id=player_id,
        name=meta["name"] or player_id,
        position=meta["position"],
        team=meta["team"],
        source_url=source_url,
        career_stats=career_stats,
    )


def load_player_ids(args: argparse.Namespace) -> List[str]:
    player_ids = list(args.player or [])
    if args.input:
        input_path = Path(args.input)
        if input_path.exists():
            content = json.loads(input_path.read_text())
            if isinstance(content, dict) and isinstance(content.get("players"), list):
                player_ids.extend(content["players"])
            elif isinstance(content, list):
                player_ids.extend(content)
    return [player_id for player_id in player_ids if player_id]


def serialize_output(players: List[PlayerCareerStats]) -> Dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "players": [
            {
                "player_id": player.player_id,
                "name": player.name,
                "position": player.position,
                "team": player.team,
                "source_url": player.source_url,
                "career_stats": player.career_stats,
            }
            for player in players
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch career stats from Pro Football Reference.")
    parser.add_argument("--player", action="append", help="PFR player id (e.g., MahomPa00).")
    parser.add_argument("--input", help="JSON file with a list of player ids or { players: [] }.")
    parser.add_argument(
        "--output",
        default="data/pfr-career-stats.json",
        help="Output JSON path (default: data/pfr-career-stats.json).",
    )
    args = parser.parse_args()

    player_ids = load_player_ids(args)
    if not player_ids:
        raise SystemExit("No player ids provided. Use --player or --input.")

    players = [build_player_stats(player_id) for player_id in player_ids]
    output = serialize_output(players)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
