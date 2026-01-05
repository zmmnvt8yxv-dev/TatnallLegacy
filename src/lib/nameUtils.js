export function normalizeName(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNameIndex(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row) continue;
    const rawName = row.display_name || row.player_display_name || row.player_name || row.player;
    const key = normalizeName(rawName);
    if (!key) continue;
    const entry = {
      name: rawName || row.display_name || row.player_name || "",
      position: row.position || "—",
      team: row.team || row.nfl_team || "—",
      sleeper_id: row.sleeper_id || null,
      gsis_id: row.gsis_id || null,
      player_id: row.player_id || null,
    };
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
      continue;
    }
    const existingHasId = Boolean(existing.sleeper_id || existing.gsis_id || existing.player_id);
    const entryHasId = Boolean(entry.sleeper_id || entry.gsis_id || entry.player_id);
    if (!existingHasId && entryHasId) {
      map.set(key, entry);
      continue;
    }
    if (existing.position === "—" && entry.position && entry.position !== "—") {
      map.set(key, entry);
    }
  }
  return map;
}
