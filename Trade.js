// Trade Analysis — consumes data/trades-<year>.json and (optionally) data/<year>.json for lineup scoring.

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{const n=document.createElement(t);for(const[k,v]of Object.entries(a))(k==="class")?n.className=v:n.setAttribute(k,v);for(const k of kids)n.append(k?.nodeType?k:document.createTextNode(k??""));return n;}
const fmt = n => (n==null? "": (Math.round(Number(n)*100)/100).toString());

async function loadManifest(){ const r=await fetch("manifest.json",{cache:"no-store"}); if(!r.ok) return {years:[]}; return r.json(); }
async function loadTrades(year){
  const r = await fetch(`data/trades-2025.json?ts=${Date.now()}`, {cache:"no-store"});
  if(!r.ok) throw new Error("trades file missing");
  return r.json(); // {year, league_id, teams:[{roster_id,team,...}], trades:[...]}
}
async function loadSeason(year){
  const r = await fetch(`data/${year}.json?ts=${Date.now()}`, {cache:"no-store"});
  return r.ok ? r.json() : null;
}

// ---- scoring using saved lineups (optional)
function indexLineupsByTeamAfterWeek(lineups){
  const byTeam = new Map(); // team -> player -> Map(week->pts_started)
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
    const gainedNames = (p.gained_players||[]).map(x=>x.name);
    const sentNames   = (p.sent_players||[]).map(x=>x.name);
    const gained = sumAfterWeek(p.team, gainedNames, trade.week, teamMap);
    const lost   = sumAfterWeek(p.team, sentNames,   trade.week, teamMap);
    const delta  = gained - lost;
    const score  = Math.max(0, Math.min(100, 50 + delta)); // clamp
    return { team:p.team, delta, score, gained, lost };
  });
}
function scoreColor(score){
  if (score>=70) return "#22c55e";
  if (score>=50) return "#84cc16";
  if (score>=30) return "#f59e0b";
  return "#ef4444";
}

// ---- renderers
function renderTradeList(trades){
  const host = $("#list"); host.innerHTML = "";
  if (!trades.length){
    host.appendChild(el("div",{class:"muted",style:"padding:8px"},"No trades for this season."));
    return;
  }

  const tbl = el("table",{}, el("thead",{}, el("tr",{},
    el("th",{},"Week"), el("th",{},"Parties"), el("th",{},"Summary"), el("th",{},"Details")
  )), el("tbody",{}));

  for (const t of trades){
    const parties = t.parties.map(p=>p.team).join(" ↔ ");
    const summary = t.parties.map(p=>{
      const got = (p.gained_players||[]).map(x=>x.name).join(", ") || "—";
      return `${p.team}: ${got}`;
    }).join(" | ");

    const row = el("tr",{"data-trade-id":t.id},
      el("td",{}, String(t.week ?? "—")),
      el("td",{}, parties),
      el("td",{}, summary),
      el("td",{}, el("a",{href:`#trade/${t.id}`,class:"badge"},"View"))
    );
    tbl.tBodies[0].appendChild(row);
  }
  host.appendChild(tbl);
}

function renderTradeDetail(trade, teamMap){
  $("#tradeDetail")?.remove();
  const scored = scoreTrade(trade, teamMap);

  const box = el("section",{id:"tradeDetail",class:"panel",style:"margin-bottom:12px"},
    el("h2",{}, `Trade — Week ${trade.week ?? "?"}`)
  );

  trade.parties.forEach(p=>{
    const s = scored ? scored.find(x=>x.team===p.team) : null;
    const got = (p.gained_players||[]).map(x=>x.name);
    const sent= (p.sent_players||[]).map(x=>x.name);

    box.appendChild(
      el("div",{style:"border:1px solid #2f2f2f;border-radius:.75rem;padding:10px;margin:6px 0"},
        el("div",{style:"font-weight:700;margin-bottom:4px"}, p.team),
        el("div",{}, el("span",{class:"muted"},"Received: "), got.length? got.join(", ") : "—"),
        el("div",{}, el("span",{class:"muted"},"Sent: "),     sent.length? sent.join(", ") : "—"),
        s ? el("div",{style:"margin-top:6px"},
          el("div",{class:"muted"}, `Δ started pts after trade: ${fmt(s.delta)}  •  Score: ${fmt(s.score)}`),
          el("div",{style:"height:6px;border-radius:4px;background:#111;overflow:hidden"},
            el("div",{style:`width:${Math.max(4,Math.min(100,s.score))}%;height:6px;background:${scoreColor(s.score)}`})
          )
        ) : el("div",{class:"muted",style:"margin-top:6px"},"No lineup points available for scoring")
      )
    );
  });

  const firstPanel = document.querySelector("main .panel");
  firstPanel.parentNode.insertBefore(box, firstPanel);
}

function renderRollup(trades, teamMap){
  const body = $("#rollupTbl").tBodies[0]; body.innerHTML = "";
  const agg = new Map(); // team -> stats

  for (const t of trades){
    const scored = scoreTrade(t, teamMap);
    for (const p of t.parties){
      const a = agg.get(p.team) || { trades:0, gain:0, lose:0, delta:0, score:0, scored:0 };
      a.trades += 1;
      a.gain   += (p.gained_players||[]).length;
      a.lose   += (p.sent_players||[]).length;
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

// ---- filters
function applyFilters(allTrades){
  const teamVal = $("#teamFilter").value || "";
  const q = ($("#q").value||"").trim().toLowerCase();
  return allTrades.filter(t=>{
    const teamPass = !teamVal || t.parties.some(p => p.team === teamVal);
    if (!teamPass) return false;
    if (!q) return true;
    return t.parties.some(p =>
      (p.gained_players||[]).some(n => n.name.toLowerCase().includes(q)) ||
      (p.sent_players||[]).some(n => n.name.toLowerCase().includes(q))
    );
  });
}

// ---- boot
async function main(){
  const meta = $("#meta"); meta.textContent = "Loading…";

  const mf = await loadManifest();
  const years = (mf.years||[]).slice().sort((a,b)=>a-b);
  const yearSel = $("#yearSelect"); yearSel.innerHTML="";
  years.forEach(y => yearSel.appendChild(el("option",{value:String(y)}, y)));
  const selectedYear = years[years.length-1] || new Date().getFullYear();
  yearSel.value = String(selectedYear);

  // load trades and season (for optional scoring)
  const [payload, season] = await Promise.all([loadTrades(selectedYear), loadSeason(selectedYear)]);
  const teamMap = (season?.lineups && season.lineups.length) ? indexLineupsByTeamAfterWeek(season.lineups) : null;

  // team filter
  const teamSel = $("#teamFilter");
  const teamNames = (payload.teams||[]).map(t=>t.team).sort((a,b)=>a.localeCompare(b));
  teamSel.innerHTML = ""; teamSel.appendChild(el("option",{value:""},"All Teams"));
  teamNames.forEach(n => teamSel.appendChild(el("option",{value:n}, n)));

  const tradesAll = payload.trades || [];
  meta.textContent = `${tradesAll.length} trades • Season ${selectedYear}`;

  function redraw(){
    const filtered = applyFilters(tradesAll);
    renderTradeList(filtered);
    renderRollup(filtered, teamMap);
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

  window.addEventListener("hashchange", ()=>{
    const m = location.hash.match(/^#trade\/(.+)$/i);
    if (!m){ $("#tradeDetail")?.remove(); return; }
    const t = tradesAll.find(x=>x.id===m[1]);
    if (t) renderTradeDetail(t, teamMap);
  }, { passive:true });

  redraw();
  if (tradesAll.length && !location.hash) location.hash = `#trade/${tradesAll[0].id}`;
}

document.addEventListener("DOMContentLoaded", main);
