/// trade.js — minimal, uses only data/trades-2025.json

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{const n=document.createElement(t);
  for(const[k,v]of Object.entries(a))(k==="class")?n.className=v:n.setAttribute(k,v);
  for(const k of kids)n.append(k?.nodeType?k:document.createTextNode(String(k??"")));
  return n;
};

async function loadTrades() {
  const url = "data/trades-2025.json?ts=" + Date.now();
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Cannot load ${url} (HTTP ${r.status})`);
  return r.json();
}

function partyBlock(p){
  const got  = (p.gained_players||[]).map(x=>x.name);
  const sent = (p.sent_players||[]).map(x=>x.name);
  const gotPicks  = (p.gained_picks||[]).map(x=>`Pick ${x.season ?? ""} R${x.round ?? ""}`);
  const sentPicks = (p.sent_picks||[]).map(x=>`Pick ${x.season ?? ""} R${x.round ?? ""}`);

  return el("div",{style:"border:1px solid #2f2f2f;border-radius:.65rem;padding:10px;margin:8px 0"},
    el("div",{style:"font-weight:700;margin-bottom:6px"}, p.team || `Roster ${p.roster_id||""}`),
    el("div",{}, el("span",{style:"color:#9ca3af"},"Received: "),
      (got.length||gotPicks.length)? [...got,...gotPicks].join(", ") : "—"),
    el("div",{}, el("span",{style:"color:#9ca3af"},"Sent: "),
      (sent.length||sentPicks.length)? [...sent,...sentPicks].join(", ") : "—")
  );
}

function render(payload){
  const meta = $("#meta"); const list = $("#list");
  list.innerHTML = "";

  const trades = Array.isArray(payload?.trades) ? payload.trades.slice() : [];
  trades.sort((a,b)=> (a.week??0)-(b.week??0) || (a.created??0)-(b.created??0));

  meta.textContent = `${trades.length} trades • Season ${payload?.year ?? 2025}`;

  if (!trades.length){
    list.appendChild(el("div",{style:"color:#9ca3af"},"No trades found."));
    return;
  }

  for (const t of trades){
    const partiesLine = (t.parties||[]).map(p=>p.team).filter(Boolean).join(" ↔ ");
    const card = el("div",{style:"border:1px solid #2f2f2f;border-radius:.75rem;padding:12px"},
      el("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"},
        el("strong",{}, `Week ${t.week ?? "—"}`),
        el("span",{style:"color:#9ca3af"}, partiesLine || "")
      )
    );
    (t.parties||[]).forEach(p => card.appendChild(partyBlock(p)));
    list.appendChild(card);
  }
}

async function main(){
  try{
    const data = await loadTrades();
    render(data);
  }catch(e){
    const meta = $("#meta"); const list = $("#list");
    if (meta) meta.textContent = String(e.message || e);
    if (list) list.innerHTML = "";
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", main);
