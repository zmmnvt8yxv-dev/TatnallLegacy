// ==============================
// Trade Analysis (reads data/<year>.json; groups adjacent TRADE txns)
// ==============================

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{ const n=document.createElement(t);
  for (const [k,v] of Object.entries(a)) (k==="class")? n.className=v : n.setAttribute(k,v);
  for (const k of kids) n.append(k?.nodeType?k:document.createTextNode(k??""));
  return n;
};
const fmt = n => (n==null? "": (Math.round(Number(n)*100)/100).toString());

// -------- local fetch (no base/path tricks) --------
async function j(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }

// -------- derive trades by grouping adjacent txns with TRADE entries --------
//
// Your 2025.json structure: { transactions: [ {date:"Week N", entries:[{type,team,player,faab}, ...]}, ... ] }
// A single real trade often appears as TWO consecutive transaction objects,
// each with only one team and its TRADE lines. We group adjacent transactions
// that (a) contain at least one TRADE entry and (b) share the same week.
//
function weekOf(tx){ return parseInt(String(tx?.date||"").replace(/[^0-9]/g,""),10) || null; }

function deriveTrades(transactions){
  const trades = [];
  const txs = Array.isArray(transactions) ? transactions : [];
  let i = 0;

  while (i < txs.length){
    const cur = txs[i];
    const w = weekOf(cur);
    const curHasTrade = (cur.entries||[]).some(e => e.type === "TRADE");

    if (!curHasTrade){ i++; continue; }

    // Start a group at i and consume following txs that also have TRADE and same week.
    const group = [cur];
    let j = i + 1;
    while (j < txs.length){
      const nxt = txs[j];
      const nxtHasTrade = (nxt.entries||[]).some(e => e.type === "TRADE");
      if (!nxtHasTrade) break;
      if (weekOf(nxt) !== w) break;
      group.push(nxt);
      j++;
    }
    i = j; // advance

    // Build parties: treat TRADE/ADD as gains; DROP as losses.
    const byTeam = new Map(); // team -> {gain:Set<string>, lose:Set<string>}
    const ensure = (team)=>{ const key=(team||"Unknown").trim(); if(!byTeam.has(key)) byTeam.set(key,{gain:new Set(),lose:new Set()}); return byTeam.get(key); };

    for (const tx of group){
      for (const e of (tx.entries||[])){
        const team = (e.team || "Unknown").trim();
        if (e.type === "TRADE" || e.type === "ADD") ensure(team).gain.add(String(e.player||"").trim());
        else if (e.type === "DROP") ensure(team).lose.add(String(e.player||"").trim());
      }
    }

    // Infer what each team "sent": union of gains of *other* teams within the group.
    const teams = [...byTeam.keys()];
    for (const t of teams){
      const me = byTeam.get(t);
      const othersGain = new Set();
      for (const u of teams){ if (u===t) continue; for (const p of byTeam.get(u).gain) othersGain.add(p); }
      // merge inferred loses with explicit drop list
      for (const p of othersGain) me.lose.add(p);
    }

    // Normalize parties
    const parties = [...byTeam.entries()]
      .map(([team,obj])=>({ team, gain:[...obj.gain], lose:[...obj.lose] }))
      // keep teams that participated (have any gain or lose)
      .filter(p => p.gain.length || p.lose.length)
      .sort((a,b)=> a.team.localeCompare(b.team));

    if (parties.length >= 2){
      trades.push({ id: `w${w||0}-${trades.length+1}`, week: w, parties, created:null, status:"complete" });
    }
  }

  return trades;
}

// -------- scoring from saved lineups (optional) --------
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
    const gained = sumAfterWeek(p.team, p.gain, trade.week, teamMap);
    const lost   = sumAfterWeek(p.team, p.lose, trade.week, teamMap);
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

// -------- renderers --------
function renderTradeList(trades){
  const host = $("#list"); host.innerHTML = "";
  if (!trades.length){
    host.appendChild(el("div",{class:"muted",style:"padding:8px"},"No trades detected for this season."));
    return;
  }
  const tbl = el("table",{}, el("thead",{}, el("tr",{},
    el("th",{},"Week"), el("th",{},"Parties"), el("th",{},"Summary"), el("th",{},"Details")
  )), el("tbody",{}));

  for (const t of trades){
    const parties = t.parties.map(p=>p.team).join(" ↔ ");
    const summary = t.parties.map(p=>{
      const got = p.gain.length ? p.gain.join(", ") : "—";
      return `${p.team}: ${got}`;
    }).join(" | ");

    tbl.tBodies[0].appendChild(
      el("tr",{"data-trade-id":t.id},
        el("td",{}, String(t.week ?? "—")),
        el("td",{}, parties),
        el("td",{}, summary),
        el("td",{}, el("a",{href:`#trade/${t.id}`,class:"badge"},"View"))
      )
    );
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
    box.appendChild(
      el("div",{style:"border:1px solid #2f2f2f;border-radius:.75rem;padding:10px;margin:6px 0"},
        el("div",{style:"font-weight:700;margin-bottom:4px"}, p.team),
        el("div",{}, el("span",{class:"muted"},"Received: "), p.gain.length? p.gain.join(", ") : "—"),
        el("div",{}, el("span",{class:"muted"},"Sent: "), p.lose.length? p.lose.join(", ") : "—"),
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
      a.gain   += p.gain.length;
      a.lose   += p.lose.length;
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

// -------- filters --------
function applyFilters(allTrades){
  const teamVal = $("#teamFilter").value || "";
  const q = ($("#q").value||"").trim().toLowerCase();
  return allTrades.filter(t=>{
    const teamPass = !teamVal || t.parties.some(p => p.team === teamVal);
    if (!teamPass) return false;
    if (!q) return true;
    return t.parties.some(p =>
      p.gain.some(n => n.toLowerCase().includes(q)) ||
      p.lose.some(n => n.toLowerCase().includes(q))
    );
  });
}

// -------- boot --------
async function main(){
  const meta = $("#meta"); meta.textContent = "Loading…";

  // seasons
  let mf; try { mf = await j("manifest.json"); } catch { mf = { years: [] }; }
  const years = (mf.years||[]).slice().sort((a,b)=>a-b);
  const yearSel = $("#yearSelect"); yearSel.innerHTML="";
  years.forEach(y => yearSel.appendChild(el("option",{value:String(y)}, y)));
  const selectedYear = years[years.length-1] || new Date().getFullYear();
  yearSel.value = String(selectedYear);

  // load season JSON
  const season = await j(`data/${selectedYear}.json`);
  const teamNames = (season.teams||[]).map(t=>t.team_name).sort((a,b)=>a.localeCompare(b));
  const teamSel = $("#teamFilter");
  teamSel.innerHTML = ""; teamSel.appendChild(el("option",{value:""},"All Teams"));
  teamNames.forEach(n => teamSel.appendChild(el("option",{value:n}, n)));

  // derive trades from adjacent groups of TRADE txns
  const tradesAll = deriveTrades(season.transactions||[]);
  const teamMap = (season.lineups && season.lineups.length) ? indexLineupsByTeamAfterWeek(season.lineups) : null;

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
