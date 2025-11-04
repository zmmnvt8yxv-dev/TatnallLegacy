// trade.js — Trade Analysis standalone page

// ------- helpers -------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = n => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));

// lazy-load html2canvas for PNG export
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ------- state -------
let MANIFEST = null;
let YEAR = null;
let DATA = null;
let TEAM_RID = null; // roster_id
let TEAM_NAME = "";

// ------- boot -------
document.addEventListener("DOMContentLoaded", init);

async function init() {
  MANIFEST = await (await fetch("manifest.json", { cache: "no-store" })).json();
  buildSeasonSelect(MANIFEST.years);
  YEAR = +$("#seasonSelect").value;
  await loadSeason(YEAR);
  bindUI();
}

function buildSeasonSelect(years) {
  const sel = $("#seasonSelect");
  sel.innerHTML = years
    .sort((a,b)=>b-a)
    .map(y => `<option value="${y}" ${y===Math.max(...years)?'selected':''}>${y}</option>`)
    .join("");
}

async function loadSeason(y) {
  YEAR = y;
  DATA = await (await fetch(`data/${y}.json`, { cache: "no-store" })).json();
  buildTeamSelect();
  if (!TEAM_RID) {
    const first = DATA.teams?.[0]?.team_id || Object.keys(DATA.draft_day_roster || {})[0];
    setTeam(+first || 1);
  } else {
    setTeam(TEAM_RID);
  }
  renderAll();
}

// ------- selectors -------
function buildTeamSelect() {
  const sel = $("#teamSelect");
  const options = (DATA.teams || [])
    .map(t => `<option value="${t.team_id}">${escapeHtml(t.team_name || `Roster ${t.team_id}`)}</option>`)
    .join("");
  sel.innerHTML = options;
}

function setTeam(rid) {
  TEAM_RID = +rid;
  const t = (DATA.teams || []).find(x => +x.team_id === +rid);
  TEAM_NAME = t?.team_name || `Roster ${rid}`;
  $("#teamSelect").value = rid;
}

function bindUI() {
  $("#seasonSelect").addEventListener("change", e => loadSeason(+e.target.value));
  $("#teamSelect").addEventListener("change", e => { setTeam(+e.target.value); renderAll(); });
  $("#tradeSearch").addEventListener("input", () => renderTrades());
  $("#saveDraftPng").addEventListener("click", () => savePane("#draftPane", `${YEAR}_${slug(TEAM_NAME)}_draft.png`));
  $("#saveNowPng").addEventListener("click", () => savePane("#nowPane", `${YEAR}_${slug(TEAM_NAME)}_now.png`));
}

// ------- render root -------
function renderAll() {
  renderSummary();
  renderRosters();
  renderTrades();
}

// ------- summary -------
function renderSummary() {
  const rows = tradeRowsForRoster(TEAM_RID);
  const total = rows.length;
  const netSum = rows.reduce((a, r) => a + r.net_points_after, 0);
  const best = rows.reduce((m, r) => r.score_0_to_100 > (m?.score_0_to_100 ?? -1) ? r : m, null);
  const worst = rows.reduce((m, r) => r.score_0_to_100 < (m?.score_0_to_100 ?? 101) ? r : m, null);

  const acq = acquisitionBreakdown(TEAM_RID);
  const grid = $("#taSummary");
  grid.innerHTML = `
    ${stat("Team", escapeHtml(TEAM_NAME))}
    ${stat("Trades", String(total))}
    ${stat("Net Points (all trades)", fmt(netSum))}
    ${stat("Best Trade", best ? `W${best.week} · ${best.score_0_to_100}` : "—")}
    ${stat("Worst Trade", worst ? `W${worst.week} · ${worst.score_0_to_100}` : "—")}
    ${stat("On Roster: Draft", String(acq.draft))}
    ${stat("On Roster: Trade", String(acq.trade))}
    ${stat("On Roster: Waivers/FA", String(acq.waivers + acq.fa))}
  `;
}

function stat(label, value) {
  return `<div class="stat">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value">${value}</div>
  </div>`;
}

// ------- rosters (Draft vs Now) -------
function renderRosters() {
  renderRosterPane($("#draftPane"), TEAM_RID, "draft");
  renderRosterPane($("#nowPane"), TEAM_RID, "now");
}

function renderRosterPane(container, rid, kind) {
  container.innerHTML = "";
  const playerIds = (kind === "draft"
    ? DATA.draft_day_roster?.[String(rid)] || []
    : DATA.current_roster?.[String(rid)] || []);
  const cards = playerIds.map(pid => playerCard(pid, rid, kind));
  for (const c of cards) container.appendChild(c);
}

function playerCard(pid, rid, kind) {
  const p = DATA.player_index?.[pid] || {};
  const div = document.createElement("div");
  div.className = "player-card";
  const acq = DATA.acquisitions?.find(a => a.player_id === pid && +a.roster_id === +rid);
  const chip = kind === "draft" ? "DRAFT" : (acq?.obtained?.method || "").toUpperCase();
  const lineage = formatLineage(acq?.history || []);
  div.innerHTML = `
    <div class="pc-name">${escapeHtml(p.full_name || pid)}</div>
    <div class="pc-meta">${escapeHtml(p.pos || "")} ${p.team ? "· " + escapeHtml(p.team) : ""}</div>
    <div class="pc-chip">${chip || ""}</div>
  `;
  if (lineage) div.title = lineage;
  return div;
}

function formatLineage(hist) {
  if (!hist || !hist.length) return "";
  return hist.map(h => {
    const m = (h.method || "").toUpperCase();
    return h.week ? `${m} (W${h.week})` : m;
  }).join(" → ");
}

function acquisitionBreakdown(rid) {
  const now = DATA.current_roster?.[String(rid)] || [];
  const tally = { draft: 0, trade: 0, waivers: 0, fa: 0 };
  for (const pid of now) {
    const a = DATA.acquisitions?.find(x => x.player_id === pid && +x.roster_id === +rid);
    if (a?.obtained?.method && tally[a.obtained.method] !== undefined) tally[a.obtained.method]++;
  }
  return tally;
}

// ------- trades table -------
function tradeRowsForRoster(rid) {
  const rows = [];
  for (const te of DATA.trade_evals || []) {
    const pr = (te.per_roster || []).find(x => +x.roster_id === +rid);
    if (pr) rows.push({
      week: te.week,
      tx_id: te.tx_id,
      players_in: pr.players_in || [],
      players_out: pr.players_out || [],
      net_points_after: Number(pr.net_points_after || 0),
      score_0_to_100: Number(pr.score_0_to_100 || 50)
    });
  }
  return rows.sort((a,b) => a.week - b.week);
}

function renderTrades() {
  const tbody = ensureTable($("#tradesWrap"), [
    "Week","Players In","Players Out","Net Pts After","Score"
  ]);
  const q = ($("#tradeSearch").value || "").toLowerCase();
  tbody.innerHTML = "";

  const rows = tradeRowsForRoster(TEAM_RID);
  for (const r of rows) {
    const inNames = r.players_in.map(nameOf).join(", ");
    const outNames = r.players_out.map(nameOf).join(", ");
    const hay = `${inNames} ${outNames} W${r.week}`.toLowerCase();
    if (q && !hay.includes(q)) continue;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">W${r.week}</td>
      <td>${escapeHtml(inNames) || "—"}</td>
      <td>${escapeHtml(outNames) || "—"}</td>
      <td class="mono ${r.net_points_after>=0?'pos':'neg'}">${fmt(r.net_points_after)}</td>
      <td>
        <div class="scorebar" aria-label="${r.score_0_to_100}">
          <div class="fill" style="width:${r.score_0_to_100}%"></div>
          <span class="scoretxt">${r.score_0_to_100}</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function nameOf(pid) {
  return DATA.player_index?.[pid]?.full_name || pid;
}

function ensureTable(container, headers) {
  if (!container.firstElementChild) {
    const table = document.createElement("table");
    table.className = "table";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
    const tbody = document.createElement("tbody");
    table.appendChild(thead); table.appendChild(tbody);
    container.appendChild(table);
    return tbody;
  }
  return container.querySelector("tbody");
}

// ------- export PNG -------
async function savePane(selector, filename) {
  await loadHtml2Canvas();
  const node = document.querySelector(selector);
  const canvas = await window.html2canvas(node, { scale: 2, useCORS: true });
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

// ------- utils -------
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slug(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}

/* minimal styles scoped to this page (optional if your styles.css already covers these)
   Add to styles.css if you prefer.
*/
const style = document.createElement("style");
style.textContent = `
  .two-col { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 900px){ .two-col{ grid-template-columns: 1fr; } }
  .cards { display:grid; gap:8px; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); }
  .player-card { background:#161b22; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px; }
  .player-card .pc-name { font-weight:600; }
  .player-card .pc-meta { opacity:0.75; font-size:0.9rem; }
  .player-card .pc-chip { margin-top:6px; display:inline-block; font-size:0.75rem; padding:2px 6px; border-radius:999px; border:1px solid rgba(255,255,255,0.12); opacity:0.9; }
  .table { width:100%; border-collapse:collapse; }
  .table th, .table td { padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.08); vertical-align:top; }
  .mono { font-variant-numeric: tabular-nums; }
  .pos { color:#58d68d; } .neg { color:#ff6b6b; }
  .scorebar { position:relative; height:20px; background:#11161c; border:1px solid rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; }
  .scorebar .fill { position:absolute; inset:0 auto 0 0; background:#238636; }
  .scorebar .scoretxt { position:relative; display:block; text-align:center; font-size:0.85rem; }
  .stat { background:#0f141a; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px; }
  .stat .label { opacity:0.7; font-size:0.85rem; }
  .stat .value { font-weight:700; margin-top:4px; }
`;
document.head.appendChild(style);
