import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const BASE = import.meta.env.BASE_URL || "/";

async function fetchJson(path) {

  // --- Lookup maps (team + player display) ---
  const [teamsByKey, setTeamsByKey] = React.useState({});
  const [playersByUid, setPlayersByUid] = React.useState({});
  const [uidToSleeper, setUidToSleeper] = React.useState({});

  React.useEffect(() => {
    if (!manifest) return;
    (async () => {
      try {
        const teamsUrl = `${BASE_URL}${manifest.teams}`;
        const playersUrl = `${BASE_URL}${manifest.players}`;
        const idsUrl = `${BASE_URL}${manifest.player_ids}`;

        const [teams, players, ids] = await Promise.all([
          fetch(teamsUrl).then(r => r.json()),
          fetch(playersUrl).then(r => r.json()),
          fetch(idsUrl).then(r => r.json()),
        ]);

        // teams -> map(team_key -> name)
        const tMap = {};
        if (Array.isArray(teams)) {
          for (const t of teams) {
            const k = t.team_key || t.key || t.roster_key;
            const n = t.name || t.team_name || t.display_name;
            if (k && n) tMap[k] = n;
          }
        } else if (teams && typeof teams === "object") {
          for (const [k,v] of Object.entries(teams)) {
            if (typeof v === "string") tMap[k] = v;
            else if (v && typeof v === "object") tMap[k] = v.name || v.team_name || v.display_name || k;
          }
        }
        setTeamsByKey(tMap);

        // players -> map(player_uid -> full_name)
        const pMap = {};
        if (Array.isArray(players)) {
          for (const pl of players) {
            if (pl && pl.player_uid && pl.full_name) pMap[pl.player_uid] = pl.full_name;
          }
        }
        setPlayersByUid(pMap);

        // player_ids -> map(player_uid -> sleeper numeric id)
        const idMap = {};
        if (Array.isArray(ids)) {
          for (const row of ids) {
            if (row && row.player_uid && row.id_type === "sleeper" && row.id_value != null) {
              idMap[row.player_uid] = String(row.id_value);
            }
          }
        }
        setUidToSleeper(idMap);
      } catch (e) {
        console.error("lookup fetch failed", e);
      }
    })();
  }, [manifest]);

  function displayTeam(team_key) {
    if (!team_key) return "—";
    return teamsByKey[team_key] || team_key;
  }

  function displayPlayer(uid) {
    if (!uid) return "—";
    const name = playersByUid[uid];
    if (name && name !== "UNK" && !/^[0-9]+$/.test(String(name).trim())) return name;
    const sid = uidToSleeper[uid];
    if (sid) return "sleeper:" + sid;
    return uid;
  }

  const url = new URL(path.replace(/^\//, ""), new URL(BASE, window.location.href));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url.pathname}`);
  return res.json();
}

function LoadingBar({ pct, label }) {
  return (
    <div style={{ maxWidth: 760, margin: "24px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div>{label}</div>
        <div>{pct}%</div>
      </div>
      <div style={{ height: 10, background: "#eee", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ height: 10, width: `${pct}%`, background: "#111" }} />
      </div>
    </div>
  );
}

function App() {
  const [loading, setLoading] = useState({ pct: 0, label: "Boot" });
  const [err, setErr] = useState("");

  const [manifest, setManifest] = useState(null);

  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState(1);

  const [lineups, setLineups] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [playerIds, setPlayerIds] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr("");
        setLoading({ pct: 5, label: "Load manifest" });
        const m = await fetchJson("data/manifest.json");
        if (cancelled) return;
        setManifest(m);

        const seasons = Array.isArray(m.seasons) ? m.seasons.slice().sort((a, b) => a - b) : [];
        const defaultSeason = seasons.includes(2025) ? 2025 : (seasons[seasons.length - 1] ?? 2025);
        setSeason(defaultSeason);

        setLoading({ pct: 20, label: "Load teams / players / ids" });
        const [t, p, pid] = await Promise.all([
          fetchJson(m.teams || "data/teams.json"),
          fetchJson(m.players || "data/players.json"),
          fetchJson(m.player_ids || "data/player_ids.json"),
        ]);
        if (cancelled) return;
        setTeams(t);
        setPlayers(p);
        setPlayerIds(pid);

        setLoading({ pct: 50, label: "Load lineups" });
        const luPath =
          (m.lineups && (m.lineups[String(defaultSeason)] || m.lineups[defaultSeason])) ||
          `data/lineups-${defaultSeason}.json`;
        const lu = await fetchJson(luPath);
        if (cancelled) return;
        setLineups(Array.isArray(lu) ? lu : []);
        setLoading({ pct: 100, label: "Ready" });
      } catch (e) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!manifest) return;
    (async () => {
      try {
        setErr("");
        setLoading({ pct: 35, label: `Load lineups for ${season}` });
        const luPath =
          (manifest.lineups && (manifest.lineups[String(season)] || manifest.lineups[season])) ||
          `data/lineups-${season}.json`;
        const lu = await fetchJson(luPath);
        if (cancelled) return;
        const arr = Array.isArray(lu) ? lu : [];
        setLineups(arr);

        const weeks = [...new Set(arr.map(r => Number(r.week)).filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
        const nextWeek = weeks.includes(week) ? week : (weeks[0] ?? 1);
        setWeek(nextWeek);

        setLoading({ pct: 100, label: "Ready" });
      } catch (e) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [season]);

  const maps = useMemo(() => {
    const uidToSleeper = new Map();
    for (const row of Array.isArray(playerIds) ? playerIds : []) {
      if (!row) continue;
      if (row.id_type === "sleeper" && row.player_uid && row.id_value) {
        uidToSleeper.set(String(row.player_uid), String(row.id_value));
      }
    }

    const uidToName = new Map();
    for (const row of Array.isArray(players) ? players : []) {
      if (!row) continue;
      const uid = row.player_uid ? String(row.player_uid) : "";
      const name = row.full_name ? String(row.full_name) : "";
      if (uid && name && !/^\d+$/.test(name.trim())) uidToName.set(uid, name);
    }

    const teamKeyToName = new Map();
    if (Array.isArray(teams)) {
      for (const row of teams) {
        if (!row) continue;
        const key = row.team_key ?? row.roster_key ?? row.key;
        const name = row.team_name ?? row.name ?? row.display_name ?? row.owner_name;
        if (key && name) teamKeyToName.set(String(key), String(name));
      }
    } else if (teams && typeof teams === "object") {
      for (const [k, v] of Object.entries(teams)) {
        if (typeof v === "string") teamKeyToName.set(String(k), v);
        else if (v && typeof v === "object") {
          const name = v.team_name ?? v.name ?? v.display_name ?? v.owner_name;
          if (name) teamKeyToName.set(String(k), String(name));
        }
      }
    }

    return { uidToSleeper, uidToName, teamKeyToName };
  }, [players, playerIds, teams]);

  const weeks = useMemo(() => {
    const ws = [...new Set(lineups.map(r => Number(r.week)).filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
    return ws.length ? ws : [1];
  }, [lineups]);

  const startersForWeek = useMemo(() => {
    const w = Number(week);
    return lineups.filter(r => Number(r.week) === w && (r.is_starter === true || r.slot === "STARTER"));
  }, [lineups, week]);

  const startersRows = useMemo(() => {
    const rows = [];
    for (const r of startersForWeek) {
      const uid = r.player_uid ? String(r.player_uid) : "";
      const sleeperId = maps.uidToSleeper.get(uid) || "";
      const name = maps.uidToName.get(uid) || (sleeperId ? "" : "");
      const displayPlayer = name || (sleeperId ? "Unknown player" : "Unknown player");
      const teamName = maps.teamKeyToName.get(String(r.team_key || "")) || "Unknown team";
      rows.push({
        teamName,
        slot: r.slot && r.slot !== "UNK" ? String(r.slot) : "STARTER",
        player: displayPlayer,
        points: Number(r.points) || 0,
        proj: Number(r.proj_points) || 0,
      });
    }
    return rows;
  }, [startersForWeek, maps]);

  const teamLeaderboard = useMemo(() => {
    const byTeam = new Map();
    for (const r of startersForWeek) {
      const teamName = maps.teamKeyToName.get(String(r.team_key || "")) || "Unknown team";
      const cur = byTeam.get(teamName) || { team: teamName, starters: 0, points: 0, proj: 0 };
      cur.starters += 1;
      cur.points += Number(r.points) || 0;
      cur.proj += Number(r.proj_points) || 0;
      byTeam.set(teamName, cur);
    }
    return [...byTeam.values()].sort((a, b) => b.points - a.points);
  }, [startersForWeek, maps]);

  if (err) {
    return (
      <div style={{ maxWidth: 860, margin: "24px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>TatnallLegacy</div>
        <div style={{ color: "#b00020", whiteSpace: "pre-wrap" }}>{err}</div>
      </div>
    );
  }

  if (!manifest || loading.pct < 100) return <LoadingBar pct={loading.pct} label={loading.label} />;

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>TatnallLegacy</div>
      <div style={{ marginBottom: 14, opacity: 0.8 }}>BASE_URL: {BASE}</div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Season</div>
          <select value={season} onChange={e => setSeason(Number(e.target.value))} style={{ padding: "8px 10px" }}>
            {(manifest.seasons || [2025]).map(s => (
              <option key={String(s)} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Week</div>
          <select value={week} onChange={e => setWeek(Number(e.target.value))} style={{ padding: "8px 10px" }}>
            {weeks.map(w => (
              <option key={String(w)} value={w}>{w}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>
          Lineups loaded: {lineups.length.toLocaleString()}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Top teams by starter points (Week {week})</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee" }}>team</th>
                <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: "1px solid #eee" }}>starters</th>
                <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: "1px solid #eee" }}>points</th>
                <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: "1px solid #eee" }}>proj_points</th>
              </tr>
            </thead>
            <tbody>
              {teamLeaderboard.map((r, i) => (
                <tr key={r.team}>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{i + 1}. {r.team}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", borderBottom: "1px solid #f3f3f3" }}>{r.starters}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", borderBottom: "1px solid #f3f3f3" }}>{r.points.toFixed(2)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", borderBottom: "1px solid #f3f3f3" }}>{r.proj.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Starters detail (Week {week})</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee" }}>team</th>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee" }}>slot</th>
                <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee" }}>player</th>
                <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: "1px solid #eee" }}>points</th>
                <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: "1px solid #eee" }}>proj_points</th>
              </tr>
            </thead>
            <tbody>
              {startersRows.map((r, idx) => (
                <tr key={`${r.teamName}-${r.player}-${idx}`}>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.teamName}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.slot}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.player}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", borderBottom: "1px solid #f3f3f3" }}>{r.points.toFixed(2)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", borderBottom: "1px solid #f3f3f3" }}>{r.proj.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>
        Debug: manifest loaded from {BASE}data/manifest.json
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
