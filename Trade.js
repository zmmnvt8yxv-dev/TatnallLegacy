// ==============================
// Trade Analysis (Sleeper) — trade.js
// ==============================

const ROOT = new URL(".", document.baseURI).pathname.replace(/\/+$/, "") + "/";
const CURRENT_LEAGUE_ID = "1262418074540195841"; // your live league id

// --------- tiny helpers ---------
const $  = sel => document.querySelector(sel);
const el = (t,a={},...kids)=>{const n=document.createElement(t);for(const[k,v]of Object.entries(a))(k==="class")?n.className=v:n.setAttribute(k,v);for(const k of kids)n.append(k?.nodeType?k:document.createTextNode(k??""));return n;}
const fmt= n => (n==null? "": (Math.round(Number(n)*100)/100).toString());
const ts  = (ms)=>{try{const d=new Date(Number(ms)); if(!isFinite(d)) return ""; return d.toLocaleString();}catch{ return "" }};

// --------- HTTP ---------
async function get(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function loadJSON(rel){ const r=await fetch(ROOT+rel.replace(/^\/+/,""),{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status} ${rel}`); return r.json(); }

// --------- Sleeper primitives ---------
async function getLeagueMeta(leagueId){ return get(`https://api.sleeper.app/v1/league/${leagueId}`); }
async function getUsers(leagueId){ return get(`https://api.sleeper.app/v1/league/${leagueId}/users`); }
async function getRosters(leagueId){ return get(`https://api.sleeper.app/v1/league/${leagueId}/rosters`); }
async function getTransactions(leagueId, week){ return get(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`); }
async function getPlayers(){ const r=await fetch("https://api.sleeper.app/v1/players/nfl",{cache:"force-cache"}); return r.ok? r.json(): {}; }
async function getState(){ return get("https://api.sleeper.app/v1/state/nfl"); }

// Resolve the specific league_id for a given season by walking previous_league_id chain
async function resolveLeagueIdForSeason(wantedSeason, startLeagueId=CURRENT_LEAGUE_ID){
  let id = String(startLeagueId);
  for (let i=0; i<20; i++){
    const meta = await getLeagueMeta(id);
    const season = Number(meta.season);
    if (season === Number(wantedSeason)) return { leagueId: id, meta };
    const prev = meta.previous_league_id;
    if (!prev) break;
    id = String(prev);
  }
  // If not found, return the start league meta as fallback
  const meta = await getLeagueMeta(String(startLeagueId));
  return { leagueId: String(startLeagueId), meta };
}

// Build name lookups
function buildMaps(users, rosters){
  const userById = new Map(users.map(u=>[u.user_id,u]));
  const rosterById = new Map(rosters.map(r=>[r.roster_id,r]));
  function teamName(rid){
    const r = rosterById.get(Number(rid));
    if (!r) return `Roster ${rid}`;
    const u = userById.get(r.owner_id)||{};
    return (u.metadata?.team_name || u.metadata?.nickname || u.display_name || `Roster ${rid}`);
  }
  return { userById, rosterById, teamName };
}
function labelPlayer(pid, players){
  const p = players?.[pid]||{};
  const nm = p.full_name || (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : (p.last_name || pid));
  const pos=p.position||"", nfl=p.team||p.active_team||"";
  return nm + (pos?` (${pos}${nfl?` - ${nfl}`:""})`:"");
}

// Pull trades across all weeks for that league/season
async function fetchTradesForLeague(leagueId){
  const [state, users, rosters, players] = await Promise.all([
    getState(), getUsers(leagueId), getRosters(leagueId), getPlayers()
  ]);
  const { teamName } = buildMaps(users, rosters);

  const trades = [];
  const maxWeek = 22;
  for (let w=1; w<=maxWeek; w++){
    let arr = [];
    try { arr = await getTransactions(leagueId, w); } catch { arr = []; }
    if (!Array.isArray(arr) || arr.length === 0){
      // stop early once we're clearly past current week in active season
      const curW = Number(state.week||0);
      if (curW && w > curW+1) break;
      continue;
    }
    for (const t of arr){
      if (t?.type !== "trade") continue;

      // Build per-roster adds/drops
      const adds  = Object.entries(t.adds  || {}).map(([pid,rid]) => ({ pid, to:   Number(rid) }));
      const drops = Object.entries(t.drops || {}).map(([pid,rid]) => ({ pid, from: Number(rid) }));

      const by = new Map(); // rid -> {gain:Set,pids lose:Set<pid>}
      const ensure = rid => { rid=Number(rid); if(!by.has(rid)) by.set(rid,{gain:new Set(),lose:new Set()}); return by.get(rid); };

      adds.forEach(a => ensure(a.to).gain.add(a.pid));
      drops.forEach(d => ensure(d.from).lose.add(d.pid));

      // Fallback: if by is empty but roster_ids present, create empty parties
      if (by.size === 0 && Array.isArray(t.roster_ids)){
        t.roster_ids.forEach(rid => ensure(rid));
      }

      const parties = [...by.entries()].map(([rid,obj])=>({
        rid: Number(rid),
        team: teamName(rid),
        gain: [...obj.gain],
        lose: [...obj.lose],
      })).sort((a,b)=>a.rid-b.rid);

      // Human-friendly labels once (used for filters/rollups)
      parties.forEach(p=>{
        p.gainNames = p.gain.map(pid => labelPlayer(pid, players));
        p.loseNames = p.lose.map(pid => labelPlayer(pid, players));
      });

      trades.push({
        id: String(t.transaction_id || `${w}-${trades.length+1}`),
        created: t.status_updated || t.created || null,
        week: w,
        status: t.status || "complete",
        parties
      });
    }
  }
  return { trades, users, rosters };
}

// Score with saved lineups (optional, if your year JSON includes them)
function indexLineupsByTeamAfterWeek(lineups){
  const byTeam = new Map(); // team -> player -> Map(week->pts)
  for (const r of (lineups||[])){
    if (!r?.started) continue;
    const team = String(r.team||"").trim(); if (!team) continue;
    const player = String(r.player||"").trim(); if (!player) continue;
    const wk = Number(r.week||0); const pts = Number(r.points||0);
    if (!byTeam.has(team)) byTeam.set(team, new Map());
    const tm = byTeam.get(team);
    if (!tm.has(player)) tm.set(player, new Map());
    tm.get(player).set(wk, (tm.get(player).get(wk)||0) + pts);
  }
  return byTeam;
}
function sumAfterWeek(teamName, playerNames, week, teamMap){
  const tm = teamMap?.get(teamName); if (!tm) return 0;
  let s=0;
  for (const p of (playerNames||[])){
    const weeks = tm.get(p); if (!weeks) continue;
    for (const [wk, pts] of weeks.entries()){ if (Number(wk) > Number(week)) s += Number(pts||0); }
  }
  return s;
}
function scoreTrade(trade, teamMap){
  if (!teamMap) return null;
  return trade.parties.map(p=>{
    const gained = sumAfterWeek(p.team, p.gainNames, trade.week, teamMap);
    const lost   = sumAfterWeek(p.team, p.loseNames, trade.week, teamMap);
    const delta  = gained - lost;
    const score  = Math.max(0, Math.min(100, 50 + delta)); // clamp
    return { team:p.team, rid:p.rid, delta, score, gained, lost };
  });
}
function scoreColor(score){
  if (score>=70) return "#22c55e";
  if (score>=50) return "#84cc16";
  if (score>=30) return "#f59e0b";
  return "#ef4444";
}

// --------- Render: list + detail + rollup ---------
function renderTradeList(trades){
  const host = $("#list");
  host.innerHTML = "";
  if (!trades.length){
    host.appendChild(el("div",{class:"muted",style:"padding:8px"},"No trades found for this season."));
    return;
  }

  const tbl = el("table",{}, el("thead",{}, el("tr",{},
      el("th",{},"Week"), el("th",{},"Created"), el("th",{},"Party A Gets"), el("th",{},"Party B Gets"), el("th",{},"Details")
  )), el("tbody",{}));

  trades.forEach(tr => {
    const A = tr.parties[0] || { team:"", gainNames:[] }, B = tr.parties[1] || { team:"", gainNames:[] };
    const aGets = A.gainNames?.length ? `${A.team}: ${A.gainNames.join(", ")}` : `${A.team}: —`;
    const bGets = B.gainNames?.length ? `${B.team}: ${B.gainNames.join(", ")}` : `${B.team}: —`;
    const trEl = el("tr",{"data-trade-id":tr.id},
      el("td",{}, String(tr.week)),
      el("td",{}, ts(tr.created)),
      el("td",{}, aGets),
      el("td",{}, bGets),
      el("td",{}, el("a",{href:`#trade/${tr.id}`, class:"badge"},"View"))
    );
    tbl.tBodies[0].appendChild(trEl);
  });

  host.appendChild(tbl);
}

function renderRollup(trades, teamMap){
  const body = $("#rollupTbl").tBodies[0]; body.innerHTML = "";
  const agg = new Map(); // team -> stats
  for (const t of trades){
    const scored = scoreTrade(t, teamMap);
    for (const p of t.parties){
      const a = agg.get(p.team) || { trades:0, gain:0, lose:0, delta:0, score:0, scored:0 };
      a.trades += 1;
      a.gain   += (p.gainNames?.length||0);
      a.lose   += (p.loseNames?.length||0);
      if (scored){
        const m = scored.find(s=>s.team===p.team);
        if (m){ a.delta += m.delta; a.score += m.score; a.scored += 1; }
      }
      agg.set(p.team, a);
    }
  }
  const rows = [...agg.entries()].map(([team,a])=>({
    team,
    trades:a.trades, gain:a.gain, lose:a.lose,
    delta: a.scored? a.delta : null,
    avg:   a.scored? a.score/a.scored : null
  })).sort((x,y)=> (y.avg??-1)-(x.avg??-1) || y.trades-x.trades || x.team.localeCompare(y.team));

  for (const r of rows){
    body.appendChild(el("tr",{},
      el("td",{}, r.team),
      el("td",{}, String(r.trades)),
      el("td",{}, String(r.gain)),
      el("td",{}, String(r.lose)),
      el("td",{}, r.delta==null? "—" : fmt(r.delta)),
      el("td",{}, r.avg==null? "—" : fmt(r.avg))
    ));
  }
}

function renderTradeDetail(trade, teamMap){
  const panel = document.querySelector(".panel"); // first panel section
  const old = $("#tradeDetail"); if (old) old.remove();

  const scored = scoreTrade(trade, teamMap);
  const box = el("section",{id:"tradeDetail",class:"panel",style:"margin-bottom:12px"},
    el("h2",{}, `Trade — Week ${trade.week}`),
    el("div",{class:"muted",style:"margin:-4px 0 6px 0"}, `Created: ${ts(trade.created)}`)
  );

  trade.parties.forEach(p=>{
    const s = scored ? scored.find(x=>x.team===p.team) : null;
    box.appendChild(
      el("div",{style:"border:1px solid #2f2f2f;border-radius:.75rem;padding:10px;margin:6px 0"},
        el("div",{style:"font-weight:700;margin-bottom:4px"}, p.team),
        el("div",{}, el("span",{class:"muted"},"Received: "), p.gainNames.length? p.gainNames.join(", ") : "—"),
        el("div",{}, el("span",{class:"muted"},"Sent: "), p.loseNames.length? p.loseNames.join(", ") : "—"),
        s ? el("div",{style:"margin-top:6px"},
          el("div",{class:"muted"}, `Δ started pts after trade: ${fmt(s.delta)}  •  Score: ${fmt(s.score)}`),
          el("div",{style:"height:6px;border-radius:4px;background:#111;overflow:hidden"},
            el("div",{style:`width:${Math.max(4,Math.min(100,s.score))}%;height:6px;background:${scoreColor(s.score)}`})
          )
        ) : el("div",{class:"muted",style:"margin-top:6px"},"No lineup points available for scoring")
      )
    );
  });

  panel.parentNode.insertBefore(box, panel); // insert detail above list
}

// --------- Filters ---------
function applyFilters(allTrades){
  const tSel = $("#teamFilter").value || "";
  const q = ($("#q").value||"").trim().toLowerCase();
  return allTrades.filter(tr=>{
    const teamPass = !tSel || tr.parties.some(p => p.team === tSel);
    if (!teamPass) return false;
    if (!q) return true;
    return tr.parties.some(p =>
      (p.gainNames||[]).some(n => n.toLowerCase().includes(q)) ||
      (p.loseNames||[]).some(n => n.toLowerCase().includes(q))
    );
  });
}

// --------- Boot ---------
async function main(){
  const meta = $("#meta"); meta.textContent = "Loading…";

  // seasons
  let mf; try { mf = await loadJSON("manifest.json"); } catch { mf = { years: [] }; }
  const years = (mf.years||[]).slice().sort((a,b)=>a-b);
  const yearSel = $("#yearSelect"); yearSel.innerHTML="";
  years.forEach(y => yearSel.appendChild(el("option",{value:String(y)}, y)));
  const selectedYear = years[years.length-1] || new Date().getFullYear();
  yearSel.value = String(selectedYear);

  // resolve league id for that season
  const { leagueId, meta: leagueMeta } = await resolveLeagueIdForSeason(selectedYear, CURRENT_LEAGUE_ID);

  // load season file (for lineups scoring, optional; and team names for filter fallback)
  let seasonJson = null;
  try { seasonJson = await loadJSON(`data/${selectedYear}.json`); } catch {}
  const teamMap = seasonJson?.lineups?.length ? indexLineupsByTeamAfterWeek(seasonJson.lineups) : null;

  // fetch trades
  const { trades, users, rosters } = await fetchTradesForLeague(leagueId);

  // Populate team filter from that league's rosters/users
  const { teamName } = buildMaps(users, rosters);
  const teamSel = $("#teamFilter");
  const uniqTeams = [...new Set(rosters.map(r => teamName(r.roster_id)))].sort((a,b)=>a.localeCompare(b));
  teamSel.innerHTML = ""; teamSel.appendChild(el("option",{value:""},"All Teams"));
  uniqTeams.forEach(n => teamSel.appendChild(el("option",{value:n}, n)));

  // UI meta
  meta.textContent = `${trades.length} trades • Season ${selectedYear} • League ${leagueMeta.name||leagueId}`;

  // Renderers + interactions
  function redraw(){
    const filtered = applyFilters(trades);
    renderTradeList(filtered);
    renderRollup(filtered, teamMap);
    // Clear detail if current detail trade not in filtered set
    const cur = location.hash.match(/^#trade\/(.+)$/i);
    if (cur){
      const t = filtered.find(x=>x.id===cur[1]);
      if (t) renderTradeDetail(t, teamMap);
      else $("#tradeDetail")?.remove();
    }
  }
  yearSel.onchange = () => { location.reload(); };
  teamSel.onchange = redraw;
  $("#q").oninput = redraw;

  // hash routing for detail open/close
  window.addEventListener("hashchange", ()=>{
    const m = location.hash.match(/^#trade\/(.+)$/i);
    if (!m){ $("#tradeDetail")?.remove(); return; }
    const t = trades.find(x=>x.id===m[1]);
    if (t) renderTradeDetail(t, teamMap);
  }, { passive:true });

  redraw();
  // Auto-open first trade for convenience
  if (trades.length && !location.hash) location.hash = `#trade/${trades[0].id}`;
}

document.addEventListener("DOMContentLoaded", main);
