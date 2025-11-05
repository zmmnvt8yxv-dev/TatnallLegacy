// Robust trade renderer with fallback to data/2025.json

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{const n=document.createElement(t);
  for(const[k,v] of Object.entries(a))(k==="class")?n.className=v:n.setAttribute(k,v);
  for(const k of kids)n.append(k?.nodeType?k:document.createTextNode(String(k??"")));
  return n;
};
const ROOT = new URL(".", document.baseURI).pathname.replace(/\/+$/,"") + "/";

async function fetchJSON(path){
  const url = ROOT + path.replace(/^\/+/,"");
  const r = await fetch(url + (url.includes("?")?"&":"?") + "v=" + Date.now(), {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// ----------- FALLBACK #2: derive trades from data/2025.json -----------
function weekOf(tx){ const m=String(tx?.date||"").match(/(\d+)/); return m? Number(m[1]) : null; }
function hasTrade(tx){ return Array.isArray(tx?.entries) && tx.entries.some(e=>e?.type==="TRADE"); }
function deriveTradesFromSeason(season){
  const txs = Array.isArray(season?.transactions)? season.transactions : [];
  const trades = [];
  let i=0;
  while(i<txs.length){
    const cur=txs[i]; const w=weekOf(cur);
    if(!hasTrade(cur)){ i++; continue; }
    const group=[cur]; let j=i+1;
    while(j<txs.length && hasTrade(txs[j]) && weekOf(txs[j])===w){ group.push(txs[j]); j++; }
    i=j;

    // build received-by-team from TRADE entries
    const recvByTeam = new Map();
    for(const g of group){
      for(const e of (g.entries||[])){
        if(e.type!=="TRADE") continue;
        const team = String(e.team||"Unknown").trim();
        if(!recvByTeam.has(team)) recvByTeam.set(team, new Set());
        recvByTeam.get(team).add(String(e.player||"").trim());
      }
    }
    if(recvByTeam.size<2) continue;
    const teams=[...recvByTeam.keys()];
    const parties = teams.map(t=>{
      const received=[...(recvByTeam.get(t)||[])].filter(Boolean);
      const sentSet=new Set();
      for(const u of teams){ if(u===t) continue; for(const p of (recvByTeam.get(u)||[])) sentSet.add(p); }
      return { team:t, received, sent:[...sentSet] };
    });
    trades.push({ id:`w${w}-${trades.length+1}`, week:w, parties });
  }
  return { year: Number(season?.year)||2025, trades };
}

// ----------- RENDER -----------
function partyBlock(p){
  const got  = (p.gained_players?.map(x=>x.name)) || p.received || [];
  const sent = (p.sent_players?.map(x=>x.name))   || p.sent     || [];
  const gotP = (p.gained_picks||[]).map(x=>`Pick ${x.season??""} R${x.round??""}`);
  const sentP= (p.sent_picks||[]).map(x=>`Pick ${x.season??""} R${x.round??""}`);
  return el("div",{style:"border:1px solid #2f2f2f;border-radius:.65rem;padding:10px;margin:8px 0"},
    el("div",{style:"font-weight:700;margin-bottom:6px"}, p.team || `Roster ${p.roster_id||""}`),
    el("div",{}, el("span",{style:"color:#9ca3af"},"Received: "),
      (got.length||gotP.length)? [...got,...gotP].join(", ") : "—"),
    el("div",{}, el("span",{style:"color:#9ca3af"},"Sent: "),
      (sent.length||sentP.length)? [...sent,...sentP].join(", ") : "—")
  );
}

function render(payload){
  const meta=$("#meta"); const list=$("#list"); list.innerHTML="";
  const trades = Array.isArray(payload?.trades) ? payload.trades.slice() : [];
  trades.sort((a,b)=> (a.week??0)-(b.week??0) || (a.created??0)-(b.created??0));
  meta.textContent = `${trades.length} trades • Season ${payload?.year ?? 2025}`;

  if(!trades.length){
    list.appendChild(el("div",{style:"color:#9ca3af;padding:12px"},"No trades found in either file."));
    return;
  }

  const q = $("#q");
  function draw(){
    const needle=(q?.value||"").trim().toLowerCase();
    list.innerHTML="";
    for(const t of trades){
      const hay=(t.parties||[]).map(p => [
        p.team,
        ...((p.gained_players||[]).map(x=>x.name)),
        ...((p.sent_players||[]).map(x=>x.name)),
        ...((p.received||[])),
        ...((p.sent||[]))
      ].join(" ")).join(" ").toLowerCase();
      if(needle && !hay.includes(needle)) continue;

      const headerLine=(t.parties||[]).map(p=>p.team).filter(Boolean).join(" ↔ ");
      const card=el("section",{style:"border:1px solid #2f2f2f;border-radius:.75rem;padding:12px;margin-bottom:12px"},
        el("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"},
          el("strong",{}, `Week ${t.week ?? "—"}`),
          el("span",{style:"color:#9ca3af"}, headerLine)
        )
      );
      (t.parties||[]).forEach(p=>card.appendChild(partyBlock(p)));
      list.appendChild(card);
    }
    if(!list.children.length) list.appendChild(el("div",{style:"color:#9ca3af;padding:12px"},"No trades match your filter."));
  }
  q && (q.oninput=draw); draw();
}

// ----------- BOOT -----------
async function main(){
  try{
    // Primary source
    try{
      const direct = await fetchJSON("data/trades-2025.json");
      if(Array.isArray(direct.trades) && direct.trades.length){ render(direct); return; }
      throw new Error("trades-2025.json has no `trades`");
    }catch(_){
      // Fallback: derive from season file
      const season = await fetchJSON("data/2025.json");
      const derived = deriveTradesFromSeason(season);
      render(derived);
    }
  }catch(e){
    console.error(e);
    $("#meta").textContent = `Load error: ${String(e.message||e)}`;
    $("#list").innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", main);
