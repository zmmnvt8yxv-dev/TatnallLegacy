// ------- tiny helpers -------
async function loadJSON(path){
  const r = await fetch(path, { cache: "no-store" });
  if(!r.ok) throw new Error(`fetch ${path} -> ${r.status}`);
  return r.json();
}
function el(tag, attrs={}, ...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)) (k==="class")? n.className=v : n.setAttribute(k,v);
  for(const k of kids) n.append(k?.nodeType?k:document.createTextNode(k??""));
  return n;
}
function fmt(n){ if(n===null||n===undefined) return ""; return typeof n==="number" ? (Math.round(n*100)/100).toString() : String(n); }
function sortTable(tbl, idx, numeric=false){
  const tbody=tbl.tBodies[0]; const rows=[...tbody.rows]; const asc=!tbl._asc;
  rows.sort((a,b)=>{ const av=a.cells[idx].textContent.trim(); const bv=b.cells[idx].textContent.trim();
    if(numeric){ return (parseFloat(av)||0)-(parseFloat(bv)||0); } return av.localeCompare(bv); });
  if(!asc) rows.reverse(); rows.forEach(r=>tbody.appendChild(r)); tbl._asc=asc;
}
function attachSort(ths, tbl){ ths.forEach((th,i)=> th.addEventListener("click", ()=> sortTable(tbl, i, /\bscore\b|points|rank|pick|round|faab/i.test(th.textContent)))); }

// ------- UI entry -------
async function main(){
  let years=[];
  // API-first, static fallback
  try { years = (await loadJSON("/api/seasons")).years || []; }
  catch { years = (await loadJSON("manifest.json")).years || []; }

  const seasonSelect = document.getElementById("seasonSelect");
  seasonSelect.innerHTML = "";
  years.slice().reverse().forEach(y=> seasonSelect.appendChild(el("option",{value:y}, y)));
  seasonSelect.addEventListener("change", ()=> renderSeason(+seasonSelect.value));

  if(years.length){
    seasonSelect.value = years[years.length-1];
    await renderSeason(+seasonSelect.value);
  } else {
    // no years => show a simple hint
    document.getElementById("content").prepend(
      el("div",{class:"panel"}, el("pre",{}, "No seasons found. Ensure manifest.json exists or /api/seasons returns years."))
    );
  }
}

async function renderSeason(year){
  let data;
  try { data = await loadJSON(`/api/season?year=${year}`); }       // from Neon via Netlify Functions
  catch { data = await loadJSON(`data/${year}.json`); }            // static fallback

  renderSummary(year, data);
  renderTeams(data.teams||[]);
  renderMatchups(data.matchups||[]);
  renderTransactions(data.transactions||[]);
  renderDraft(data.draft||[]);
}

// ------- sections -------
function renderSummary(year, data){
  const wrap = document.getElementById("summaryStats"); wrap.innerHTML = "";
  const teams = data.teams||[], matchups = data.matchups||[], draft = data.draft||[], txns = data.transactions||[];
  const champ = teams.find(t=> t.final_rank===1)?.team_name || "—";
  const bestPF = teams.slice().sort((a,b)=> (b.points_for||0)-(a.points_for||0))[0];
  const bestPA = teams.slice().sort((a,b)=> (a.points_against||0)-(b.points_against||0))[0];
  const avgPF = teams.length ? (teams.reduce((s,t)=>s+(t.points_for||0),0)/teams.length) : 0;
  const stats = [
    ["Season", year],
    ["Champion", champ],
    ["Top Points For", bestPF? `${bestPF.team_name} (${fmt(bestPF.points_for)})`:"—"],
    ["Lowest Points Against", bestPA? `${bestPA.team_name} (${fmt(bestPA.points_against)})`:"—"],
    ["Average PF / Team", fmt(avgPF)],
    ["Games Recorded", matchups.length],
    ["Draft Picks", draft.length],
    ["Transactions", txns.length]
  ];
  for(const [k,v] of stats){ wrap.appendChild(el("div",{class:"stat"}, el("h3",{},k), el("p",{}, String(v)))); }
}

function renderTeams(teams){
  const wrap = document.getElementById("teamsWrap"); wrap.innerHTML = "";
  const tbl = el("table",{},
    el("thead",{}, el("tr",{}, 
      el("th",{}, "Team/Manager"), el("th",{}, "Record"), el("th",{}, "Points For"),
      el("th",{}, "Points Against"), el("th",{}, "In-Season Rank"), el("th",{}, "Final Rank")
    )),
    el("tbody",{})
  );
  teams.forEach(t=>{
    tbl.tBodies[0].appendChild(el("tr",{},
      el("td",{}, `${t.team_name}${t.owner?` (${t.owner})`:""}`),
      el("td",{}, fmt(t.record)),
      el("td",{}, fmt(t.points_for)),
      el("td",{}, fmt(t.points_against)),
      el("td",{}, fmt(t.regular_season_rank)),
      el("td",{}, fmt(t.final_rank))
    ));
  });
  wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

function renderMatchups(matchups){
  const wrap = document.getElementById("matchupsWrap"); wrap.innerHTML = "";
  const weekSel = document.getElementById("weekFilter");
  const search = document.getElementById("matchupSearch");
  const weeks = [...new Set(matchups.map(m=>m.week))].sort((a,b)=>a-b);
  weekSel.innerHTML = ""; weekSel.appendChild(el("option",{value:""}, "All Weeks"));
  weeks.forEach(w=> weekSel.appendChild(el("option",{value:w}, `Week ${w}`)));
  const tbl = el("table",{}, 
    el("thead",{}, el("tr",{}, 
      el("th",{}, "Week"), el("th",{}, "Home Team"), el("th",{}, "Home Score"),
      el("th",{}, "Away Team"), el("th",{}, "Away Score"), el("th",{}, "Type")
    )),
    el("tbody",{})
  );
  function row(m){
    return el("tr",{},
      el("td",{}, fmt(m.week)),
      el("td",{}, fmt(m.home_team)),
      el("td",{}, fmt(m.home_score)),
      el("td",{}, fmt(m.away_team)),
      el("td",{}, fmt(m.away_score)),
      el("td",{}, m.is_playoff ? el("span",{class:"badge"},"Playoff") : "")
    );
  }
  function apply(){
    const wk = weekSel.value;
    const q = search.value.trim().toLowerCase();
    tbl.tBodies[0].innerHTML = "";
    matchups
      .filter(m => !wk || String(m.week)===wk)
      .filter(m => !q || [m.home_team,m.away_team].some(n => String(n||"").toLowerCase().includes(q)))
      .forEach(m => tbl.tBodies[0].appendChild(row(m)));
  }
  weekSel.onchange = apply; search.oninput = apply; apply();
  wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

function renderTransactions(txns){
  const wrap = document.getElementById("txnsWrap"); wrap.innerHTML = "";
  const search = document.getElementById("txnSearch");
  const hasAny = Array.isArray(txns) && txns.length>0;
  const flatten = (tx)=> (tx.entries||[]).map(e=>({date:tx.date||"", ...e}));
  const rows = hasAny ? txns.flatMap(flatten) : [];
  if (!rows.length){
    wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"}, "No transactions available for this season.")));
    return;
  }
  const tbl = el("table",{},
    el("thead",{}, el("tr",{}, 
      el("th",{}, "Date"), el("th",{}, "Type"), el("th",{}, "Team"), el("th",{}, "Player"), el("th",{}, "FAAB")
    )),
    el("tbody",{})
  );
  function apply(){
    const q = search.value.trim().toLowerCase();
    const body = tbl.tBodies[0]; body.innerHTML = "";
    rows.filter(r => !q || [r.type,r.team,r.player].some(v=> String(v||"").toLowerCase().includes(q)))
        .forEach(r => body.appendChild(el("tr",{},
          el("td",{}, fmt(r.date)),
          el("td",{}, fmt(r.type)),
          el("td",{}, fmt(r.team)),
          el("td",{}, fmt(r.player)),
          el("td",{}, fmt(r.faab))
        )));
  }
  search.oninput = apply; apply();
  wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

function renderDraft(draft){
  const wrap = document.getElementById("draftWrap"); wrap.innerHTML = "";
  const search = document.getElementById("draftSearch");
  const tbl = el("table",{}, 
    el("thead",{}, el("tr",{}, 
      el("th",{}, "Round"), el("th",{}, "Pick"), el("th",{}, "Team"), el("th",{}, "Player"), el("th",{}, "NFL Team"), el("th",{}, "Keeper")
    )),
    el("tbody",{})
  );
  function apply(){
    const q = search.value.trim().toLowerCase();
    tbl.tBodies[0].innerHTML = "";
    draft.filter(d => !q || [d.team, d.player, d.player_nfl].some(v=> String(v||"").toLowerCase().includes(q)))
         .forEach(d => tbl.tBodies[0].appendChild(el("tr",{},
           el("td",{}, fmt(d.round)),
           el("td",{}, fmt(d.overall)),
           el("td",{}, fmt(d.team)),
           el("td",{}, fmt(d.player)),
           el("td",{}, fmt(d.player_nfl)),
           el("td",{}, d.keeper ? "Yes" : "")
         )));
  }
  search.oninput = apply; apply();
  wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

main().catch(e=>{
  document.getElementById("content").prepend(el("div",{class:"panel"}, el("pre",{}, String(e))));
});
