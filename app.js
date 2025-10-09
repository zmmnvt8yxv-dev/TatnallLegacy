// static-only loaders for GitHub Pages
async function loadJSON(path){
  const r = await fetch(path, { cache: "no-store" });
  if(!r.ok) throw new Error(`fetch ${path} -> ${r.status}`);
  return r.json();
}

async function main(){
  const m = await loadJSON("manifest.json");
  const years = m.years || [];
  const sel = document.getElementById("seasonSelect");
  sel.innerHTML = "";
  years.slice().reverse().forEach(y => sel.appendChild(Object.assign(document.createElement("option"), {value: y, textContent: y})));
  sel.onchange = () => renderSeason(+sel.value);
  if (years.length) { sel.value = years[years.length - 1]; await renderSeason(+sel.value); }
}

async function renderSeason(year){
  const data = await loadJSON(`data/${year}.json`);
  renderSummary(year, data);
  renderTeams(data.teams||[]);
  renderMatchups(data.matchups||[]);
  renderTransactions(data.transactions||[]);
  renderDraft(data.draft||[]);
}
