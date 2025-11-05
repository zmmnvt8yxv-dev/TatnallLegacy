// Trade Analysis — render trades from data/trades-2025.json only.

const $ = s => document.querySelector(s);
const el = (t,a={},...kids)=>{ const n=document.createElement(t);
  for(const[k,v]of Object.entries(a))(k==="class")?n.className=v:n.setAttribute(k,v);
  for(const k of kids)n.append(k?.nodeType?k:document.createTextNode(k??""));
  return n;
};

async function loadTrades2025(){
  const r = await fetch(`data/trades-2025.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("Missing data/trades-2025.json");
  return r.json(); // {year, league_id, teams:[...], trades:[...]}
}

function partyLine(p){
  const got  = (p.gained_players||[]).map(x=>x.name).filter(Boolean);
  const sent = (p.sent_players||[]).map(x=>x.name).filter(Boolean);
  const gotPicks  = (p.gained_picks||[]).map(x=>`Pick ${x.season || ""} R${x.round || ""}`.trim()).filter(Boolean);
  const sentPicks = (p.sent_picks||[]).map(x=>`Pick ${x.season || ""} R${x.round || ""}`.trim()).filter(Boolean);
  return el("div",{class:"party"},
    el("div",{style:"font-weight:700;margin-bottom:6px"}, p.team || `Roster ${p.roster_id||""}`),
    el("div",{}, el("span",{class:"muted"},"Received: "),
      (got.length||gotPicks.length) ? [...got, ...gotPicks].join(", ") : "—"
    ),
    el("div",{}, el("span",{class:"muted"},"Sent: "),
      (sent.length||sentPicks.length) ? [...sent, ...sentPicks].join(", ") : "—"
    )
  );
}

function renderTrades(payload){
  const meta = $("#meta");
  const list = $("#list");
  list.innerHTML = "";

  const trades = Array.isArray(payload.trades) ? payload.trades : [];
  meta.textContent = `${trades.length} trades • Season ${payload.year || 2025}`;

  if (!trades.length){
    list.appendChild(el("div",{class:"muted"},"No trades found."));
    return;
  }

  const q = $("#q");
  function draw(){
    const needle = (q.value||"").trim().toLowerCase();
    list.innerHTML = "";

    trades.forEach(t => {
      // filter by team or player text
      const partyText = t.parties.map(p => [
        p.team,
        ...(p.gained_players||[]).map(x=>x.name),
        ...(p.sent_players||[]).map(x=>x.name)
      ].join(" ")).join(" ").toLowerCase();
      if (needle && !partyText.includes(needle)) return;

      const partiesLine = t.parties.map(p => p.team).join(" ↔ ");
      const card = el("div",{class:"trade-card", id:`trade-${t.id}`},
        el("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"},
          el("strong",{}, `Week ${t.week ?? "—"}`),
          el("span",{class:"muted"}, partiesLine)
        )
      );
      t.parties.forEach(p => card.appendChild(partyLine(p)));
      list.appendChild(card);
    });

    if (!list.children.length){
      list.appendChild(el("div",{class:"muted"},"No trades match your filter."));
    }
  }

  q.oninput = draw;
  draw();
}

async function main(){
  try{
    const payload = await loadTrades2025();
    renderTrades(payload);
  }catch(e){
    $("#meta").textContent = String(e.message || e);
    $("#list").innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", main);
