import React from "react";
import { createRoot } from "react-dom/client";

const BASE = import.meta.env.BASE_URL;

async function fetchJson(relPath){
  const r = await fetch(BASE + relPath);
  if(!r.ok) throw new Error(`${relPath} fetch failed: ${r.status}`);
  return r.json();
}

function toNum(v){
  if(typeof v === "number") return v;
  if(typeof v === "string"){
    const s=v.trim();
    if(!s) return 0;
    const n=Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sumPoints(rows, key){
  let s = 0;
  for(const r of rows) s += toNum(r?.[key]);
  return Math.round(s * 100) / 100;
}

function buildTeamMap(teamsJson){
  const m = new Map();
  const add = (team_key, label)=>{
    if(!team_key) return;
    const k=String(team_key);
    if(!m.has(k) && label) m.set(k, String(label));
  };

  if(Array.isArray(teamsJson)){
    for(const t of teamsJson){
      add(t.team_key ?? t.teamKey ?? t.key, t.team_name ?? t.teamName ?? t.name ?? t.display_name ?? t.displayName ?? t.owner_name);
    }
    return m;
  }

  if(teamsJson && typeof teamsJson === "object"){
    for(const [k,v] of Object.entries(teamsJson)){
      if(v && typeof v === "object"){
        add(v.team_key ?? v.teamKey ?? k, v.team_name ?? v.teamName ?? v.name ?? v.display_name ?? v.displayName ?? v.owner_name);
      } else if(v) {
        add(k, v);
      }
    }
  }

  return m;
}

function buildNameBySleeperId(playersJson, playerIdsJson){
  const uidToSleeper = new Map();
  if(Array.isArray(playerIdsJson)){
    for(const r of playerIdsJson){
      if(r?.id_type === "sleeper" && r?.player_uid && r?.id_value != null){
        uidToSleeper.set(String(r.player_uid), String(r.id_value));
      }
    }
  }

  const nameBySleeper = new Map();
  const nameOf = (p)=>{
    const full = p.full_name ?? p.fullName ?? p.name ?? p.player_name ?? p.playerName;
    const first = p.first_name ?? p.firstName;
    const last = p.last_name ?? p.lastName;
    const pos = p.position ?? p.pos;
    const team = p.team ?? p.nfl_team ?? p.team_abbr;

    let n = null;
    if(typeof full === "string" && full.trim() !== "" && !/^\d+$/.test(full.trim())) n = full.trim();
    if(!n && (first || last)) n = [first,last].filter(Boolean).join(" ");
    if(!n) return null;

    const suffix = [team,pos].filter(Boolean).join(" ");
    return suffix ? `${n} (${suffix})` : n;
  };

  if(Array.isArray(playersJson)){
    for(const p of playersJson){
      const uid = p?.player_uid;
      if(!uid) continue;
      const sid = uidToSleeper.get(String(uid));
      if(!sid) continue;
      const nm = nameOf(p);
      if(nm) nameBySleeper.set(String(sid), nm);
    }
  }

  return nameBySleeper;
}

function App(){
  const [manifest,setManifest] = React.useState(null);
  const [season,setSeason] = React.useState(null);
  const [week,setWeek] = React.useState(1);

  const [lineups,setLineups] = React.useState(null);
  const [teamsMap,setTeamsMap] = React.useState(new Map());
  const [nameBySleeper,setNameBySleeper] = React.useState(new Map());

  const [selectedTeam,setSelectedTeam] = React.useState("");

  const [err,setErr] = React.useState(null);
  const [loading,setLoading] = React.useState(true);

  React.useEffect(()=>{(async()=>{
    try{
      const m = await fetchJson("data/manifest.json");
      setManifest(m);
      const s = (m.seasons && m.seasons.length) ? m.seasons[m.seasons.length - 1] : 2025;
      setSeason(s);
      setLoading(false);
    }catch(e){
      setErr(String(e));
      setLoading(false);
    }
  })()},[]);

  React.useEffect(()=>{(async()=>{
    try{
      const t = await fetchJson("data/teams.json");
      setTeamsMap(buildTeamMap(t));
    }catch(_){
      setTeamsMap(new Map());
    }
  })()},[]);

  React.useEffect(()=>{(async()=>{
    try{
      const [p, ids] = await Promise.all([
        fetchJson("data/players.json"),
        fetchJson("data/player_ids.json")
      ]);
      setNameBySleeper(buildNameBySleeperId(p, ids));
    }catch(_){
      setNameBySleeper(new Map());
    }
  })()},[]);

  React.useEffect(()=>{(async()=>{
    if(!season) return;
    setErr(null);
    setLineups(null);
    try{
      const candidates = [
        `data/lineups-${season}.json`
      ];
      let lastErr=null;
      for(const c of candidates){
        try{
          const j = await fetchJson(c);
          setLineups(j);
          return;
        }catch(e){
          lastErr=e;
        }
      }
      throw lastErr || new Error("no lineup file matched");
    }catch(e){
      setErr(String(e));
    }
  })()},[season]);

  const derived = React.useMemo(()=>{
    if(!Array.isArray(lineups)) return null;

    const weeks = Array.from(new Set(lineups.map(r=>Number(r.week)).filter(n=>Number.isFinite(n)))).sort((a,b)=>a-b);
    const safeWeek = weeks.includes(week) ? week : (weeks[0] ?? 1);

    const weekRows = lineups.filter(r=>Number(r.week)===safeWeek);
    const isStarter = (r)=> (r.is_starter===true || r.is_starter===1 || r.is_starter==="1");

    const starters = weekRows.filter(isStarter);
    const teamKeys = Array.from(new Set(weekRows.map(r=>String(r.team_key)))).sort();

    const rowsByTeam = new Map();
    for(const t of teamKeys) rowsByTeam.set(t, []);
    for(const r of starters){
      const k=String(r.team_key);
      if(!rowsByTeam.has(k)) rowsByTeam.set(k, []);
      rowsByTeam.get(k).push(r);
    }

    const teams = teamKeys.map(team_key=>{
      const rows = rowsByTeam.get(team_key) || [];
      return {
        team_key,
        team_label: teamsMap.get(team_key) || team_key,
        starters: rows.length,
        points: sumPoints(rows,"points"),
        proj_points: sumPoints(rows,"proj_points")
      };
    }).sort((a,b)=> (b.points - a.points) || (b.proj_points - a.proj_points));

    return {
      weeks,
      week: safeWeek,
      total_rows: lineups.length,
      week_rows: weekRows.length,
      teams_active: teamKeys.length,
      teams_sorted: teams,
      starters_by_team: rowsByTeam
    };
  },[lineups,week,teamsMap]);

  React.useEffect(()=>{
    if(!derived?.weeks?.length) return;
    if(!derived.weeks.includes(week)) setWeek(derived.weeks[0]);
  },[derived]);

  React.useEffect(()=>{
    if(!derived?.teams_sorted?.length) return;
    if(selectedTeam && derived.teams_sorted.some(t=>t.team_key===selectedTeam)) return;
    setSelectedTeam(derived.teams_sorted[0].team_key);
  },[derived]);

  const selectedTeamRows = React.useMemo(()=>{
    if(!derived || !selectedTeam) return [];
    const rows = derived.starters_by_team.get(String(selectedTeam)) || [];

    const displayPlayer = (player_uid)=>{
      const raw = player_uid == null ? "" : String(player_uid);
      if(raw === "") return "UNKNOWN";
      const named = nameBySleeper.get(raw);
      if(named) return named;
      if(/^\d+$/.test(raw)) return `sleeper:${raw}`;
      return raw;
    };

    return rows
      .map(r=>({
        slot: r.slot ?? "UNK",
        player: displayPlayer(r.player_uid),
        points: toNum(r.points),
        proj_points: toNum(r.proj_points)
      }))
      .sort((a,b)=> (b.points - a.points) || (String(a.slot).localeCompare(String(b.slot))));
  },[derived,selectedTeam,nameBySleeper]);

  if(loading) return React.createElement("div", {style:{fontFamily:"system-ui",padding:16}}, "Loading…");
  if(err && !manifest) return React.createElement("pre", {style:{padding:16,whiteSpace:"pre-wrap"}}, err);

  return React.createElement("div", {style:{fontFamily:"system-ui",padding:16,maxWidth:1150}},
    React.createElement("h1", null, "TatnallLegacy"),
    React.createElement("div", {style:{marginBottom:12,opacity:0.8}}, "BASE_URL: " + BASE),

    React.createElement("div", {style:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:16}},
      React.createElement("label", null, "Season"),
      React.createElement("select", { value: season || "", onChange: (e)=>setSeason(Number(e.target.value)) },
        (manifest?.seasons || []).map(s => React.createElement("option", {key:s, value:s}, String(s)))
      ),
      React.createElement("label", null, "Week"),
      React.createElement("select", {
        value: week,
        onChange: (e)=>setWeek(Number(e.target.value)),
        disabled: !(derived?.weeks?.length)
      },
        (derived?.weeks || [1]).map(w => React.createElement("option", {key:w, value:w}, String(w)))
      ),
      React.createElement("span", {style:{opacity:0.8}},
        lineups ? `Lineups loaded (${Array.isArray(lineups)?lineups.length:0})` : "Loading lineups…"
      )
    ),

    err ? React.createElement("pre", {style:{whiteSpace:"pre-wrap",background:"#111",color:"#eee",padding:12,borderRadius:8}}, err) : null,

    React.createElement("h2", null, "Derived view"),
    derived
      ? React.createElement("div", {style:{display:"grid",gap:12}},
          React.createElement("div", {style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:12}},
            React.createElement("div", {style:{background:"#f4f4f4",padding:12,borderRadius:8}}, `Total rows: ${derived.total_rows}`),
            React.createElement("div", {style:{background:"#f4f4f4",padding:12,borderRadius:8}}, `Week ${derived.week} rows: ${derived.week_rows}`),
            React.createElement("div", {style:{background:"#f4f4f4",padding:12,borderRadius:8}}, `Teams active: ${derived.teams_active}`)
          ),

          React.createElement("div", {style:{background:"#f4f4f4",padding:12,borderRadius:8}},
            React.createElement("div", {style:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:8}},
              React.createElement("div", {style:{fontWeight:700}}, `Starters detail (Week ${derived.week})`),
              React.createElement("label", null, "Team"),
              React.createElement("select", { value: selectedTeam, onChange: (e)=>setSelectedTeam(e.target.value) },
                derived.teams_sorted.map(t =>
                  React.createElement("option", {key:t.team_key, value:t.team_key}, t.team_label)
                )
              )
            ),
            React.createElement("table", {style:{width:"100%",borderCollapse:"collapse"}},
              React.createElement("thead", null,
                React.createElement("tr", null,
                  ["slot","player","points","proj_points"].map(h =>
                    React.createElement("th", {key:h, style:{textAlign:"left",padding:"6px 8px",borderBottom:"1px solid #ddd"}}, h)
                  )
                )
              ),
              React.createElement("tbody", null,
                selectedTeamRows.map((r,idx)=>
                  React.createElement("tr", {key:idx},
                    React.createElement("td", {style:{padding:"6px 8px",borderBottom:"1px solid #eee"}}, String(r.slot)),
                    React.createElement("td", {style:{padding:"6px 8px",borderBottom:"1px solid #eee"}}, r.player),
                    React.createElement("td", {style:{padding:"6px 8px",borderBottom:"1px solid #eee"}}, String(r.points)),
                    React.createElement("td", {style:{padding:"6px 8px",borderBottom:"1px solid #eee"}}, String(r.proj_points))
                  )
                )
              )
            ),
            React.createElement("div", {style:{marginTop:10,opacity:0.7,fontSize:12}},
              "If names still show as sleeper:<id>, players.json is missing real names for those ids; fix ingest later. UI wiring is correct."
            )
          )
        )
      : React.createElement("div", null, "No data yet")
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
