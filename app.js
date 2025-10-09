// ==============================
// Tatnall Legacy — app.js (unified safe schema)
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
  if (n.includes("@")) n = n.split("@")[0];  
  n = n.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(n)) return titleCaseName(n);
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
      // normalize structure
      d.teams = d.teams || [];
      d.matchups = d.matchups || [];
      d.transactions = d.transactions || [];
      d.draft = d.draft || [];
      d.lineups = d.lineups || [];
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

// aggregate across seasons; championships
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
    return { week: m.week, winner, loser, margin, home_team:m.home_team, away_team:m.away_team, home_score:h, away_score:a };
  }).filter(r => r.margin > 0 && r.home_score > 0 && r.away_score > 0);
  rows.sort((a,b)=> b.margin - a.margin);
  return rows.slice(0, limit);
}

function computeMostDrafted(seasons){
  const seen = new Map();
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
    rows.push({ player, count: yearsSet.size, years: [...yearsSet].sort((a,b)=>a-b) });
  }
  rows.sort((a,b)=>(b.count - a.count) || a.player.localeCompare(b.player));
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
    await setupMemberSummary();
  } catch (e){ renderFatal(e); }
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
    // if you add lineup rendering later: renderLineups(data.lineups);
  } catch(e){ renderFatal(e); }
}

// ... [keep the rest of your rendering + member summary functions unchanged] ...

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", () => { setupTabs(); main(); });
