// ==============================
// Tatnall Legacy — app.js (unified safe schema, fixed)
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

// --- Live tab red dot (schedule-based) ---
function setLiveDot(on){
  const dot = document.getElementById("liveDot");
  if (dot){
    dot.classList.toggle("on", !!on);
    dot.setAttribute("aria-label", on ? "Live games in progress" : "No live games");
  }
}
function nowInEastern(){
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function fourthThursdayOfNovember(year){
  for (let d = 22; d <= 28; d++){
    const t = new Date(year, 10, d, 12, 0, 0);
    if (t.getDay() === 4) return d;
  }
  return 26;
}
function isThanksgiving(dt){
  return dt.getMonth() === 10 && dt.getDate() === fourthThursdayOfNovember(dt.getFullYear());
}
function isNflWindowNowEastern(){
  const dt = nowInEastern();
  const dow = dt.getDay();
  const mins = dt.getHours()*60 + dt.getMinutes();
  const inRange = (h1,m1,h2,m2) => mins >= h1*60+m1 && mins <= h2*60+m2;
  if (dow === 4){ if (isThanksgiving(dt)) return inRange(12,0,22,0); return inRange(20,30,23,0); }
  if (dow === 0){ return inRange(13,0,23,0); }
  if (dow === 1){ return inRange(20,30,23,0); }
  return false;
}
function startLiveDotClock(){
  const update = () => setLiveDot(isNflWindowNowEastern());
  update();
  setInterval(update, 30_000);
}

// Keep the most recent live bundle in memory so detail view is instant
let LIVE_CACHE = null;

// Try to fetch weekly projections (best-effort).
async function tryFetchSleeperProjections(year, week){
  try{
    const url = `https://api.sleeper.app/projections/nfl/regular/${year}/${week}`;
    const r = await fetch(url, { cache: "no-store" });
    if(!r.ok) throw new Error("no projections");
    const arr = await r.json();
    const map = new Map();
    for(const row of arr || []){
      const pid = row.player_id || row.player?.player_id || row.id;
      const proj = Number(row.fp ?? row.fpts ?? row.proj ?? row.points ?? 0);
      if (pid) map.set(String(pid), proj);
    }
    return map;
  }catch(_){ return new Map(); }
}

// Fetch player metadata and cache
let SLEEPER_PLAYERS = null;
async function getSleeperPlayers(){
  if (SLEEPER_PLAYERS) return SLEEPER_PLAYERS;
  const r = await fetch("https://api.sleeper.app/v1/players/nfl", { cache: "force-cache" });
  const json = await r.json();
  SLEEPER_PLAYERS = json || {};
  return SLEEPER_PLAYERS;
}
function nameOfPlayer(pid, players){
  const p = players?.[pid];
  return p?.full_name || (p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : (p?.last_name || pid));
}
function labelOfPlayer(pid, players){
  const p = players?.[pid];
  const pos = p?.position || "";
  const nfl = p?.team || p?.active_team || "";
  const nm  = nameOfPlayer(pid, players);

  let suffix = "";
  if (pos){
    // use simple hyphen-minus to avoid any odd unicode in some editors
    suffix = ` (${pos}${nfl ? ` - ${nfl}` : ""})`;
  }
  return nm + suffix;
}

// ---------- Owner normalization ----------
function titleCaseName(s) {
  const lowerParticles = new Set(["de", "del", "da", "di", "van", "von", "la", "le"]);
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const wl = w.toLowerCase();
      if (i > 0 && lowerParticles.has(wl)) return wl;
      return wl.charAt(0).toUpperCase() + wl.slice(1);
    })
    .join(" ");
}

// ---------- Sleeper Live Scoreboard ----------
const SLEEPER_LEAGUE_ID = "1262418074540195841";   // ← put your real league ID here
const LIVE_POLL_MS = 20000;

async function fetchJSONnolag(url){
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
async function sleeperFetch(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`Sleeper HTTP ${r.status} for ${url}`);
  return r.json();
}
async function getSleeperLiveBundle(leagueId){
  const state = await fetchJSONnolag("https://api.sleeper.app/v1/state/nfl");
  const week = Number(state.week || 0);
  const [users, rosters, matchups] = await Promise.all([
    fetchJSONnolag(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJSONnolag(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    week ? fetchJSONnolag(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`) : Promise.resolve([])
  ]);
  return { week, users, rosters, matchups };
}
async function getFullSleeperLiveBundle(leagueId){
  const state = await sleeperFetch("https://api.sleeper.app/v1/state/nfl");
  const week  = Number(state.week || 0);
  const seasonYear = Number(state.season || new Date().getFullYear());
  const [users, rosters, matchups] = await Promise.all([
    sleeperFetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    sleeperFetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    week ? sleeperFetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`) : Promise.resolve([])
  ]);
  return { seasonYear, week, users, rosters, matchups };
}
function buildSleeperNameMaps(users, rosters){
  const userById = new Map(users.map(u => [u.user_id, u]));
  const rosterById = new Map(rosters.map(r => [r.roster_id, r]));
  function teamLabelFromRoster(roster){
    if (!roster) return "Unknown";
    const u = userById.get(roster.owner_id) || {};
    const nick = (u.metadata && (u.metadata.team_name || u.metadata.nickname)) || u.display_name;
    return nick || `Team ${roster.roster_id}`;
  }
  return { userById, rosterById, teamLabelFromRoster };
}
function groupSleeperMatchups(matchups){
  const g = new Map();
  for (const m of matchups || []){
    const id = m.matchup_id ?? m.roster_id ?? Math.random();
    if (!g.has(id)) g.set(id, []);
    g.get(id).push(m);
  }
  return [...g.values()];
}
function totalPointsFromMatchupRow(m){
  const p = Number(m.points ?? 0);
  if (!Number.isNaN(p) && p > 0) return p;
  const sp = Array.isArray(m.starters_points) ? m.starters_points.reduce((s,x)=>s+Number(x||0),0) : 0;
  return Number(sp || 0);
}

function renderSleeperLiveOnce(wrap, { week, users, rosters, matchups }){
  wrap.innerHTML = "";

  if (!week){
    wrap.appendChild(el("div",{class:"muted"}, "Live unavailable (offseason or pre-week)."));
    return;
  }
  if (!Array.isArray(matchups) || !matchups.length){
    wrap.appendChild(el("div",{class:"muted"}, `No live data for Week ${week} yet.`));
    return;
  }

  const { rosterById, teamLabelFromRoster } = buildSleeperNameMaps(users, rosters);
  const pairs = groupSleeperMatchups(matchups);

  const rows = [];
  for (const pair of pairs){
    const A = pair[0];
    const B = pair[1] || null;

    const rosterA = rosterById.get(A?.roster_id);
    const nameA = teamLabelFromRoster(rosterA);
    const ptsA  = totalPointsFromMatchupRow(A);

    let nameB = "—", ptsB = 0;
    if (B){
      const rosterB = rosterById.get(B.roster_id);
      nameB = teamLabelFromRoster(rosterB);
      ptsB  = totalPointsFromMatchupRow(B);
    }

    rows.push({
      matchup_id: A?.matchup_id ?? A?.roster_id ?? Math.random(),
      aTeam: nameA, aPts: ptsA,
      bTeam: nameB, bPts: ptsB
    });
  }

  LIVE_CACHE = { week, rows };

  const tbl = el("table",{},
    el("thead",{}, el("tr",{},
      el("th",{},"Week"),
      el("th",{},"Matchup"),
      el("th",{},"Team A"),
      el("th",{},"Pts A"),
      el("th",{},"Team B"),
      el("th",{},"Pts B")
    )),
    el("tbody",{})
  );

  rows.forEach(r=>{
    const tr = el("tr",{"data-mid": String(r.matchup_id)},
      el("td",{}, String(week)),
      el("td",{}, el("a",{href:`#live/m/${r.matchup_id}`}, `#${r.matchup_id}`)),
      el("td",{}, r.aTeam),
      el("td",{}, fmt(r.aPts)),
      el("td",{}, r.bTeam),
      el("td",{}, fmt(r.bPts))
    );
    tbl.tBodies[0].appendChild(tr);
  });

  wrap.appendChild(tbl);
}

// ---------- all-years / members / draft (unchanged from your version) ----------
const OWNER_ALIASES = {
  "carl marvin": "Carl Marvin","cmarvin713": "Carl Marvin","sdmarvin713": "Carl Marvin","stephen marvin": "Carl Marvin",
  "conner malley": "Conner Malley","conner27lax": "Conner Malley","connerandfinn": "Conner Malley",
  "jared duncan": "Jared Duncan","jawnwick13": "Jared Duncan","jdunca5228572": "Jared Duncan",
  "jeff crossland": "Jeff Crossland","jeffrey crossland": "Jeff Crossland","jefe6700": "Jeff Crossland","junktion": "Jeff Crossland",
  "john downs": "John Downs","john downs123": "John Downs","downsliquidity": "John Downs",
  "roy lee": "Roy Lee","roylee6": "Roy Lee","espn92085473": "Roy Lee",
  "edward saad": "Edward Saad","edward3864": "Edward Saad","phillyphilly709": "Edward Saad",
  "jalen del rosario": "Jalen Del Rosario","jalendelrosario": "Jalen Del Rosario","jalendelrosario@comcast.net": "Jalen Del Rosario",
  "jack sheehy": "Jackie Sheehy","jksheehy": "Jackie Sheehy",
  "samuel kirby": "Samuel Kirby","lbmbets": "Samuel Kirby",
  "max hardin": "Max Hardin","mhardi5674696": "Max Hardin",
  "matt maloy": "Matt Maloy","mattmaloy99": "Matt Maloy",
  "brendan hanrahan": "Brendan Hanrahan","bhanrahan7": "Brendan Hanrahan"
};
function canonicalOwner(raw){ if (raw===null||raw===undefined) return ""; if (typeof raw!=="string"){const guess=raw.name||raw.nickname||raw.display_name||raw.team_name||raw.owner||""; if (typeof guess!=="string") return ""; raw=guess;}
  let n=raw.trim(); if(!n) return ""; if(n.includes("@")) n=n.split("@")[0]; n=n.replace(/[._]+/g," ").replace(/\s+/g," ").trim();
  const key=n.toLowerCase(); if (OWNER_ALIASES[key]) return OWNER_ALIASES[key]; if (/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(n)) return titleCaseName(n); return n;}
function collectOwners(seasons){ const owners=new Set(); for(const s of seasons||[]){ for(const t of s.teams||[]){ const raw=(t.owner??t.team_name??""); const canon=canonicalOwner(raw); if(canon) owners.add(canon);} }
  return [...owners].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"})); }

let ALL_SEASONS = null;
async function loadAllSeasons(){
  const m = await loadJSON("manifest.json");
  const years = m.years || [];
  const seasons = [];
  for (const y of years) {
    try {
      const d = await loadJSON(`data/${y}.json`);
      if (typeof d.year !== "number") d.year = Number(y);
      d.teams = d.teams || []; d.matchups = d.matchups || []; d.transactions = d.transactions || [];
      d.draft = d.draft || []; d.lineups = d.lineups || [];
      seasons.push(d);
    } catch (err) { console.warn("Skipping season:", y, err); }
  }
  return seasons;
}
function is2025FutureZeroZero(season, m){
  return Number(season.year)===2025 && Number(m.home_score||0)===0 && Number(m.away_score||0)===0;
}
function aggregateMember(owner, seasons){
  let wins=0, losses=0, ties=0, games=0; let most=-Infinity, least=Infinity; let champs=0;
  for(const s of seasons){ const ownerByTeam=new Map(); (s.teams||[]).forEach(t=>{ const raw=(t.owner??t.team_name??""); ownerByTeam.set(t.team_name, canonicalOwner(raw)); });
    const champTeam=(s.teams||[]).find(t=>t.final_rank===1); if (champTeam){ const raw=(champTeam.owner??champTeam.team_name??""); if (canonicalOwner(raw)===owner) champs++; }
    for(const m of (s.matchups||[])){ if(is2025FutureZeroZero(s,m)) continue; const hPts=Number(m.home_score||0), aPts=Number(m.away_score||0);
      if(m.home_team && ownerByTeam.get(m.home_team)===owner){ games++; if(hPts>aPts) wins++; else if(hPts<aPts) losses++; else ties++; if(hPts>most) most=hPts; if(hPts<least) least=hPts; }
      if(m.away_team && ownerByTeam.get(m.away_team)===owner){ games++; if(aPts>hPts) wins++; else if(aPts<hPts) losses++; else ties++; if(aPts>most) most=aPts; if(aPts<least) least=aPts; } } }
  if(games===0){ most=null; least=null; } const winPct=games? Math.round((wins+ties*0.5)/games*1000)/1000 : 0;
  return {wins, losses, ties, games, winPct, most, least, champs};
}
function biggestBlowoutsFromMatchups(matchups, limit=3){
  const rows=(matchups||[]).map(m=>{ const h=Number(m.home_score||0), a=Number(m.away_score||0); const margin=Math.abs(h-a);
    const winner=h>a?m.home_team:(a>h?m.away_team:null); const loser=h>a?m.away_team:(a>h?m.home_team:null);
    return { week:m.week, winner, loser, margin, home_team:m.home_team, away_team:m.away_team, home_score:h, away_score:a };
  }).filter(r=>r.margin>0 && r.home_score>0 && r.away_score>0);
  rows.sort((a,b)=> b.margin-a.margin); return rows.slice(0,limit);
}
function computeMostDrafted(seasons){
  const seen=new Map();
  for(const s of seasons||[]){ const y=Number(s.year); for(const p of (s.draft||[])){ const name=String(p.player||"").trim(); if(!name) continue;
      if(!seen.has(name)) seen.set(name, new Set()); seen.get(name).add(y); } }
  const rows=[]; for(const [player, yearsSet] of seen.entries()){ rows.push({ player, count: yearsSet.size, years: [...yearsSet].sort((a,b)=>a-b) }); }
  rows.sort((a,b)=>(b.count-a.count)||a.player.localeCompare(b.player)); return rows;
}
function mostPointsByPlayerForTeam(lineups, teamFilter=null){
  if(!Array.isArray(lineups)) return null;
  const rows=teamFilter? lineups.filter(r=>r.started && r.team===teamFilter) : lineups.filter(r=>r.started);
  if(!rows.length) return null; rows.sort((a,b)=> Number(b.points||0)-Number(a.points||0)); return rows[0];
}
function mostStartedPlayerByTeam(lineups, teamFilter=null){
  if(!Array.isArray(lineups)) return teamFilter? null : [];
  const rows=teamFilter? lineups.filter(r=>r.started && r.team===teamFilter) : lineups.filter(r=>r.started);
  const counts=new Map(); for(const r of rows){ const key=`${r.team}||${r.player}`; if(!counts.has(key)) counts.set(key,{team:r.team, player:r.player, starts:0}); counts.get(key).starts++; }
  const out=[...counts.values()]; out.sort((a,b)=> b.starts-a.starts || a.team.localeCompare(b.team) || a.player.localeCompare(b.player)); return teamFilter? (out[0]||null) : out;
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
    await setupMemberSummary();
    initSleeperLive();
  } catch (e){ console.error(e); }
}

async function renderSeason(year){
  try{
    const data = await loadJSON(`data/${year}.json`);
    data.teams = data.teams||[]; data.matchups=data.matchups||[];
    data.transactions=data.transactions||[]; data.draft=data.draft||[]; data.lineups=data.lineups||[];
    renderSummary(year, data);
    renderTeams(data.teams);
    renderMatchups(data.matchups);
    renderTransactions(data.transactions);
    renderDraft(data.draft);
  } catch(e){ console.error(e); }
}

function renderSummary(year, data){
  const wrap = document.getElementById("summaryStats");
  wrap.innerHTML = "";

  const teams = data.teams || [];
  const matchups = data.matchups || [];
  const draft = data.draft || [];
  const txns = data.transactions || [];

  const champ = teams.find(t => t.final_rank === 1)?.team_name || "—";
  const bestPF = teams.slice().sort((a,b)=> (b.points_for||0)-(a.points_for||0))[0];
  const bestPA = teams.slice().sort((a,b)=> (a.points_against||0)-(b.points_against||0))[0];
  const avgPF = teams.length ? (teams.reduce((s,t)=>s+(t.points_for||0),0)/teams.length) : 0;

  const stats = [
    ["Season", year],
    ["Champion", champ],
    ["Top Points For", bestPF ? `${bestPF.team_name} (${fmt(bestPF.points_for)})` : "—"],
    ["Lowest Points Against", bestPA ? `${bestPA.team_name} (${fmt(bestPA.points_against)})` : "—"],
    ["Average PF / Team", fmt(avgPF)],
    ["Games Recorded", matchups.length],
    ["Draft Picks", draft.length],
    ["Transactions", txns.length]
  ];

  if (Array.isArray(data.lineups) && data.lineups.length){
    const bestP = mostPointsByPlayerForTeam(data.lineups, null);
    if (bestP) stats.push(["Most Points (player, single game)", `${bestP.player} — ${fmt(bestP.points)} for ${bestP.team} (W${bestP.week})`]);
    const mostStarted = mostStartedPlayerByTeam(data.lineups, null);
    if (mostStarted.length){ const top = mostStarted[0]; stats.push(["Most Started (league)", `${top.player} — ${top.starts} starts (top team: ${top.team})`]); }
  }

  const blows = biggestBlowoutsFromMatchups(matchups, 1);
  if (blows.length){
    const b = blows[0];
    stats.push(["Biggest Ass-Whooping", `W${b.week}: ${b.winner} over ${b.loser} by ${fmt(b.margin)} (${fmt(b.home_score)}–${fmt(b.away_score)})`]);
  }

  for (const [k, v] of stats){
    wrap.appendChild(el("div",{class:"stat"}, el("h3",{},k), el("p",{}, String(v))));
  }
}

function renderTeams(teams){
  const wrap = document.getElementById("teamsWrap"); wrap.innerHTML="";
  if(!teams.length){
    wrap.appendChild(el("div",{style:"padding:12px; color:#9ca3af;"},"No teams found."));
    return;
  }
  const grid = el("div",{class:"record-grid"});
  const parseRecord = (record) => {
    const parts = String(record ?? "").split("-").map((v)=>Number.parseInt(v, 10)).filter((v)=>Number.isFinite(v));
    const wins = parts[0] ?? 0;
    const losses = parts[1] ?? 0;
    const ties = parts[2] ?? 0;
    const games = wins + losses + ties;
    const winPct = games ? (wins + ties * 0.5) / games : 0;
    const recordDisplay = [wins, losses, ties].filter((v,i)=>v || i < 2).join("-");
    return { wins, losses, ties, winPct, recordDisplay };
  };
  teams.forEach(t=>{
    const owner = canonicalOwner(t.owner || t.team_name);
    const { winPct, recordDisplay } = parseRecord(t.record);
    const winPctText = `${(winPct * 100).toFixed(1)}%`;
    const winClass = winPct >= 0.6 ? "win-pill win-pill--good" : winPct >= 0.5 ? "win-pill win-pill--mid" : "win-pill win-pill--bad";
    const inSeason = fmt(t.regular_season_rank) || "—";
    const finalRank = fmt(t.final_rank) || "—";
    const card = el("div",{class:"record-card"},
      el("div",{class:"record-card__header"},
        el("div",{class:"record-card__team"}, t.team_name),
        owner ? el("div",{class:"record-card__owner"}, owner) : ""
      ),
      el("div",{class:"record-card__body"},
        el("div",{class:"record-card__row"},
          el("span",{class:"record-card__label"},"Record"),
          el("span",{class:"record-card__value"},
            el("span",{}, recordDisplay),
            el("span",{class:winClass}, winPctText)
          )
        ),
        el("div",{class:"record-card__row"},
          el("span",{class:"record-card__label"},"Points For/Against"),
          el("span",{class:"record-card__value"}, `${fmt(t.points_for)} / ${fmt(t.points_against)}`)
        ),
        el("div",{class:"record-card__badges"},
          el("span",{class:"badge"}, `In-Season ${inSeason}`),
          el("span",{class:"badge"}, `Final ${finalRank}`)
        )
      )
    );
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
}

function renderMatchups(matchups){
  const wrap = document.getElementById("matchupsWrap"); wrap.innerHTML="";
  const weekSel = document.getElementById("weekFilter");
  const search = document.getElementById("matchupSearch");
  const weeks = [...new Set((matchups||[]).map(m=>m.week))].sort((a,b)=>a-b);
  weekSel.innerHTML=""; weekSel.appendChild(el("option",{value:""},"All Weeks"));
  weeks.forEach(w=> weekSel.appendChild(el("option",{value:w}, `Week ${w}`)));
  if(!matchups.length){
    wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"},"No matchups found.")));
    return;
  }
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
  if(!rows.length){
    wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"},"No transactions available for this season.")));
    return;
  }
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
  if(!draft.length){
    wrap.appendChild(el("div",{class:"tablewrap"}, el("div",{style:"padding:12px; color:#9ca3af;"},"No draft data.")));
    return;
  }
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

// ---------- Members panel (unchanged helpers + renderers) ----------
function teamOwnerMap(season){
  const m = new Map();
  (season.teams||[]).forEach(t=>{
    const raw = (t.owner ?? t.team_name ?? "");
    m.set(t.team_name, canonicalOwner(raw));
  });
  return m;
}
function memberBiggestBlowout(owner, seasons){
  let best = null;
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
  tableWrap.style.display = "none"; wrap.style.display = ""; wrap.innerHTML = "";
  const s = aggregateMember(owner, ALL_SEASONS); if(!s) return;
  const stats = [
    ["Member", owner], ["Record", `${s.wins}-${s.losses}${s.ties?`-${s.ties}`:""}`],
    ["Win %", (s.winPct*100).toFixed(1) + "%"], ["Championships", s.champs], ["Games", s.games],
    ["Most points (single game)", fmt(s.most)], ["Least points (single game)", fmt(s.least)]
  ];
  for (const [k,v] of stats){ wrap.appendChild(el("div",{class:"stat"}, el("h3",{},k), el("p",{}, String(v)))); }
  const bw = memberBiggestBlowout(owner, ALL_SEASONS);
  if (bw){ wrap.appendChild(el("div",{class:"stat"}, el("h3",{},"Biggest blowout (all years)"),
      el("p",{}, `Δ${fmt(bw.margin)} — ${bw.myTeam} over ${bw.oppTeam} ${fmt(bw.myScore)}–${fmt(bw.oppScore)} (Y${bw.season} W${bw.week})`))); }
}
function renderAllMembersTable(){
  const wrap = document.getElementById("memberSummary");
  const tableWrap = document.getElementById("memberTableWrap");
  wrap.style.display = "none"; tableWrap.style.display = "";
  const owners = collectOwners(ALL_SEASONS);
  const rows = owners.map(o => ({ member:o, ...aggregateMember(o, ALL_SEASONS) }));
  rows.sort((a,b)=> (b.winPct-a.winPct) || (b.wins-a.wins) || (b.games-a.games) || a.member.localeCompare(b.member));
  rows.forEach((r,i)=> r.rank = i+1);
  const tbl = el("table",{}, el("thead",{}, el("tr",{},
    el("th",{},"Rank"), el("th",{},"Member"), el("th",{},"W"), el("th",{},"L"), el("th",{},"T"),
    el("th",{},"Win %"), el("th",{},"Champs"), el("th",{},"Games"), el("th",{},"Most PF (G)"),
    el("th",{},"Least PF (G)"), el("th",{},"Best Win Δ"), el("th",{},"Best Win (detail)")
  )), el("tbody",{}));
  rows.forEach(r=>{
    const bw = memberBiggestBlowout(r.member, ALL_SEASONS);
    const bestDelta = bw ? fmt(bw.margin) : "";
    const bestDetail = bw ? `Y${bw.season} W${bw.week}: ${bw.myTeam} over ${bw.oppTeam} ${fmt(bw.myScore)}–${bw.oppScore}` : "";
    tbl.tBodies[0].appendChild(el("tr",{}, el("td",{}, r.rank), el("td",{}, r.member), el("td",{}, r.wins),
      el("td",{}, r.losses), el("td",{}, r.ties), el("td",{}, (r.winPct*100).toFixed(1)), el("td",{}, r.champs),
      el("td",{}, r.games), el("td",{}, fmt(r.most)), el("td",{}, fmt(r.least)), el("td",{}, bestDelta), el("td",{}, bestDetail)));
  });
  tableWrap.innerHTML = ""; tableWrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}
async function setupMemberSummary(){
  ALL_SEASONS = await loadAllSeasons();
  const owners = collectOwners(ALL_SEASONS);
  const sel = document.getElementById("memberSelect");
  const wrap = document.getElementById("memberSummary");
  const tableWrap = document.getElementById("memberTableWrap");
  if (sel) sel.innerHTML = ""; if (wrap) wrap.innerHTML = ""; if (tableWrap) tableWrap.innerHTML = "";
  if (!owners.length){ if (wrap){ wrap.style.display = ""; if (tableWrap) tableWrap.style.display = "none";
    wrap.appendChild(el("div",{class:"stat"}, el("h3",{},"No members detected"), el("p",{},"Check data/*.json"))); } }
  else if (sel){ const ALL = "__ALL__";
    sel.appendChild(el("option",{value:ALL},"All Members"));
    owners.forEach(o => sel.appendChild(el("option",{value:o}, o)));
    sel.onchange = () => { if (sel.value === ALL) renderAllMembersTable(); else renderMemberSummary(sel.value); };
    sel.value = ALL; renderAllMembersTable();
  }
  renderMostDrafted();
}
function computePlayerStartStats(seasons){
  const stats = new Map();
  for (const s of seasons || []){
    const seasonYear = Number(s.year);
    const teams = s.teams || [];
    const lineups = s.lineups || [];
    const ownerByTeam = new Map();
    for (const t of teams){ const rawOwner = (t.owner ?? t.team_name ?? ""); ownerByTeam.set(t.team_name, canonicalOwner(rawOwner)); }
    for (const r of lineups){
      if (!r || !r.started) continue;
      const player = String(r.player || "").trim(); if (!player) continue;
      const pts = Number(r.points || 0); const team = String(r.team || "").trim();
      const ownerFull = ownerByTeam.get(team) || ""; const ownerFirst = ownerFull ? String(ownerFull).split(/\s+/)[0] : "";
      if (!stats.has(player)){ stats.set(player, { starts:0, maxPointsStarted:null, maxPtsSeason:null, maxPtsWeek:null, maxPtsTeam:null, maxPtsOwnerFirst:null, _countsByTeam:new Map(), topTeam:null, topTeamStarts:0 }); }
      const st = stats.get(player); st.starts += 1;
      const prev = st._countsByTeam.get(team) || 0; st._countsByTeam.set(team, prev + 1);
      if (prev + 1 > st.topTeamStarts){ st.topTeamStarts = prev + 1; st.topTeam = team; }
      if (st.maxPointsStarted === null || pts > st.maxPointsStarted){ st.maxPointsStarted = pts; st.maxPtsSeason = seasonYear; st.maxPtsWeek = r.week ?? null; st.maxPtsTeam = team || null; st.maxPtsOwnerFirst = ownerFirst || null; }
    }
  }
  for (const [, v] of stats.entries()){ delete v._countsByTeam; }
  return stats;
}
function renderMostDrafted(){
  const wrap = document.getElementById("mostDraftedWrap");
  const search = document.getElementById("mdSearch");
  if (!wrap) return;
  wrap.innerHTML = "";
  const rows = computeMostDrafted(ALL_SEASONS);
  const startStats = computePlayerStartStats(ALL_SEASONS);
  const tbl = el("table",{}, el("thead",{}, el("tr",{},
    el("th",{},"Player"), el("th",{},"Seasons Drafted"), el("th",{},"Most Pts as Starter"),
    el("th",{},"Times Started"), el("th",{},"Top Team (starts)"), el("th",{},"Years")
  )), el("tbody",{}));
  function draw(){
    const q = (search?.value || "").trim().toLowerCase();
    tbl.tBodies[0].innerHTML = "";
    rows.filter(r => !q || r.player.toLowerCase().includes(q)).forEach(r=>{
      const st = startStats.get(r.player) || { starts:0, maxPointsStarted:null, maxPtsSeason:null, maxPtsWeek:null, maxPtsTeam:null, maxPtsOwnerFirst:null, topTeam:null, topTeamStarts:0 };
      const maxPtsLabel = (st.maxPointsStarted == null) ? "" :
        `${fmt(st.maxPointsStarted)}${st.maxPtsOwnerFirst ? ` (for ${st.maxPtsOwnerFirst}` : ""}${st.maxPtsSeason ? `${st.maxPtsOwnerFirst ? ", " : " ("}${st.maxPtsSeason}` : ""}${st.maxPtsOwnerFirst || st.maxPtsSeason ? ")" : ""}`;
      const topTeamLabel = st.topTeam ? `${st.topTeam} — ${st.topTeamStarts}` : "";
      tbl.tBodies[0].appendChild(el("tr",{}, el("td",{}, r.player), el("td",{}, String(r.count)),
        el("td",{}, maxPtsLabel), el("td",{}, String(st.starts || 0)), el("td",{}, topTeamLabel), el("td",{}, r.years.join(", "))));
    });
  }
  draw(); if (search) search.oninput = draw;
  wrap.appendChild(tbl); attachSort([...tbl.tHead.rows[0].cells], tbl);
}

// ---------- tabs (safe: internal # scroll; external links pass through) ----------
function setupTabs(){
  try {
    const header = document.querySelector("header");
    const offset = (header?.offsetHeight || 80) + 4;

    const tabs = Array.from(document.querySelectorAll("nav.tabs .tab"));
    if (!tabs.length) return;

    const isHash = href => typeof href === "string" && href.startsWith("#");
    const isExternal = a => a.hasAttribute("data-external") || !isHash(a.getAttribute("href"));

    // Intercept only hash tabs
    tabs.forEach(a => {
      a.addEventListener("click", (e) => {
        if (isExternal(a)) return;                       // let trade.html navigate normally
        if (e.metaKey || e.ctrlKey || e.button === 1) return;
        e.preventDefault();

        const hash = a.getAttribute("href") || a.getAttribute("data-target");
        const target = hash && document.querySelector(hash);
        if (!target) return;

        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: "smooth" });
        tabs.forEach(x => x.classList.toggle("active", x === a));
      });
    });

    // Active highlight while scrolling
    const sections = tabs
      .map(a => (isExternal(a) ? null : document.querySelector(a.getAttribute("href"))))
      .filter(Boolean);

    function setActiveOnScroll(){
      const y = window.scrollY + offset + 1;
      let current = null;
      for (const sec of sections){ if (sec.offsetTop <= y) current = sec; }
      const currentHash = current ? ("#" + current.id) : null;
      tabs.forEach(a => a.classList.toggle("active", a.getAttribute("href") === currentHash));
    }

    setActiveOnScroll();
    window.addEventListener("scroll", setActiveOnScroll, { passive: true });
  } catch (err) {
    console.error("setupTabs failed:", err);
  }
}

// ---------- Live: detail route ----------
async function renderLiveMatchupDetail(mid){
  const sec = document.getElementById("liveMatchup");
  const wrap = document.getElementById("liveMatchupWrap");
  const meta = document.getElementById("liveMatchupMeta");
  if (!sec || !wrap) return;

  document.getElementById("live")?.setAttribute("style","display:none;");
  sec.style.display = "";
  wrap.innerHTML = "Loading…";

  try{
    const [bundle, players] = await Promise.all([
      getFullSleeperLiveBundle(String(SLEEPER_LEAGUE_ID)),   // <-- use your configured ID
      getSleeperPlayers()
    ]);
    const { seasonYear, week, users, rosters, matchups } = bundle;

    const userById = new Map((users||[]).map(u => [u.user_id, u]));
    const rosterById = new Map((rosters||[]).map(r => [r.roster_id, r]));

    const byMatchup = new Map();
    for (const m of (matchups||[])){
      const id = m.matchup_id ?? m.roster_id;
      if (!byMatchup.has(id)) byMatchup.set(id, []);
      byMatchup.get(id).push(m);
    }
    const pair = byMatchup.get(Number(mid)) || byMatchup.get(String(mid)) || [];

    if (pair.length === 0){
      wrap.innerHTML = `<div style="padding:12px; color:#9ca3af;">Matchup #${mid} not found for week ${week}.</div>`;
      return;
    }

    const rosterLabel = (roster) => {
      if (!roster) return "—";
      const u = userById.get(roster.owner_id);
      const custom = (u?.metadata?.team_name || u?.metadata?.nickname);
      return custom || u?.display_name || `Roster ${roster.roster_id}`;
    };

    const A = pair[0]; const B = pair[1] || null;
    const rosterA = rosterById.get(A.roster_id);
    const rosterB = B ? rosterById.get(B.roster_id) : null;

    meta.textContent = `Week ${week} • #${mid}: ${rosterLabel(rosterA)} vs ${rosterLabel(rosterB)}`;

    let projMap = new Map();
    try { projMap = await tryFetchSleeperProjections(seasonYear, week); } catch(_) {}

    function sideRows(M){
      const rows = [];
      const starters = Array.isArray(M.starters) ? M.starters : [];
      const spoints  = Array.isArray(M.starters_points) ? M.starters_points : [];
      const pp = M.players_points || {};
      starters.forEach((pid, idx) => {
        if (!pid) return;
        const pts = Number(spoints[idx] ?? pp[pid] ?? 0);
        const proj = projMap.get(String(pid));
        rows.push({ type:"Starter", player_id:pid, label:labelOfPlayer(pid, players), pts, proj:(proj ?? null) });
      });
      for (const [pid, pts] of Object.entries(pp)){
        if (starters.includes(pid)) continue;
        const npts = Number(pts || 0); if (npts === 0) continue;
        const proj = projMap.get(String(pid));
        rows.push({ type:"Bench", player_id:pid, label:labelOfPlayer(pid, players), pts:npts, proj:(proj ?? null) });
      }
      const total = rows.reduce((s,r)=> s + (Number(r.pts) || 0), 0);
      const projTotal = rows.reduce((s,r)=> s + (Number(r.proj) || 0), 0);
      rows.sort((a,b)=> (a.type!==b.type)? (a.type==="Starter"?-1:1) : ((b.pts - a.pts) || a.label.localeCompare(b.label)));
      return { rows, total, projTotal };
    }

    const Aset = sideRows(A);
    const Bset = B ? sideRows(B) : { rows:[], total:0, projTotal:0 };

    const tbl = el("table",{}, el("thead",{}, el("tr",{},
      el("th",{},"Side"), el("th",{},"Player"), el("th",{},"Pts"), el("th",{},"Proj")
    )), el("tbody",{}));

    function addBlock(label, set){
      tbl.tBodies[0].appendChild(el("tr",{class:"subhead"}, el("td",{colSpan:4}, label)));
      set.rows.forEach(r=>{
        tbl.tBodies[0].appendChild(el("tr",{}, el("td",{}, r.type), el("td",{}, r.label), el("td",{}, fmt(r.pts)), el("td",{}, (r.proj==null ? "—" : fmt(r.proj)))));
      });
      tbl.tBodies[0].appendChild(el("tr",{class:"total"}, el("td",{colSpan:2},"Total"), el("td",{}, fmt(set.total)), el("td",{}, set.rows.some(r=>r.proj!=null)? fmt(set.projTotal) : "—")));
    }

    wrap.innerHTML = "";
    addBlock(rosterLabel(rosterA), Aset);
    if (B) addBlock(rosterLabel(rosterB), Bset);
    wrap.appendChild(tbl);
    attachSort([...tbl.tHead.rows[0].cells], tbl);

  } catch (e){
    console.error(e);
    wrap.innerHTML = `<div style="padding:12px; color:#ef4444;">${String(e)}</div>`;
  }
}

// ---------- Live: routing + list ----------
function liveRouteHandler(){
  const hash = String(location.hash || "");
  const mm = hash.match(/^#\/?live\/m\/(\d+)/i) || hash.match(/^#live\/m\/(\d+)/i);
  const liveSec = document.getElementById("live");
  const detail  = document.getElementById("liveMatchup");
  if (mm){
    const mid = mm[1];
    renderLiveMatchupDetail(mid);
  }else{
    if (detail) detail.style.display = "none";
    if (liveSec) liveSec.style.display = "";
  }
}

function renderSleeperLive(leagueId){
  const wrap = document.getElementById("liveWrap");
  if (!wrap) return;

  if (!leagueId){
    wrap.innerHTML = "<div class='muted'>Set your Sleeper league ID in <code>SLEEPER_LEAGUE_ID</code> to enable Live.</div>";
    return;
  }

  wrap.innerHTML = "Loading…";
  getSleeperLiveBundle(String(leagueId))
    .then(({ week, users, rosters, matchups }) => {
      if (!Number(week)){
        wrap.innerHTML = "<div class='muted'>Live unavailable (offseason or pre-week).</div>";
        setLiveDot(false);
        return;
      }
      if (!Array.isArray(matchups) || matchups.length === 0){
        wrap.innerHTML = `<div class='muted'>No live data returned for Week ${week} yet.</div>`;
        setLiveDot(false);
        return;
      }
      renderSleeperLiveOnce(wrap, { week, users, rosters, matchups });
    })
    .catch(err => {
      console.error(err);
      wrap.innerHTML = "<div class='muted'>Unable to load live scoreboard.</div>";
      setLiveDot(false);
    });
}

function initSleeperLive(){
  const wrap = document.getElementById("liveWrap");
  if (!wrap) return;

  if (!SLEEPER_LEAGUE_ID){
    wrap.innerHTML = "<div class='muted'>Set your Sleeper league ID in <code>SLEEPER_LEAGUE_ID</code> to enable Live.</div>";
    return;
  }

  let ticking = false;
  async function tick(){
    if (ticking) return;
    ticking = true;
    try{
      const bundle = await getSleeperLiveBundle(String(SLEEPER_LEAGUE_ID));
      const { week, matchups } = bundle;
      if (!Number(week)){
        wrap.innerHTML = "<div class='muted'>Live unavailable (offseason or pre-week).</div>";
        setLiveDot(false);
      } else {
        renderSleeperLiveOnce(wrap, bundle);
        const isActive = Array.isArray(matchups) && matchups.some(m =>
          Number(m.points || 0) > 0 ||
          (Array.isArray(m.starters_points) && m.starters_points.some(x => Number(x||0) > 0))
        );
        setLiveDot(isActive);
      }
    } catch (err){
      console.error("Live tick failed:", err);
      wrap.innerHTML = "<div class='muted'>Live temporarily unavailable.</div>";
      setLiveDot(false);
    } finally {
      ticking = false;
    }
  }
// First paint immediately, then poll every 20s
tick();
setInterval(tick, LIVE_POLL_MS);
} // <<< CLOSES initSleeperLive()

// Back button
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("#liveBackBtn");
  if (!btn) return;
  e.preventDefault();
  history.replaceState(null, "", "#live");
  liveRouteHandler();
});
window.addEventListener("hashchange", liveRouteHandler, { passive:true });

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", () => {
  // Load data/UI first; tabs and live extras after.
  Promise.resolve()
    .then(() => main())
    .catch(err => console.error(err))
    .finally(() => {
      try { setupTabs(); } catch(e){ console.error(e); }
      startLiveDotClock();
      liveRouteHandler();
    });
});
