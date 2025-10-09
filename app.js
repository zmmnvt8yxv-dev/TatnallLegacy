import requests
from bs4 import BeautifulSoup

async function main() {
  let years = [];
  try {
    const api = await loadJSON("/api/seasons");
    years = api.years || [];
  } catch(e) {
    const manifest = await loadJSON("manifest.json");
    years = manifest.years || [];
  }
  // populate dropdown etc...
}

def _fetch_transactions_api(L: League):
    txns, offset, size = [], 0, 50
    # Try unfiltered paging
    while True:
        batch = L.recent_activity(size=size, offset=offset) or []
        if not batch:
            break
        for a in batch:
            dt = getattr(a, "date", None)
            date_iso = dt.isoformat() if hasattr(dt, "isoformat") else None
            entries = []
            for x in (getattr(a, "actions", None) or []):
                team_name = getattr(getattr(x, "team", None), "team_name", None)
                player = getattr(getattr(x, "player", None), "name", None) or getattr(x, "playerName", None)
                etype = getattr(x, "type", None)
                bid = getattr(x, "bidAmount", None) or getattr(x, "bid", None)
                entries.append({"type": etype, "team": team_name, "player": player, "faab": bid})
            txns.append({"date": date_iso, "entries": entries})
        offset += size
        if len(batch) < size:
            break
    # Try per-type filters to catch any missed categories
    for t in ("TRADED","WAIVER","FREEAGENT","ADDED","DROPPED"):
        offset = 0
        while True:
            try:
                batch = L.recent_activity(size=size, offset=offset, msg_type=t) or []
            except TypeError:
                batch = []
            if not batch:
                break
            for a in batch:
                dt = getattr(a, "date", None)
                date_iso = dt.isoformat() if hasattr(dt, "isoformat") else None
                entries = []
                for x in (getattr(a, "actions", None) or []):
                    team_name = getattr(getattr(x, "team", None), "team_name", None)
                    player = getattr(getattr(x, "player", None), "name", None) or getattr(x, "playerName", None)
                    etype = getattr(x, "type", None)
                    bid = getattr(x, "bidAmount", None) or getattr(x, "bid", None)
                    entries.append({"type": etype or t, "team": team_name, "player": player, "faab": bid})
                txns.append({"date": date_iso, "entries": entries})
            offset += size
            if len(batch) < size:
                break
    # Deduplicate identical entries (by date+team+player+type)
    seen, dedup = set(), []
    for t in txns:
        key_entries = []
        for e in t.get("entries", []):
            k = (t.get("date"), e.get("team"), e.get("player"), e.get("type"), e.get("faab"))
            if k in seen: 
                continue
            seen.add(k)
            key_entries.append(e)
        if key_entries:
            dedup.append({"date": t.get("date"), "entries": key_entries})
    return dedup


def _fetch_transactions_html(league_id: int, year: int, espn_s2: str, swid: str):
    # Scrape the public activity page as a fallback for older seasons
    # URL pattern: fantasy.espn.com/football/league/activity?leagueId=...&seasonId=...&page=...
    base = "https://fantasy.espn.com/football/league/activity"
    cookies = {"espn_s2": espn_s2, "SWID": swid}
    txns = []
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)"
    })
    max_pages = 50
    for page in range(1, max_pages+1):
        params = {"leagueId": league_id, "seasonId": year, "page": page}
        r = session.get(base, params=params, cookies=cookies, timeout=15)
        if r.status_code != 200:
            break
        soup = BeautifulSoup(r.text, "html.parser")
        rows = soup.select(".Table__TBODY tr")
        if not rows:
            break
        for tr in rows:
            tds = tr.find_all("td")
            if len(tds) < 3:
                continue
            date = tds[0].get_text(strip=True)
            desc = tds[1].get_text(" ", strip=True)
            team = tds[2].get_text(strip=True) if len(tds) > 2 else None
            # Heuristic parsing for player and FAAB
            player = None
            faab = None
            text = f"{desc} {team}" if team else desc
            # Extract FAAB like $12 or 12 out of FAAB claim text
            import re
            m = re.search(r"\$?(\d+)\s*(?:FAAB|bid|spent)", text, flags=re.I)
            if m:
                faab = int(m.group(1))
            # Player: first capitalized word sequence before 'added|dropped|traded'
            pm = re.search(r"([A-Z][a-z]+\s+[A-Z][a-z]+)", desc)
            if pm:
                player = pm.group(1)
            entry = {"type": None, "team": team, "player": player, "faab": faab}
            txns.append({"date": date, "entries": [entry]})
    return txns

    # Transactions: API first, HTML fallback
    try:
        txns = _fetch_transactions_api(L)
        if not txns:
            txns = _fetch_transactions_html(LEAGUE_ID, year, ESPN_S2, SWID)
        data["transactions"] = txns
    except Exception as e:
        print(f"[year {year}] TXNS error: {e}")
        traceback.print_exc()
        data["transactions_error"] = str(e)
