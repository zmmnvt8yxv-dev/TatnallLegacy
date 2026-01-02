import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const BASE_URL = import.meta.env.BASE_URL || "/";

function joinUrl(path) {
  return new URL(path.replace(/^\//, ""), window.location.origin + BASE_URL).toString();
}

async function fetchJson(path) {
  const res = await fetch(joinUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

function toNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function Progress({ label, done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ margin: "12px 0", padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
      </div>
      <div style={{ height: 10, background: "#f2f2f2", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#111" }} />
      </div>
    </div>
  );
}

function App() {
  const [manifest, setManifest] = useState(null);
  const [teams, setTeams] = useState(null);
  const [players, setPlayers] = useState(null);
  const [playerIds, setPlayerIds] = useState(null);
  const [lineups, setLineups] = useState(null);

  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState(1);
  const [teamKey, setTeamKey] = useState("");

  const [loadingStep, setLoadingStep] = useState({ label: "Idle", done: 0, total: 1 });
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr("");
        setLoadingStep({ label: "Loading manifest.json", done: 0, total: 1 });
        const m = await fetchJson("data/manifest.json");
        if (cancelled) return;
        setManifest(m);
        const seasons = (m.seasons || []).map((x) => toNum(x)).filter(Boolean);
        if (seasons.length) setSeason(seasons[seasons.length - 1]);
        setLoadingStep({ label: "Loading teams/players/player_ids", done: 0, total: 3 });
        const [t, p, ids] = await Promise.all([
          fetchJson(m.teams || "data/teams.json"),
          fetchJson(m.players || "data/players.json"),
          fetchJson(m.player_ids || "data/player_ids.json"),
        ]);
        if (cancelled) return;
        setTeams(t);
        setPlayers(p);
        setPlayerIds(ids);
        setLoadingStep({ label: "Ready", done: 1, total: 1 });
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!manifest) return;
      try {
        setErr("");
        const path = manifest?.lineups?.[String(season)] || `data/lineups-${season}.json`;
        setLoadingStep({ label: `Loading ${path}`, done: 0, total: 1 });
        const l = await fetchJson(path);
        if (cancelled) return;
        setLineups(l);
        setLoadingStep({ label: "Ready", done: 1, total: 1 });
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifest, season]);

  const maps = useMemo(() => {
    const teamKeyToName = new Map();

    const addTeam = (k, n) => {
      if (typeof k === "string" && k && typeof n === "string" && n) teamKeyToName.set(k, n);
    };

    if (Array.isArray(teams)) {
      for (const r of teams) {
        addTeam(r.team_key ?? r.teamKey ?? r.key, r.team_name ?? r.teamName ?? r.name);
      }
    } else if (teams && typeof teams === "object") {
      for (const [k, v] of Object.entries(teams)) {
        if (typeof v === "string") addTeam(k, v);
        else if (v && typeof v === "object") addTeam(k, v.team_name ?? v.teamName ?? v.name ?? v.label);
      }
    }

    const uidToName = new Map();
    if (Array.isArray(players)) {
      for (const p of players) {
        const uid = p?.player_uid;
        const name = p?.full_name;
        if (typeof uid === "string" && uid && typeof name === "string" && name && !/^\d+$/.test(name.trim())) {
          uidToName.set(uid, name);
        }
      }
    }

    const uidToSleeper = new Map();
    if (Array.isArray(playerIds)) {
      for (const r of playerIds) {
        if (r?.id_type === "sleeper" && typeof r?.player_uid === "string" && typeof r?.id_value === "string") {
          uidToSleeper.set(r.player_uid, r.id_value);
        }
      }
    }

    return { teamKeyToName, uidToName, uidToSleeper };
  }, [teams, players, playerIds]);

  const seasonWeeks = useMemo(() => {
    if (!Array.isArray(lineups)) return [];
    const s = new Set();
    for (const r of lineups) s.add(toNum(r?.week, 0));
    return [...s].filter(Boolean).sort((a, b) => a - b);
  }, [lineups]);

  useEffect(() => {
    if (!seasonWeeks.length) return;
    if (!seasonWeeks.includes(week)) setWeek(seasonWeeks[0]);
  }, [seasonWeeks]);

  const weekRows = useMemo(() => {
    if (!Array.isArray(lineups)) return [];
    const w = toNum(week, 0);
    return lineups.filter((r) => toNum(r?.week, 0) === w);
  }, [lineups, week]);

  const starterRows = useMemo(() => {
    return weekRows.filter((r) => !!r?.is_starter);
  }, [weekRows]);

  const teamsForWeek = useMemo(() => {
    const set = new Set();
    for (const r of starterRows) if (typeof r?.team_key === "string" && r.team_key) set.add(r.team_key);
    return [...set].sort();
  }, [starterRows]);

  useEffect(() => {
    if (!teamsForWeek.length) return;
    if (!teamKey || !teamsForWeek.includes(teamKey)) setTeamKey(teamsForWeek[0]);
  }, [teamsForWeek]);

  const starterDetail = useMemo(() => {
    const rows = starterRows.filter((r) => r?.team_key === teamKey);
    const out = rows.map((r) => {
      const uid = r?.player_uid;
      const name = maps.uidToName.get(uid) || (maps.uidToSleeper.get(uid) ? `sleeper:${maps.uidToSleeper.get(uid)}` : String(uid || ""));
      const slot = String(r?.slot || "");
      return {
        slot,
        player: name,
        points: toNum(r?.points, 0),
        proj_points: toNum(r?.proj_points, 0),
      };
    });
    out.sort((a, b) => b.points - a.points);
    return out;
  }, [starterRows, teamKey, maps]);

  const teamLabel = useMemo(() => {
    const name = maps.teamKeyToName.get(teamKey);
    if (name) return name;
    if (!teamKey) return "";
    const last = teamKey.split(":").slice(-1)[0];
    if (/^\d+$/.test(last)) return `Roster ${last}`;
    return teamKey;
  }, [teamKey, maps]);

  const derived = useMemo(() => {
    const byTeam = new Map();
    for (const r of starterRows) {
      const tk = r?.team_key;
      if (typeof tk !== "string" || !tk) continue;
      const cur = byTeam.get(tk) || { starters: 0, points: 0, proj_points: 0 };
      cur.starters += 1;
      cur.points += toNum(r?.points, 0);
      cur.proj_points += toNum(r?.proj_points, 0);
      byTeam.set(tk, cur);
    }
    const rows = [...byTeam.entries()].map(([tk, v]) => ({
      team_key: tk,
      team: maps.teamKeyToName.get(tk) || tk,
      starters: v.starters,
      points: Math.round(v.points * 100) / 100,
      proj_points: Math.round(v.proj_points * 100) / 100,
    }));
    rows.sort((a, b) => b.points - a.points);
    return rows;
  }, [starterRows, maps]);

  const seasonsList = useMemo(() => {
    const s = (manifest?.seasons || []).map((x) => toNum(x)).filter(Boolean);
    return s.length ? s : [2025];
  }, [manifest]);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px" }}>TatnallLegacy</h1>
      <div style={{ color: "#444", marginBottom: 16 }}>BASE_URL: {BASE_URL}</div>

      {err ? (
        <div style={{ padding: 12, background: "#fff3f3", border: "1px solid #ffd1d1", borderRadius: 10, marginBottom: 12, color: "#900" }}>
          {err}
        </div>
      ) : null}

      <Progress label={loadingStep.label} done={loadingStep.done} total={loadingStep.total} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 60 }}>Season</span>
          <select value={season} onChange={(e) => setSeason(toNum(e.target.value, season))}>
            {seasonsList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 60 }}>Week</span>
          <select value={week} onChange={(e) => setWeek(toNum(e.target.value, week))} disabled={!seasonWeeks.length}>
            {seasonWeeks.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 60 }}>Team</span>
          <select value={teamKey} onChange={(e) => setTeamKey(e.target.value)} disabled={!teamsForWeek.length}>
            {teamsForWeek.map((tk) => (
              <option key={tk} value={tk}>
                {maps.teamKeyToName.get(tk) || tk}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 18, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Derived view</div>
        <div style={{ color: "#444", marginBottom: 10 }}>
          Total starter rows (week {week}): {starterRows.length} · Teams active: {teamsForWeek.length}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["team", "starters", "points", "proj_points"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px", fontSize: 12, color: "#555" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {derived.map((r) => (
                <tr key={r.team_key}>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.team}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.starters}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.points}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.proj_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Starters detail (Week {week})</div>
        <div style={{ color: "#444", marginBottom: 10 }}>Team: {teamLabel}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["slot", "player", "points", "proj_points"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px", fontSize: 12, color: "#555" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {starterDetail.map((r, idx) => (
                <tr key={`${r.player}-${idx}`}>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.slot || "-"}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.player || "-"}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.points}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{r.proj_points}</td>
                </tr>
              ))}
              {!starterDetail.length ? (
                <tr>
                  <td colSpan={4} style={{ padding: "10px 6px", color: "#777" }}>
                    No starters found for selected week/team.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 12, border: "1px dashed #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Debug: manifest</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{manifest ? JSON.stringify(manifest, null, 2) : "loading..."}</pre>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
