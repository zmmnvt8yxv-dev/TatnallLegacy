// Minimal renderer for data/trades-2025.json

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{const n=document.createElement(t);
  for(const[k,v] of Object.entries(a))(k==="class")? n.className=v : n.setAttribute(k,v);
  for(const k of kids) n.append(k?.nodeType?k:document.createTextNode(String(k??"")));
  return n;
};

async function loadTrades() {
  const url = "data/trades-2025.json?ts=" + Date.now();
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`);
  return r.json();
}

function renderParty(p){
  const got  = (p.gained_players||[]).map(x=>x.name);
  const sent = (p.sent_players||[]).map(x=>x.name);
  const gotP = (p.gained_picks||[]).map(x=>`Pick ${x.season??""} R${x.round??""}`);
  const sentP= (p.sent_picks||[]).map(x=>`Pick ${x.season??""} R${x.round??""}`);
  return el("div",{class:"party"},
    el("div",{style:"font-weight:700;margin-bottom:6px"}, p.team || `Roster ${p.roster_id||""}`),
    el("div",{}, el("span",{class:"muted"},"Received: "), (got.length||gotP.length)? [...got,...gotP].join(", ") : "—"),
    el("div",{}, el("span",{class:"muted"},"Sent: "),     (sent.length||sentP.length)? [...sent,...sentP].join(", ") : "—"),
  );
}

function renderList(payload){
  const meta = $("#meta");
  const list = $("#list");
  list.innerHTML = "";

  const trades = Array.isArray(payload?.trades) ? payload.trades.slice() : [];
  trades.sort((a,b)=> (a.week??0)-(b.week??0) || (a.created??0)-(b.created??0));

  meta.textContent = `${trades.length} trades • Season ${payload?.year ?? "2025"}`;

  if (!trades.length){
    list.appendChild(el("div",{class:"card muted"},"No trades found."));
    return;
  }

  const q = $("#q");
  function draw(){
    const needle = (q?.value||"").trim().toLowerCase();
    list.innerHTML = "";

    for (const t of trades){
      const hay = (t.parties||[]).map(p => [
        p.team,
        ...(p.gained_players||[]).map(x=>x.name),
        ...(p.sent_players||[]).map(x=>x.name)
      ].join(" ")).join(" ").toLowerCase();
      if (needle && !hay.includes(needle)) continue;

      const headerLine = (t.parties||[]).map(p=>p.team).filter(Boolean).join(" ↔ ");
      const card = el("section",{class:"card"},
        el("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"},
          el("strong",{}, `Week ${t.week ?? "—"}`),
          el("span",{class:"muted"}, headerLine)
        )
      );
      (t.parties||[]).forEach(p => card.appendChild(renderParty(p)));
      list.appendChild(card);
    }

    if (!list.children.length) list.appendChild(el("div",{class:"card muted"},"No trades match your filter."));
  }

  q && (q.oninput = draw);
  draw();
}

async function main(){
  try{
    const data = await loadTrades();
    // quick sanity check to help debug in UI
    if (!data || !Array.isArray(data.trades)) throw new Error("data/trades-2025.json loaded but missing `trades` array");
    renderList(data);
  }catch(e){
    console.error(e);
    $("#meta").textContent = String(e.message || e);
    $("#list").innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", main);
