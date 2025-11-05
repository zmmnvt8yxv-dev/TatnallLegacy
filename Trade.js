// Trade Analysis — minimal view from data/<year>.json
// Shows each trade and who received whom. No scoring, no rollups.

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{ const n=document.createElement(t);
  for (const [k,v] of Object.entries(a)) (k==="class")? n.className=v : n.setAttribute(k,v);
  for (const k of kids) n.append(k?.nodeType?k:document.createTextNode(k??""));
  return n;
};

// -------- data loaders --------
async function loadManifest(){ const r=await fetch("manifest.json",{cache:"no-store"}); return r.ok? r.json(): {years:[]}; }
async function loadSeason(year){ const r=await fetch(`data/${year}.json?ts=${Date.now()}`,{cache:"no-store"}); if(!r.ok) throw new Error("missing season file"); return r.json(); }

// -------- helpers --------
const weekOf = tx => parseInt(String(tx?.date||"").replace(/[^0-9]/g,""),10) || null;
const hasTrade = tx => Array.isArray(tx?.entries) && tx.entries.some(e => e?.type === "TRADE");
const trimTeam = s => String(s||"Unknown").trim();

// Group adjacent transactions that: (a) have a TRADE entry, (b) share week
function deriveTrades(transactions){
  const trades = [];
  const txs = Array.isArray(transactions)? transactions : [];
  let i = 0;
  while (i < txs.length){
    const cur = txs[i];
    const w = weekOf(cur);
    if (!hasTrade(cur)){ i++; continue; }

    const group = [cur];
    let j = i+1;
    while (j < txs.length && hasTrade(txs[j]) && weekOf(txs[j]) === w){
      group.push(txs[j]); j++;
    }
    i = j;

    // Build parties: for each team, received = TRADE players listed under that team
    const recvByTeam = new Map(); // team -> Set(players)
    for (const g of group){
      for (const e of (g.entries||[])){
        if (e.type !== "TRADE") continue;
        const team = trimTeam(e.team);
        if (!recvByTeam.has(team)) recvByTeam.set(team, new Set());
        recvByTeam.get(team).add(String(e.player||"").trim());
      }
    }
    if (recvByTeam.size < 2) continue; // not a multi-team swap

    // Infer "sent": a team's sent = union of every other team's received
    const parties = [];
    const allTeams = [...recvByTeam.keys()];
    const allReceived = new Map(allTeams.map(t => [t, new Set(recvByTeam.get(t))]));
    for (const t of allTeams){
      const received = [...(allReceived.get(t)||[])];
      const sentSet = new Set();
      for (const u of allTeams){ if (u===t) continue; for (const p of (allReceived.get(u)||[])) sentSet.add(p); }
      const sent = [...sentSet];
      parties.push({ team: t, received, sent });
    }

    trades.push({
      id: `w${w||0}-${trades.length+1}`,
      week: w,
      parties: parties.sort((a,b)=> a.team.localeCompare(b.team))
    });
  }
  return trades;
}

// -------- rendering --------
function renderTrades(trades){
  const host = $("#list");
  host.innerHTML = "";

  if (!trades.length){
    host.appendChild(el("div",{class:"muted",style:"padding:8px"},"No trades detected for this season."));
    return;
  }

  trades.forEach(tr => {
    const partiesLine = tr.parties.map(p=>p.team).join(" ↔ ");

    const card = el("div",{class:"trade-card"},
      el("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"},
        el("strong",{}, `Week ${tr.week ?? "—"}`),
        el("span",{class:"muted"}, partiesLine)
      )
    );

    tr.parties.forEach(p=>{
      card.appendChild(
        el("div",{style:"border:1px solid #2f2f2f;border-radius:.65rem;padding:10px;margin:8px 0"},
          el("div",{style:"font-weight:700;margin-bottom:6px"}, p.team),
          el("div",{},
            el("span",{class:"muted"},"Received: "),
            p.received.length ? p.received.join(", ") : "—"
          ),
          el("div",{},
            el("span",{class:"muted"},"Sent: "),
            p.sent.length ? p.sent.join(", ") : "—"
          )
        )
      );
    });

    host.appendChild(card);
  });
}

// -------- boot --------
async function main(){
  const meta = $("#meta"); meta.textContent = "Loading…";

  const mf = await loadManifest();
  const years = (mf.years||[]).slice().sort((a,b)=>a-b);
  const yearSel = $("#yearSelect"); if (yearSel){
    yearSel.innerHTML = "";
    years.forEach(y => yearSel.appendChild(el("option",{value:String(y)}, y)));
  }
  const selectedYear = years[years.length-1] || new Date().getFullYear();
  if (yearSel) yearSel.value = String(selectedYear);

  const season = await loadSeason(selectedYear);

  // Optional team dropdown (not required)
  const teamSel = $("#teamFilter");
  if (teamSel){
    const teamNames = (season.teams||[]).map(t=>t.team_name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    teamSel.innerHTML = ""; teamSel.appendChild(el("option",{value:""},"All Teams"));
    teamNames.forEach(n => teamSel.appendChild(el("option",{value:n}, n)));
  }

  const tradesAll = deriveTrades(season.transactions||[]);
  meta.textContent = `${tradesAll.length} trades • Season ${selectedYear}`;

  function applyFilters(trades){
    const teamVal = (teamSel && teamSel.value) ? String(teamSel.value) : "";
    const q = ($("#q")?.value||"").trim().toLowerCase();
    return trades.filter(t=>{
      const teamPass = !teamVal || t.parties.some(p => p.team === teamVal);
      if (!teamPass) return false;
      if (!q) return true;
      return t.parties.some(p =>
        p.received.some(n => n.toLowerCase().includes(q)) ||
        p.sent.some(n => n.toLowerCase().includes(q))
      );
    });
  }

  function redraw(){
    renderTrades(applyFilters(tradesAll));
  }

  teamSel && (teamSel.onchange = redraw);
  const q = $("#q"); q && (q.oninput = redraw);
  yearSel && (yearSel.onchange = () => location.reload());

  redraw();
}

document.addEventListener("DOMContentLoaded", main);
