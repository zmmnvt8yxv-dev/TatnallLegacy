// ==============================
// Tatnall Legacy — app.js (clean)
// ==============================

// ---------- helpers ----------
const ROOT = new URL(".", document.baseURI).pathname.replace(/\/+$/, "") + "/";

async function loadJSON(relPath){
  const url = ROOT + relPath.replace(/^\/+/, "");
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(), { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
function el(tag, attrs={}, ...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)) (k==="class")? n.className=v : n.setAttribute(k,v);
  for(const k of kids) n.append(k?.nodeType?k:document.createTextNode(k??""));
  return n;
}
function fmt(n){ if(n===null||n===undefined) return ""; return typeof n==="number"? (Math.round(n*100)/100).toString(): String(n); }
function sortTable(tbl, idx, numeric=false){
  const tbody=tbl.tBodies[0]; const rows=[...tbody.rows]; const asc=!tbl._asc;
  rows.sort((a,b)=>{ const av=a.cells[idx].textContent.trim(); const bv=b.cells[idx].textContent.trim();
    if(numeric){ return (parseFloat(av)||0)-(parseFloat(bv)||0); } return av.localeCompare(bv); });
  if(!asc) rows.reverse(); rows.forEach(r=>tbody.appendChild(r)); tbl._asc=asc;
}
function attachSort(ths, tbl){
  ths.forEach((th,i)=>
    th.addEventListener("click", () =>
      sortTable(tbl, i, /\bscore\b|points|rank|pick|round|faab|win|champ|games|seasons|count/i.test(th.textContent))
    )
  );
}

// ---------- Owner normalization ----------
const OWNER_ALIASES_RAW = {
  // IDs/handles
  "espn92085473": "Roy Lee",
  "edward3864": "Edward Saad",
  "phillyphilly709": "Edward Saad",
  "jalendelrosario@comcast.net": "Jalen Del Rosario",
  "jawnwick13": "Jared Duncan",
  "jdunca5228572": "Jared Duncan",
  "conner27lax": "Conner Malley",
  "connerandfinn": "Conner Malley",
  "sdmarvin713": "Carl Marvin",
  "cmarvin713": "Carl Marvin",
  "john.downs123": "John Downs",
  "downsliquidity": "John Downs",
  "bhanrahan7": "Brendan Hanrahan",
  "jefe6700": "Jeff Crossland",
  "junktion": "Jeff Crossland",
  "jksheehy": "Jackie Sheehy",
  "lbmbets": "Samuel Kirby",
  "mattmaloy99": "Matt Maloy",
  "mhardi5674696": "Max Hardin",
  "roylee6": "Roy Lee",

  // plain-name/typo variants from JSON
  "brendan hanrahan": "Brendan Hanrahan",
  "carl marvin": "Carl Marvin",
  "conner malley": "Conner Malley",
  "edward saad": "Edward Saad",
  "jack sheehy": "Jackie Sheehy",
  "jalen del rosario": "Jalen Del Rosario",
  "jared duncan": "Jared Duncan",
  "jeff crossland": "Jeff Crossland",
  "jeffrey crossland": "Jeff Crossland",
  "john downs": "John Downs",
  "matt maloy": "Matt Maloy",
  "max hardin": "Max Hardin",
  "roy lee": "Roy Lee",
  "samuel kirby": "Samuel Kirby",
  "stephen marvin": "Carl Marvin",
  "John downs123": "John Downs"
};
const OWNER_ALIASES = Object.fromEntries(
  Object.entries(OWNER_ALIASES_RAW).map(([k,v]) => [k.toLowerCase(), v])
);

function titleCaseName(s) {
  const lowerParticles = new Set(["de", "del", "da", "di", "van", "von", "la", "le"]);
  return s.trim().split(/\s+/).map((w,i) => {
    const wl = w.toLowerCase();
    if (i > 0 && lowerParticles.has(wl)) return wl;
    return wl.charAt(0).toUpperCase() + wl.slice(1);
  }).join(" ");
}

function canonicalOwner(raw){
  let n = String(raw || "").trim();
  if (!n) return "";

  // email -> prefix
  if (n.includes("@")) n = n.split("@")[0];

  // unify separators and spacing
  n = n.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();

  const key = n.toLowerCase();
  if (OWNER_ALIASES[key]) return OWNER_ALIASES[key];

  // if it looks like a human name, title-case it
  if (/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(n)) return titleCaseName(n);

  // otherwise return as-is (ids/handles)
  return n;
}

function collectOwners(seasons){
  const owners = new Set();
  for (const s of seasons) {
    for (const t of (s.teams||[])) {
      const raw = (t.owner ?? t.team_name ?? "").toString().trim();
      const canon = canonicalOwner(raw);
      if (canon) owners.add(canon);
    }
  }
  return [...owners].sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:"base"}));
}

// ---------- all-years ----------
let ALL_SEASONS = null;

async function loadAllSeasons(){
  const m = await loadJSON("manifest.json");
  const years = m.years || [];
  const seasons = [];
  for (const y of years) {
    try {
      const d = await loadJSON(`data/${y}.json`);
      if (typeof d.year !== "number") d.year = Number(y);
      seasons.push(d);
    } catch (err) {
      console.warn("Skipping season:", y, err);
    }
  }
  return seasons;
}

// helper: exclude unplayed 0–0 matches in 2025
function is2025FutureZeroZero(season, m){
  return Number(season.year)===2025 && Number(m.home_score||0)===0 && Number(m.away_score||0)===0;
}

// aggregate across seasons; apply 2025 0–0 rule; count championships
function aggregateMember(owner, seasons){
  let wins=0, losses=0, ties=0, games=0;
  let most = -Infinity, least = Infinity;
  let champs = 0;

  for (const s of seasons){
    const ownerByTeam = new Map();
    (s.teams||[]).forEach(t => {
      const raw = (t.owner ?? t.team_name ?? "").toString().trim();
      ownerByTeam.set(t.team_name, canonicalOwner(raw));
    });

    const champTeam = (s.teams || []).find(t => t.final_rank === 1);
    if (champTeam){
      const raw = (champTeam.owner ?? champTeam.team_name ?? "").toString().trim();
      if (canonicalOwner(raw) === owner) champs++;
    }

    for (const m of (s.matchups||[])){
      if (is2025FutureZeroZero(s,m)) continue;

      const hPts = Number(m.home_score ?? 0);
      const aPts = Number(m.away_score ?? 0);

      if (m.home_team && ownerByTeam.get(m.home_team) === owner){
        games++; if (hPts > aPts) wins++; else if (hPts < aPts) losses++; else ties++;
        if (hPts > most) most = hPts; if (hPts < least) least = hPts;
      }
      if (m.away_team && ownerByTeam.get(m.away_team) === owner){
        games++; if (aPts > hPts) wins++; else if (aPts < hPts) losses++; else ties++;
        if (aPts > most) most = aPts; if (aPts < least) least = aPts;
      }
    }
  }

  if (games === 0){ most = null; least = null; }
  const winPct = games ? Math.round((wins + ties*0.5)/games*1000)/1000 : 0;
  return {wins, losses, ties, games, winPct, most, least, champs};
}

// ===== Metrics helpers =====
function biggestBlowoutsFromMatchups(matchups, limit = 3) {
  const rows = (matchups||[]).map(m => {
    const h = Number(m.home_score||0), a = Number(m.away_score||0);
    const margin = Math.abs(h - a);
    const winner = h > a ? m.home_team : (a > h ? m.away_team : null);
    const loser  = h > a ? m.away_team : (a > h ? m.home_team : null);
    return {
      week: m.week,
      winner,
      loser,
      margin,
      home_team: m.home_team,
      away_team: m.away_team,
      home_score: h,
      away_score: a
    };
  })
  // exclude ties + any zero-score side
  .filter(r => r.margin > 0 && r.home_score > 0 && r.away_score > 0);

  rows.sort((a,b)=> b.margin - a.margin);
  return rows.slice(0, limit);
}

function computeMostDrafted(seasons){
  const seen = new Map(); // player -> Set(years)
  for (const s of seasons || []){
    const y = Number(s.year);
    for (const p of (s.draft || [])){
      const name = String(p.player || "").trim();
      if (!name) continue;
      if (!seen.has(name)) seen.set(name, new Set());
      seen.get(name).add(y);
    }
  }
  const rows = [];
  for (const [player, yearsSet] of seen.entries()){
    const years = Array.from(yearsSet).sort((a,b)=>a-b);
    rows.push({ player, count: years.length, years });
  }
  rows.sort((a,b) => (b.count - a.count) || a.player.localeCompare(b.player));
  return rows;
}

// ---------- per-season + UI ----------
async function main(){
  try {
    const m = await loadJSON("manifest.json");
    const years = m.years || [];
    const sel = document.getElementById("seasonSelect");
    sel.innerHTML = "";
    years.slice().reverse().forEach(y => sel.appendChild(el("option",{value:y}, y)));
    sel.onchange = () => renderSeason(+sel.value);
    if (years.length){ sel.value = years[years.length-1]; await renderSeason(+sel.value); }
    else throw new Error("No years in manifest.json");

    await setupMemberSummary();   // also triggers “Most Drafted” render
  } catch (e){
    renderFatal(e);
  }
}

async function renderSeason(year){
  try{
    const data = await loadJSON(`data/${year}.json`);
    renderSummary(year, data);
    renderTeams(data.teams||[]);
    renderMatchups(data.matchups||[]);
    renderTransactions(data.transactions||[]);
    renderDraft(data.draft||[]);
  } catch(e){
    renderFatal(e);
  }
}

function renderSummary(year, data){
  const wrap = document.getElementById("summaryStats"); wrap.innerHTML="";
  const teams = data.teams||[], matchups=data.matchups||[], draft=data.draft||[], txns=data.transactions||[];
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

  // Biggest blowout (only #1) — per season
  const blows = biggestBlowoutsFromMatchups(matchups, 1);
  if (blows.length){
    const b = blows[0];
    stats.push(["Biggest Ass-Whooping",
      `W${b.week}: ${b.winner} over ${b.loser} by ${fmt(b.margin)} (${fmt(b.home_score)}–${fmt(b.away_score)})`
    ]);
  }

  for(const [k,v] of stats) wrap.appendChild(el("div",{class:"stat"}, el("h3",{},k), el("p",{}, String(v))));
}

function renderTeams(teams){
  const wrap = document.getElementById("teamsWrap"); wrap.innerHTML="";
  if(!teams.length){ wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"}, "No teams found."))); return; }
  const tbl = el("table",{},
    el("thead",{}, el("tr",{}, el("th",{},"Team/Manager"), el("th",{},"Record"), el("th",{},"Points For"),
      el("th",{},"Points Against"), el("th",{},"In-Season Rank"), el("th",{},"Final Rank"))),
    el("tbody",{})
  );
  teams.forEach(t=>{
    const owner = canonicalOwner(t.owner || t.team_name);
    tbl.tBodies[0].appendChild(el("tr",{},
      el("td",{}, `${t.team_name}${owner?` (${owner})`:""}`),
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
  const wrap = document.getElementById("matchupsWrap"); wrap.innerHTML="";
  const weekSel = document.getElementById("weekFilter");
  const search = document.getElementById("matchupSearch");
  const weeks = [...new Set((matchups||[]).map(m=>m.week))].sort((a,b)=>a-b);
  weekSel.innerHTML=""; weekSel.appendChild(el("option",{value:""},"All Weeks"));
  weeks.forEach(w=> weekSel.appendChild(el("option",{value:w}, `Week ${w}`)));
  if(!matchups.length){ wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"}, "No matchups found."))); return; }
  const tbl = el("table",{},
    el("thead",{}, el("tr",{}, el("th",{},"Week"), el("th",{},"Home Team"), el("th",{},"Home Score"),
      el("th",{},"Away Team"), el("th",{},"Away Score"), el("th",{},"Type"))),
    el("tbody",{})
  );
  function row(m){
    return el("tr",{}, el("td",{}, fmt(m.week)), el("td",{}, fmt(m.home_team)), el("td",{}, fmt(m.home_score)),
      el("td",{}, fmt(m.away_team)), el("td",{}, fmt(m.away_score)),
      el("td",{}, m.is_playoff ? el("span",{class:"badge"},"Playoff") : ""));
  }
  function apply(){
    const wk=weekSel.value; const q=search.value.trim().toLowerCase();
    tbl.tBodies[0].innerHTML="";
    matchups
      .filter(m => !wk || String(m.week)===wk)
      .filter(m => !q || [m.home_team,m.away_team].some(n => String(n||"").toLowerCase().includes(q)))
      .forEach(m => tbl.tBodies[0].appendChild(row(m)));
  }
  weekSel.onchange=apply; search.oninput=apply; apply();
  wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

function renderTransactions(txns){
  const wrap = document.getElementById("txnsWrap"); wrap.innerHTML="";
  const search = document.getElementById("txnSearch");
  const hasAny = Array.isArray(txns) && txns.length>0;
  const flatten = tx => (tx.entries||[]).map(e=>({date:tx.date||"", ...e}));
  const rows = hasAny ? txns.flatMap(flatten) : [];
  if(!rows.length){ wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"}, "No transactions available for this season."))); return; }
  const tbl = el("table",{},
    el("thead",{}, el("tr",{}, el("th",{},"Date"), el("th",{},"Type"), el("th",{},"Team"), el("th",{},"Player"), el("th",{},"FAAB"))),
    el("tbody",{})
  );
  function apply(){
    const q = search.value.trim().toLowerCase();
    const body = tbl.tBodies[0]; body.innerHTML="";
    rows
      .filter(r => !q || [r.type,r.team,r.player].some(v=> String(v||"").toLowerCase().includes(q)))
      .forEach(r => body.appendChild(el("tr",{}, el("td",{}, fmt(r.date)), el("td",{}, fmt(r.type)),
        el("td",{}, fmt(r.team)), el("td",{}, fmt(r.player)), el("td",{}, fmt(r.faab)))));
  }
  search.oninput=apply; apply(); wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

function renderDraft(draft){
  const wrap = document.getElementById("draftWrap"); wrap.innerHTML="";
  const search = document.getElementById("draftSearch");
  if(!draft.length){ wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"}, "No draft data."))); return; }
  const tbl = el("table",{},
    el("thead",{}, el("tr",{}, el("th",{},"Round"), el("th",{},"Pick"), el("th",{},"Team"),
      el("th",{},"Player"), el("th",{},"NFL Team"), el("th",{},"Keeper"))),
    el("tbody",{})
  );
  function apply(){
    const q = search.value.trim().toLowerCase();
    tbl.tBodies[0].innerHTML="";
    draft
      .filter(d => !q || [d.team,d.player,d.player_nfl].some(v=> String(v||"").toLowerCase().includes(q)))
      .forEach(d => tbl.tBodies[0].appendChild(el("tr",{}, el("td",{}, fmt(d.round)), el("td",{}, fmt(d.overall)),
        el("td",{}, fmt(d.team)), el("td",{}, fmt(d.player)), el("td",{}, fmt(d.player_nfl)), el("td",{}, d.keeper ? "Yes" : ""))));
  }
  search.oninput=apply; apply(); wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

function renderFatal(e){
  console.error(e);
  const pre = el("pre",{}, String(e));
  document.getElementById("content").prepend(el("div",{class:"panel"}, pre));
}

// ---------- Members panel ----------
function teamOwnerMap(season){
  const m = new Map();
  (season.teams||[]).forEach(t=>{
    const raw = (t.owner ?? t.team_name ?? "").toString().trim();
    m.set(t.team_name, canonicalOwner(raw));
  });
  return m;
}

function memberBiggestBlowout(owner, seasons){
  let best = null; // {season, week, myTeam, oppTeam, myScore, oppScore, margin}
  for (const s of seasons||[]){
    const own = teamOwnerMap(s);
    for (const m of (s.matchups||[])){
      if (is2025FutureZeroZero(s,m)) continue;
      const h = Number(m.home_score||0), a = Number(m.away_score||0);
      if (h===0 || a===0) continue;
      const homeOwner = own.get(m.home_team);
      const awayOwner = own.get(m.away_team);

      if (homeOwner===owner && h>a){
        const margin = h-a;
        if (!best || margin>best.margin) best = {season:Number(s.year), week:m.week, myTeam:m.home_team, oppTeam:m.away_team, myScore:h, oppScore:a, margin};
      }
      if (awayOwner===owner && a>h){
        const margin = a-h;
        if (!best || margin>best.margin) best = {season:Number(s.year), week:m.week, myTeam:m.away_team, oppTeam:m.home_team, myScore:a, oppScore:h, margin};
      }
    }
  }
  return best;
}

function renderMemberSummary(owner){
  const wrap = document.getElementById("memberSummary");
  const tableWrap = document.getElementById("memberTableWrap");
  tableWrap.style.display = "none";
  wrap.style.display = "";
  wrap.innerHTML = "";

  const s = aggregateMember(owner, ALL_SEASONS);
  if(!s) return;

  const stats = [
    ["Member", owner],
    ["Record", `${s.wins}-${s.losses}${s.ties?`-${s.ties}`:""}`],
    ["Win %", (s.winPct*100).toFixed(1) + "%"],
    ["Championships", s.champs],
    ["Games", s.games],
    ["Most points (single game)", fmt(s.most)],
    ["Least points (single game)", fmt(s.least)]
  ];
  for (const [k,v] of stats){
    wrap.appendChild(el("div",{class:"stat"}, el("h3",{},k), el("p",{}, String(v))));
  }

  const bw = memberBiggestBlowout(owner, ALL_SEASONS);
  if (bw){
    wrap.appendChild(
      el("div",{class:"stat"},
        el("h3",{},"Biggest blowout (all years)"),
        el("p",{}, `Δ${fmt(bw.margin)} — ${bw.myTeam} over ${bw.oppTeam} ${fmt(bw.myScore)}–${fmt(bw.oppScore)} (Y${bw.season} W${bw.week})`)
      )
    );
  }
}

function renderAllMembersTable(){
  const wrap = document.getElementById("memberSummary");
  const tableWrap = document.getElementById("memberTableWrap");
  wrap.style.display = "none";
  tableWrap.style.display = "";

  const owners = collectOwners(ALL_SEASONS);
  const rows = owners.map(o => ({ member:o, ...aggregateMember(o, ALL_SEASONS) }));
  rows.sort((a,b)=>{
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.wins   !== a.wins)   return b.wins - a.wins;
    if (b.games  !== a.games)  return b.games - a.games;
    return a.member.localeCompare(b.member);
  });
  rows.forEach((r,i)=> r.rank = i+1);

  const tbl = el("table",{},
    el("thead",{}, el("tr",{},
      el("th",{},"Rank"),
      el("th",{},"Member"),
      el("th",{},"W"),
      el("th",{},"L"),
      el("th",{},"T"),
      el("th",{},"Win %"),
      el("th",{},"Champs"),
      el("th",{},"Games"),
      el("th",{},"Most PF (G)"),
      el("th",{},"Least PF (G)"),
      el("th",{},"Best Win Δ"),
      el("th",{},"Best Win (detail)")
    )),
    el("tbody",{})
  );

  rows.forEach(r=>{
    const bw = memberBiggestBlowout(r.member, ALL_SEASONS);
    const bestDelta = bw ? fmt(bw.margin) : "";
    const bestDetail = bw ? `Y${bw.season} W${bw.week}: ${bw.myTeam} over ${bw.oppTeam} ${fmt(bw.myScore)}–${fmt(bw.oppScore)}` : "";
    tbl.tBodies[0].appendChild(el("tr",{},
      el("td",{}, r.rank),
      el("td",{}, r.member),
      el("td",{}, r.wins),
      el("td",{}, r.losses),
      el("td",{}, r.ties),
      el("td",{}, (r.winPct*100).toFixed(1)),
      el("td",{}, r.champs),
      el("td",{}, r.games),
      el("td",{}, fmt(r.most)),
      el("td",{}, fmt(r.least)),
      el("td",{}, bestDelta),
      el("td",{}, bestDetail)
    ));
  });

  tableWrap.innerHTML = "";
  tableWrap.appendChild(tbl);
  attachSort([...tbl.tHead.rows[0].cells], tbl);
}

async function setupMemberSummary(){
  ALL_SEASONS = await loadAllSeasons();

  const owners = collectOwners(ALL_SEASONS);
  const sel = document.getElementById("memberSelect");
  const wrap = document.getElementById("memberSummary");
  const tableWrap = document.getElementById("memberTableWrap");
  if (sel) sel.innerHTML = "";
  if (wrap) wrap.innerHTML = "";
  if (tableWrap) tableWrap.innerHTML = "";

  if (!owners.length) {
    if (wrap){
      wrap.style.display = "";
      if (tableWrap) tableWrap.style.display = "none";
      wrap.appendChild(el("div",{class:"stat"}, el("h3",{},"No members detected"), el("p",{},"Check data/*.json")));
    }
  } else if (sel) {
    const ALL = "__ALL__";
    sel.appendChild(el("option",{value:ALL},"All Members"));
    owners.forEach(o => sel.appendChild(el("option",{value:o}, o)));
    sel.onchange = () => { if (sel.value === ALL) renderAllMembersTable(); else renderMemberSummary(sel.value); };
    sel.value = ALL;
    renderAllMembersTable();
  }

  renderMostDrafted();
}

// ---------- Most Drafted (across seasons) ----------
function renderMostDrafted(){
  const wrap = document.getElementById("mostDraftedWrap");
  const search = document.getElementById("mdSearch");
  if (!wrap) return;

  wrap.innerHTML = "";
  const rows = computeMostDrafted(ALL_SEASONS);
  const tbl = el("table",{},
    el("thead",{}, el("tr",{},
      el("th",{},"Player"),
      el("th",{},"Seasons Drafted"),
      el("th",{},"Years")
    )),
    el("tbody",{})
  );

  function draw(){
    const q = (search?.value || "").trim().toLowerCase();
    tbl.tBodies[0].innerHTML = "";
    rows
      .filter(r => !q || r.player.toLowerCase().includes(q))
      .forEach(r => {
        tbl.tBodies[0].appendChild(el("tr",{},
          el("td",{}, r.player),
          el("td",{}, String(r.count)),
          el("td",{}, r.years.join(", "))
        ));
      });
  }
  draw();
  if (search) search.oninput = draw;

  wrap.appendChild(tbl);
  attachSort([...tbl.tHead.rows[0].cells], tbl);
}

// ---------- tabs ----------
function setupTabs(){
  const header = document.querySelector("header");
  const offset = (header?.offsetHeight || 80) + 4;
  const tabs = Array.from(document.querySelectorAll(".tabs .tab"));
  const sections = tabs
    .map(a => document.querySelector(a.getAttribute("data-target") || a.getAttribute("href")))
    .filter(Boolean);

  tabs.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const sel = a.getAttribute("data-target") || a.getAttribute("href");
      const elx = document.querySelector(sel);
      if(!elx) return;
      const top = elx.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: "smooth" });
      setActive(a);
    });
  });

  function setActiveTabOnScroll(){
    const y = window.scrollY + offset + 1;
    let current = null;
    for (const sec of sections){
      const top = sec.offsetTop;
      if (top <= y) current = sec;
    }
    if (current){
      const id = "#" + current.id;
      const t = tabs.find(a => (a.getAttribute("data-target")||a.getAttribute("href")) === id);
      if (t) setActive(t);
    }
  }
  function setActive(activeEl){ tabs.forEach(x => x.classList.toggle("active", x === activeEl)); }
  setActive(tabs[0] || null);
  window.addEventListener("scroll", setActiveTabOnScroll, { passive: true });
}

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", () => { setupTabs(); main(); });
