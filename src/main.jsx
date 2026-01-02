import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const BASE = import.meta.env.BASE_URL || "/";

async function fetchJson(path) {
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

  // Lookup maps (for resolved names)
  const [teamsByKey, setTeamsByKey] = useState({});
  const [playersByUid, setPlayersByUid] = useState({});
  const [uidToSleeper, setUidToSleeper] = useState({});

  // 1) Boot: manifest + core datasets
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

        setLoading({ pct: 35, label: "Load lineups" });
        const lineupsPath =
          (m.lineups && m.lineups[String(defaultSeason)]) ? m.lineups[String(defaultSeason)] :
          (m.lineups && m.lineups[defaultSeason]) ? m.lineups[defaultSeason] :
          `data/lineups-${defaultSeason}.json`;

        const l = await fetchJson(lineupsPath);
        if (cancelled) return;

        setLineups(Array.isArray(l) ? l : (l?.lineups ?? []));
        setLoading({ pct: 50, label: "Build lookup maps" });
      } catch (e) {
        console.error(e);
        setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading({ pct: 100, label: "Ready" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Build lookup maps when teams/players/playerIds change
  useEffect(() => {
    // teams -> map(team_key -> display name)
    const tMap = {};
    const tArr = Array.isArray(teams) ? teams : [];
    for (const t of tArr) {
      const k = t?.team_key || t?.key || t?.roster_key;
      const n = t?.name || t?.team_name || t?.display_name;
      if (k && n) tMap[k] = n;
    }
    setTeamsByKey(tMap);

    // players -> map(player_uid -> full_name)
    const pMap = {};
    const pArr = Array.isArray(players) ? players : [];
    for (const pl of pArr) {
      if (pl?.player_uid && pl?.full_name) pMap[pl.player_uid] = pl.full_name;
    }
    setPlayersByUid(pMap);

    // player_ids -> map(player_uid -> sleeper numeric id)
    const idMap = {};
    const idArr = Array.isArray(playerIds) ? playerIds : [];
    for (const row of idArr) {
      if (row?.player_uid && row?.id_type === "sleeper" && row?.id_value != null) {
        idMap[row.player_uid] = String(row.id_value);
      }
    }
    setUidToSleeper(idMap);
  }, [teams, players, playerIds]);

  function displayTeam(team_key) {
    if (!team_key) return "—";
    return teamsByKey[team_key] || team_key;
  }

  function displayPlayer(uid) {
    if (!uid) return "—";
    const name = playersByUid[uid];
    if (name && name !== "UNK" && !/^[0-9]+$/.test(String(name).trim())) return name;
    const sid = uidToSleeper[uid];
    if (sid) return `sleeper:${sid}`;
    return uid;
  }

  const weeks = useMemo(() => {
    const w = new Set();
    for (const r of lineups) if (r?.week != null) w.add(Number(r.week));
    return Array.from(w).sort((a, b) => a - b);
  }, [lineups]);

  // keep week valid
  useEffect(() => {
    if (weeks.length && !weeks.includes(week)) setWeek(weeks[0]);
  }, [weeks]);

  const startersForWeek = useMemo(() => {
    return lineups.filter(r => Number(r.week) === Number(week) && (r.is_starter === true || r.is_starter === 1));
  }, [lineups, week]);

  const startersRows = useMemo(() => {
    return startersForWeek.map(r => ({
      team_key: r.team_key,
      team: displayTeam(r.team_key),
      slot: r.slot || "STARTER",
      player_uid: r.player_uid,
      player: displayPlayer(r.player_uid),
      points: Number(r.points ?? 0),
      proj_points: Number(r.proj_points ?? 0),
    }));
  }, [startersForWeek, teamsByKey, playersByUid, uidToSleeper]);

  const teamLeaderboard = useMemo(() => {
    const agg = new Map();
    for (const r of startersRows) {
      const key = r.team_key || "—";
      const cur = agg.get(key) || { team_key: key, team: r.team, starters: 0, points: 0, proj_points: 0 };
      cur.starters += 1;
      cur.points += r.points;
      cur.proj_points += r.proj_points;
      agg.set(key, cur);
    }
    return Array.from(agg.values()).sort((a, b) => b.points - a.points);
  }, [startersRows]);

  if (err) {
    return (
      <div style={{ maxWidth: 900, margin: "24px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        <h2 style={{ marginTop: 0 }}>TatnallLegacy</h2>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>BASE_URL: {BASE}</div>
      </div>
    );
  }

  if (loading.pct < 100 && !manifest) return <LoadingBar pct={loading.pct} label={loading.label} />;

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h2 style={{ marginTop: 0 }}>TatnallLegacy</h2>

      <div style={{ margin: "8px 0 16px", opacity: 0.8 }}>
        <div>BASE_URL: {BASE}</div>
        <div>Debug: manifest loaded from {BASE}data/manifest.json</div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Season</div>
          <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
            {(manifest?.seasons || [2025]).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Week</div>
          <select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {weeks.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        <div style={{ opacity: 0.8 }}>
          Lineups loaded: {lineups.length.toLocaleString()}
        </div>
      </div>

      <h3 style={{ marginTop: 0 }}>Top teams by starter points (Week {week})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr>
            {["team", "starters", "points", "proj_points"].map(h => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamLeaderboard.slice(0, 20).map((r) => (
            <tr key={r.team_key}>
              <td style={{ padding: "6px" }}>{r.team}</td>
              <td style={{ padding: "6px" }}>{r.starters}</td>
              <td style={{ padding: "6px" }}>{r.points.toFixed(2)}</td>
              <td style={{ padding: "6px" }}>{r.proj_points.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Starters detail (Week {week})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["team", "slot", "player", "points", "proj_points"].map(h => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {startersRows.slice(0, 200).map((r, idx) => (
            <tr key={`${r.team_key}-${r.player_uid}-${idx}`}>
              <td style={{ padding: "6px" }}>{r.team}</td>
              <td style={{ padding: "6px" }}>{r.slot}</td>
              <td style={{ padding: "6px" }}>{r.player}</td>
              <td style={{ padding: "6px" }}>{r.points.toFixed(2)}</td>
              <td style={{ padding: "6px" }}>{r.proj_points.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
