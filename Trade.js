// Trade Analysis — client-only; derives trades directly from Sleeper and scores with your saved lineups when available.

const ROOT = new URL(".", document.baseURI).pathname.replace(/\/+$/, "") + "/";
const LEAGUE_ID = "1262418074540195841";

const $ = sel => document.querySelector(sel);
const el = (t,a={},...kids)=>{const n=document.createElement(t);for(const[k,v]of Object.entries(a))(k==="class")?n.className=v:n.setAttribute(k,v);for(const k of kids)n.append(k?.nodeType?k:document.createTextNode(k??""));return n;}
const fmt = n => (n==null? "": (Math.round(Number(n)*100)/100).toString());

async function loadJSON(rel){const url=ROOT+rel.replace(/^\/+/,""); const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(url+" -> "+r.status); return r.json();}

// ------------ Sleeper helpers ------------
async function getJSON(url){const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`); return r.json();}
async function getState(){return getJSON("https://api.sleeper.app/v1/state/nfl");}
async function getUsers(){return getJSON(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`);}
async function getRosters(){return getJSON(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`);}
async function getWeekTxns(week){return getJSON(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/transactions/${week}`);}
async function getPlayers(){ // metadata for labels
  const r=await fetch("https://api.sleeper.app/v1/players/nfl",{cache:"force-cache"});
  return r.ok? r.json(): {};
}
function labelPlayer(pid, players){
  const p = players?.[pid]||{};
  const nm = p.full_name || (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : (p.last_name || pid));
  const pos=p.position||"", nfl=p.team||p.active_team||"";
  return nm + (pos?` (${pos}${nfl?` - ${nfl}`:""})`:"");
}
function buildMaps(users, rosters){
  const userById = new Map(users.map(u=>[u.user_id,u]));
  const rosterById = new Map(rosters.map(r=>[r.roster_id,r]));
  const teamName = rid => {
    const r = rosterById.get(rid);
    if(!r) return `Roster ${rid}`;
    const u = userById.get(r.owner_id)||{};
    return (u.metadata?.team_name || u.metadata?.nickname || u.display_name || `Roster ${rid}`);
  };
  return { userById, rosterById, teamName };
}

// ------------ Pull trades and reshape ------------
async function fetchTradesFull(){
  const [state, users, rosters, players] = await Promise.all([getState(), getUsers(), getRosters(), getPlayers()]);
  const { teamName } = buildMaps(users, rosters);

  // discover weeks
  const maxWeek = 22;
  const trades = [];
  for(let w=1; w<=maxWeek; w++){
    let rows=[];
    try{ rows = await getWeekTxns(w) }catch(_){ rows=[]; }
    if (!Array.isArray(rows)) continue;
    const weekTrades = rows.filter(t => t?.type === "trade");
    if (weekTrades.length===0 && w> (Number(state.week)||0) && w>1) continue;

    for(const t of weekTrades){
      // Each trade txn has: adds (pid -> roster_id), drops (pid -> roster_id), roster_ids [both teams]
      const adds = Object.entries(t.adds||{}).map(([pid,rid])=>({pid, to: Number(rid)}));
      const drops= Object.entries(t.drops||{}).map(([pid,rid])=>({pid, from: Number(rid)}));

      // Group per roster: what did each roster gain/lose
      const by = new Map(); // rid -> {gain:Set(pid), lose:Set(pid)}
      function ensure(rid){ if(!by.has(rid)) by.set(rid,{gain:new Set(),lose:new Set()}); return by.get(rid); }
      adds.forEach(a => ensure(a.to).gain.add(a.pid));
      drops.forEach(d => ensure(d.from).lose.add(d.pid));

      const rids = Array.from(by.keys());
      if (rids.length < 2){
        // fallback to transaction.roster_ids if present
        const rlist = Array.isArray(t.roster_ids)? t.roster_ids.map(Number) : [];
        rlist.forEach(rid => ensure(rid));
      }

      const parties = Array.from(by.entries()).map(([rid,obj])=>({
        rid:Number(rid),
        team:teamName(Number(rid)),
        gain:[...obj.gain],
        lose:[...obj.lose]
      })).sort((a,b)=>a.rid-b.rid);

      trades.push({
        id: String(t.transaction_id || `${w}-${trades.length+1}`),
        week:w,
        status: t.status || "complete",
        parties,
      });
    }
  }
  return { trades, users, rosters, players };
}

// ------------ Score using your saved lineups (if present) ------------
function indexLineupsByTeamAfterWeek(lineups, seasonYear){
  // map: key = team -> player -> sum of started points after week
  const byTeam = new Map();
  for (const r of (lineups||[])){
    if (!r?.started) continue;
    const wk = Number(r.week||0);
    const team = String(r.team||"");
    const player = String(r.player||"");
    const pts = Number(r.points||0);
    if (!team || !player || !Number.isFinite(pts)) continue;

    if (!byTeam.has(team)) byTeam.set(team, new Map());
    const m = byTeam.get(team);
    if (!m.has(player)) m.set(player, new Map()); // week -> pts
    m.get(player).set(wk, (m.get(player).get(wk)||0) + pts);
  }
  return byTeam;
}

function sumAfterWeek(teamName, playerNames, week, teamPlayerWeekPts){
  const teamMap = teamPlayerWeekPts.get(teamName);
  if (!teamMap) return 0;
  let s = 0;
  for (const p of playerNames||[]){
    const wmap = teamMap.get(p);
    if (!wmap) continue;
    for (const [wk, pts] of wmap.entries()){
      if (Number(wk) > Number(week)) s += Number(pts||0);
    }
  }
  return s;
}

function scoreTrade(trade, teamPlayerWeekPts){
  // For each party: score = started points after trade from acquired players minus started points after trade from sent players.
  // Normalize to 0–100 with soft bounds.
  const results = [];
  for (const party of (trade.parties||[])){
    const gainedPts = sumAfterWeek(party.team, party.gainNames, trade.week, teamPlayerWeekPts);
    const lostPts   = sumAfterWeek(party.team, party.loseNames, trade.week, teamPlayerWeekPts);
    const delta = gainedPts - lostPts;
    const score = Math.max(0, Math.min(100, 50 + delta)); // simple linear clamp; replace with custom curve if desired
    results.push({ rid:party.rid, team:party.team, delta, score, gainedPts, lostPts });
  }
  return results;
}

// ------------ Render ------------
function scoreColor(score){
  // returns CSS color for score bar span (no fixed palette requirements in project)
  if (score>=70) return "linear-gradient(90deg, #064, #0a4)";
  if (score>=50) return "linear-gradient(90deg, #184, #2a6)";
  if (score>=30) return "linear-gradient(90deg, #744, #a64)";
  return "linear-gradient(90deg, #822, #c33)";
}

function renderTrades(trades, players, teamPlayerWeekPts){
  const list = $("#list"); list.innerHTML = "";

  for (const t of trades){
    // Decorate parties with player labels
    t.parties.forEach(p=>{
      p.gainNames = (p.gain||[]).map(pid => labelPlayer(pid, players));
      p.loseNames = (p.lose||[]).map(pid => labelPlayer(pid, players));
    });

    const scores = teamPlayerWeekPts ? scoreTrade(t, teamPlayerWeekPts) : null;

    const card = el("div",{class:"trade-card"},
      el("div",{style:"display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;"},
        el("div",{}, `Week ${t.week}`),
        el("span",{class:"badge"}, t.status)
      ),
      ...t.parties.map((p,idx)=>{
        const sc = scores ? scores.find(s=>s.rid===p.rid) : null;
        return el("div",{}, 
          el("div",{style:"font-weight:700;margin:.25rem 0 .35rem"}, `${p.team}`),
          el("div",{}, el("span",{class:"muted"},"Received: "), p.gainNames.length? p.gainNames.join(", ") : "—"),
          el("div",{}, el("span",{class:"muted"},"Sent: "),     p.loseNames.length? p.loseNames.join(", ") : "—"),
          sc ? el("div",{style:"margin-top:6px"},
            el("div",{class:"muted pos"}, `Δ started pts after trade: ${fmt(sc.delta)}  •  Score: ${fmt(sc.score)}`),
            el("div",{class:"scorebar",title:`${fmt(sc.score)}`}, el("span",{style:`width:${Math.max(4,Math.min(100,sc.score))}%; background:${scoreColor(sc.score)};`},""))
          ) : el("div",{class:"muted",style:"margin-top:6px"},"No lineup points found for scoring")
        );
      })
    );
    list.appendChild(card);
  }
}

function renderRollup(trades, teamPlayerWeekPts){
  const tbl = $("#rollupTbl"); const body = tbl.tBodies[0]; body.innerHTML = "";
  // Aggregate per team
  const agg = new Map(); // team -> {trades, gainCount, loseCount, deltaSum, scoreSum}
  for (const t of trades){
    for (const p of t.parties){
      const team = p.team;
      if (!agg.has(team)) agg.set(team, {trades:0,gainCount:0,loseCount:0,deltaSum:0,scoreSum:0,scored:0});
      const a = agg.get(team);
      a.trades += 1; a.gainCount += (p.gainNames?.length||0); a.loseCount += (p.loseNames?.length||0);
      if (teamPlayerWeekPts){
        const gainedPts = sumAfterWeek(team, p.gainNames||[], t.week, teamPlayerWeekPts);
        const lostPts   = sumAfterWeek(team, p.loseNames||[], t.week, teamPlayerWeekPts);
        const delta = gainedPts - lostPts;
        const score = Math.max(0, Math.min(100, 50 + delta));
        a.deltaSum += delta; a.scoreSum += score; a.scored += 1;
      }
    }
  }
  const rows = [...agg.entries()].map(([team,a])=>({
    team,
    trades: a.trades,
    gain: a.gainCount,
    lose: a.loseCount,
    delta: a.scored? a.deltaSum : null,
    avgScore: a.scored? (a.scoreSum/a.scored) : null
  }));
  rows.sort((x,y)=> (y.avgScore??-1)-(x.avgScore??-1) || y.trades-x.trades || x.team.localeCompare(y.team));
  for (const r of rows){
    body.appendChild(el("tr",{},
      el("td",{}, r.team),
      el("td",{}, String(r.trades)),
      el("td",{}, String(r.gain)),
      el("td",{}, String(r.lose)),
      el("td",{}, r.delta==null? "—" : fmt(r.delta)),
      el("td",{}, r.avgScore==null? "—" : fmt(r.avgScore))
    ));
  }
}

// ------------ Filters ------------
function applyFilters(allTrades){
  const teamVal = $("#teamFilter").value || "";
  const q = ($("#q").value||"").trim().toLowerCase();
  return allTrades.filter(t=>{
    const teamPass = !teamVal || t.parties.some(p => p.team === teamVal);
    if (!teamPass) return false;
    if (!q) return true;
    return t.parties.some(p =>
      (p.gainNames||[]).some(n => n.toLowerCase().includes(q)) ||
      (p.loseNames||[]).some(n => n.toLowerCase().includes(q))
    );
  });
}

// ------------ Boot ------------
async function main(){
  const meta = $("#meta"); meta.textContent = "Loading…";

  // seasons from manifest
  let manifest;
  try { manifest = await loadJSON("manifest.json"); } catch { manifest = { years: [] }; }
  const years = (manifest.years||[]).slice().sort((a,b)=>a-b);
  const yearSel = $("#yearSelect");
  yearSel.innerHTML="";
  years.forEach(y => yearSel.appendChild(el("option",{value:String(y)}, y)));
  const currentYear = years[years.length-1] || new Date().getFullYear();
  yearSel.value = String(currentYear);

  // load current season JSON (for team names + lineups for scoring)
  let season = null;
  try { season = await loadJSON(`data/${currentYear}.json`); } catch {}
  const teams = season?.teams || [];
  const teamNames = teams.map(t => t.team_name).sort((a,b)=>a.localeCompare(b));
  const teamSel = $("#teamFilter");
  teamSel.innerHTML = "";
  teamSel.appendChild(el("option",{value:""},"All Teams"));
  teamNames.forEach(n => teamSel.appendChild(el("option",{value:n}, n)));

  // index lineups for scoring
  const teamPlayerWeekPts = Array.isArray(season?.lineups) && season.lineups.length
    ? indexLineupsByTeamAfterWeek(season.lineups, currentYear)
    : null;

  // fetch and render trades
  const { trades, players } = await fetchTradesFull();

  // Decorate party names once for filtering/rollups
  trades.forEach(t => t.parties.forEach(p => {
    p.gainNames = (p.gain||[]).map(pid => labelPlayer(pid, players));
    p.loseNames = (p.lose||[]).map(pid => labelPlayer(pid, players));
  }));

  meta.textContent = `${trades.length} trades found • Season ${currentYear}`;

  function redraw(){
    const filtered = applyFilters(trades);
    renderTrades(filtered, players, teamPlayerWeekPts);
    renderRollup(filtered, teamPlayerWeekPts);
  }
  yearSel.onchange = async () => { location.reload(); }; // keep page simple per-season
  teamSel.onchange = redraw;
  $("#q").oninput = redraw;

  redraw();
}

document.addEventListener("DOMContentLoaded", main);
