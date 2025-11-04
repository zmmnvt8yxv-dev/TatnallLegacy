// ==============================
// Tatnall Legacy — app.js (unified, robust)
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

// --- Live tab “red dot” logic ---
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
  setInterval(update, 30000);
}

// ---------- player metadata fetch ----------
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
    suffix = ` (${pos}${nfl ? ` - ${nfl}` : ""})`;
  }
  return nm + suffix;
}

// ---------- Owner normalization ----------
function titleCaseName(s) {
  const lowerParticles = new Set(["de","del","da","di","van","von","la","le"]);
  return String(s||"").trim().split(/\s+/).map((w,i)=>{
    const wl = w.toLowerCase();
    if(i>0 && lowerParticles.has(wl)) return wl;
    return wl.charAt(0).toUpperCase()+wl.slice(1);
  }).join(" ");
}

const OWNER_ALIASES = {
  "carl marvin":"Carl Marvin", "cmarvin713":"Carl Marvin",
  // … keep all your existing aliases …
};
function canonicalOwner(raw){
  if (raw===null||raw===undefined) return "";
  let n = String(raw).trim();
  if (!n) return "";
  if (n.includes("@")) n = n.split("@")[0];
  n = n.replace(/[._]+/g," ").replace(/\s+/g," ").trim();
  const key = n.toLowerCase();
  if (OWNER_ALIASES[key]) return OWNER_ALIASES[key];
  if (/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(n)) return titleCaseName(n);
  return n;
}

// ---------- Sleeper live scoreboard fetch logic ----------
const SLEEPER_LEAGUE_ID = "1262418074540195841";
const LIVE_POLL_MS = 20000;

async function fetchJSONnolag(url){
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
async function getSleeperLiveBundle(leagueId){
  const state = await fetchJSONnolag("https://api.sleeper.app/v1/state/nfl");
  const week  = Number(state.week || 0);
  const [users, rosters, matchups] = await Promise.all([
    fetchJSONnolag(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetchJSONnolag(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    week ? fetchJSONnolag(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`) : Promise.resolve([])
  ]);
  return { seasonYear: state.season || new Date().getFullYear(), week, users, rosters, matchups };
}
function buildSleeperNameMaps(users, rosters){
  const userById   = new Map(users.map(u=>[u.user_id,u]));
  const rosterById = new Map(rosters.map(r=>[r.roster_id,r]));
  function teamLabelFromRoster(roster){
    if (!roster) return "Unknown";
    const u = userById.get(roster.owner_id) || {};
    const custom = (u.metadata?.team_name || u.metadata?.nickname);
    return custom || u.display_name || `Team ${roster.roster_id}`;
  }
  return { userById, rosterById, teamLabelFromRoster };
}
function groupSleeperMatchups(matchups){
  const g = new Map();
  for (const m of matchups||[]){
    const id = m.matchup_id ?? m.roster_id ?? Math.random();
    if (!g.has(id)) g.set(id,[]);
    g.get(id).push(m);
  }
  return [...g.values()];
}
function totalPointsFromMatchupRow(m){
  const p = Number(m.points ?? 0);
  if (!Number.isNaN(p) && p>0) return p;
  const sp = Array.isArray(m.starters_points) ? m.starters_points.reduce((s,x)=>s+Number(x||0),0) : 0;
  return sp;
}

function renderSleeperLiveOnce(wrap, { week, users, rosters, matchups }){
  wrap.innerHTML = "";
  if (!week){
    wrap.appendChild(el("div",{class:"muted"},"Live unavailable (offseason or pre-week)."));
    setLiveDot(false);
    return;
  }
  if (!Array.isArray(matchups) || matchups.length === 0){
    wrap.appendChild(el("div",{class:"muted"}, `No live data for Week ${week} yet.`));
    setLiveDot(false);
    return;
  }
  const { rosterById, teamLabelFromRoster } = buildSleeperNameMaps(users, rosters);
  const pairs = groupSleeperMatchups(matchups);

  const rows = pairs.map(pair=>{
    const A = pair[0];
    const B = pair[1] || null;
    const rosterA = rosterById.get(A.roster_id);
    const nameA   = teamLabelFromRoster(rosterA);
    const ptsA    = totalPointsFromMatchupRow(A);
    let nameB = "—", ptsB = 0;
    if (B){ const rosterB = rosterById.get(B.roster_id); nameB = teamLabelFromRoster(rosterB); ptsB = totalPointsFromMatchupRow(B); }
    return { matchup_id:A.matchup_id ?? A.roster_id, aTeam:nameA, aPts:ptsA, bTeam:nameB, bPts:ptsB };
  });

  LIVE_CACHE = { week, rows };
  const tbl = el("table",{},
    el("thead",{}, el("tr",{},
      el("th",{},"Week"), el("th",{},"Matchup"), el("th",{},"Team A"), el("th",{},"Pts A"), el("th",{},"Team B"), el("th",{},"Pts B")
    )),
    el("tbody",{})
  );
  rows.forEach(r=>{
    const tr = el("tr",{"data-mid":String(r.matchup_id)},
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

// ---------- data + UI (seasons, teams, matchups, transactions, draft, members) ----------
// [Retain your existing logic here unchanged: loadAllSeasons(), aggregateMember(), renderSummary(), renderTeams(), renderMatchups(), renderTransactions(), renderDraft(), setupMemberSummary(), etc.]


// ---------- tabs logic (internal vs external) ----------
function setupTabs(){
  try {
    const header = document.querySelector("header");
    const offset = (header?.offsetHeight || 80) + 4;
    const tabs = Array.from(document.querySelectorAll("nav.tabs .tab"));
    if (!tabs.length) return;
    const isHash = href => typeof href==="string" && href.startsWith("#");
    const isExternal = a => a.hasAttribute("data-external") || !isHash(a.getAttribute("href"));

    tabs.forEach(a=>{
      a.addEventListener("click",(e)=>{
        if (isExternal(a)) return;
        if (e.metaKey || e.ctrlKey || e.button===1) return;
        e.preventDefault();
        const hash = a.getAttribute("href");
        const target = hash && document.querySelector(hash);
        if (!target) return;
        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior:"smooth" });
        tabs.forEach(x=>x.classList.toggle("active", x===a));
        history.replaceState(null,"",hash);
      });
    });

    const sections = tabs
      .map(a => isExternal(a) ? null : document.querySelector(a.getAttribute("href")))
      .filter(Boolean);

    function setActiveOnScroll(){
      const y = window.scrollY + offset + 1;
      let current = sections[0] || null;
      for (const sec of sections){ if (sec.offsetTop <= y) current = sec; }
      const activeHash = current ? "#" + current.id : null;
      tabs.forEach(a => a.classList.toggle("active", a.getAttribute("href") === activeHash));
    }
    setActiveOnScroll();
    window.addEventListener("scroll", setActiveOnScroll, { passive:true });
  } catch(err){
    console.error("setupTabs failed:", err);
  }
}

// ---------- live route handler ----------
function liveRouteHandler(){
  const hash = String(location.hash || "");
  const mm = hash.match(/^#\/?live\/m\/(\d+)/i) || hash.match(/^#live\/m\/(\d+)/i);
  if (mm){
    const mid = mm[1];
    renderLiveMatchupDetail(mid);
  } else {
    const liveSec   = document.getElementById("live");
    const detailSec = document.getElementById("liveMatchup");
    if (detailSec) detailSec.style.display = "none";
    if (liveSec) liveSec.style.display = "";
  }
}

// ---------- boot sequence ----------
document.addEventListener("DOMContentLoaded",()=>{
  Promise.resolve()
    .then(()=> main())               // your main() triggers season load, members, etc.
    .catch(err=>console.error(err))
    .finally(()=>{
      setupTabs();
      startLiveDotClock();
      liveRouteHandler();
    });
});
