// Trade Analysis — focuses on trades list, scores, and assets per side

// ---------- dom ----------
const $ = (s, r=document)=>r.querySelector(s);
const escapeHtml = s => String(s||"").replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ---------- state ----------
let MANIFEST, YEAR, DATA, TEAM_FILTER = "all";

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  MANIFEST = await fetchJSON("manifest.json");
  buildSeasonSelect(MANIFEST.years);
  YEAR = +$("#seasonSelect").value;
  await loadSeason(YEAR);
  bindUI();
});

// ---------- io ----------
async function fetchJSON(path){
  const res = await fetch(path, {cache: "no-store"});
  if(!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

// ---------- selects ----------
function buildSeasonSelect(years){
  const sel = $("#seasonSelect");
  const sorted = [...years].sort((a,b)=>b-a);
  sel.innerHTML = sorted.map((y,i)=>`<option value="${y}" ${i===0?'selected':''}>${y}</option>`).join("");
}

function buildTeamSelect(){
  const sel = $("#teamSelect");
  const opts = [`<option value="all">All Teams</option>`]
    .concat((DATA.teams||[]).map(t=>`<option value="${t.team_id}">${escapeHtml(t.team_name)}</option>`));
  sel.innerHTML = opts.join("");
  sel.value = TEAM_FILTER;
}

// ---------- load ----------
async function loadSeason(y){
  YEAR = y;
  DATA = await fetchJSON(`data/${y}.json`);
  if(!Array.isArray(DATA.trade_evals)){ DATA.trade_evals = []; }
  buildTeamSelect();
  renderAll();
}

// ---------- ui events ----------
function bindUI(){
  $("#seasonSelect").addEventListener("change", e => loadSeason(+e.target.value));
  $("#teamSelect").addEventListener("change", e => { TEAM_FILTER = e.target.value; renderAll(); });
  $("#tradeSearch").addEventListener("input", renderTrades);
}

// ---------- render ----------
function renderAll(){
  renderOverview();
  renderTrades();
}

function renderOverview(){
  // all trades or team-filtered perspective counts
  const rows = getTradeRows();
  const total = rows.length;
  const netSum = rows.reduce((a,r)=>a+r.net_for_team,0);
  const best = rows.reduce((m,r)=> r.score_for_team > (m?.score_for_team ?? -1) ? r : m, null);
  const worst= rows.reduce((m,r)=> r.score_for_team < (m?.score_for_team ?? 101)? r : m, null);

  $("#taSummary").innerHTML = [
    stat("Trades", total),
    stat("Net Points (sum)", fmt(netSum)),
    stat("Best Trade", best? `W${best.week} · ${best.score_for_team}` : "—"),
    stat("Worst Trade", worst? `W${worst.week} · ${worst.score_for_team}` : "—"),
  ].join("");
}

function stat(label, value){
  return `<div class="stat"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div></div>`;
}

function renderTrades(){
  const q = ($("#tradeSearch").value||"").toLowerCase();

  const wrap = $("#tradesWrap");
  wrap.innerHTML = "";

  // table header
  const table = document.createElement("table");
  table.className = "table";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:64px;">Week</th>
        <th>Teams</th>
        <th>Assets</th>
        <th style="width:140px;">Net Pts</th>
        <th style="width:120px;">Score</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  wrap.appendChild(table);
  const tbody = table.querySelector("tbody");

  const rows = getTradeRows();
  for(const row of rows){
    const hay = (row.search_blob).toLowerCase();
    if(q && !hay.includes(q)) continue;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">W${row.week}</td>
      <td><div class="teams">
            <div class="team ${row.winner===row.team_a ? 'winner':''}">
              ${escapeHtml(row.team_a_name)}
            </div>
            <div class="team ${row.winner===row.team_b ? 'winner':''}">
              ${escapeHtml(row.team_b_name)}
            </div>
          </div>
      </td>
      <td>
        <div class="assets">
          <div><span class="arrow">→</span> <strong>${escapeHtml(row.team_a_name)}</strong>: ${escapeHtml(row.to_a_names || '—')}</div>
          <div><span class="arrow">→</span> <strong>${escapeHtml(row.team_b_name)}</strong>: ${escapeHtml(row.to_b_names || '—')}</div>
        </div>
      </td>
      <td class="mono ${row.net_for_team>=0?'pos':'neg'}">${fmt(row.net_for_team)}</td>
      <td>
        <div class="scorepill" title="${row.score_for_team}">
          <div class="bar" style="width:${row.score_for_team}%"></div>
          <span class="num">${row.score_for_team}</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  if(!tbody.children.length){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.padding = "10px";
    empty.textContent = "No trades match this filter.";
    wrap.appendChild(empty);
  }
}

// ---------- data shaping ----------
function getTradeRows(){
  // Output: one row per transaction from the perspective of either:
  //  - a specific team (TEAM_FILTER != 'all') -> only that team's side
  //  - "all" -> both sides (two rows per trade)
  const rows = [];
  const nameOf = pid => DATA.player_index?.[pid]?.full_name || pid;

  for(const t of DATA.trade_evals){
    // Expect exactly two teams; if more, still create one row per side.
    for(const pr of t.per_roster || []){
      const other = (t.per_roster || []).find(x => x !== pr) || null;

      // filter by team selection
      if(TEAM_FILTER !== "all" && String(pr.roster_id) !== String(TEAM_FILTER)) continue;

      const teamName = teamNameByRid(pr.roster_id);
      const otherName = other ? teamNameByRid(other.roster_id) : "—";

      const to_this = (pr.players_in||[]).map(nameOf).join(", ");
      const to_other= (pr.players_out||[]).map(nameOf).join(", ");

      const winnerRid = (() => {
        if(!other) return null;
        const a = pr.score_0_to_100;
        const b = other.score_0_to_100;
        return a===b ? null : (a>b ? pr.roster_id : other.roster_id);
      })();

      rows.push({
        week: t.week,
        tx_id: t.tx_id,
        team_a: pr.roster_id,
        team_b: other?.roster_id ?? null,
        team_a_name: teamName,
        team_b_name: otherName,
        to_a_names: to_this,       // assets that went to this row's team
        to_b_names: to_other,      // assets that left this row's team (thus went to the other)
        net_for_team: Number(pr.net_points_after || 0),
        score_for_team: Number(pr.score_0_to_100 || 50),
        winner: winnerRid,
        search_blob: `${teamName} ${otherName} ${to_this} ${to_other} W${t.week}`
      });
    }
  }
  // If "all", show both sides interleaved but grouped by week/tx
  rows.sort((a,b)=> (a.week - b.week) || (String(a.tx_id).localeCompare(String(b.tx_id))));
  return rows;
}

function teamNameByRid(rid){
  const t = (DATA.teams||[]).find(x => String(x.team_id)===String(rid));
  return t?.team_name || `Roster ${rid}`;
}

// ---------- utils ----------
function fmt(n){ n = Number(n||0); return (Math.abs(n)>=100 ? n.toFixed(0) : n.toFixed(1)); }
