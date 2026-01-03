export function looksLikeId(value) {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (/^\d+$/.test(text)) return true;
  if (/^\d{2}-\d{6,}$/.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  return false;
}

function resolveNameFromEntry(entry) {
  if (!entry) return "";
  const directName = entry.display_name || entry.player_display_name || entry.full_name || entry.name;
  if (directName && !looksLikeId(directName)) return directName;
  if (entry.first_name || entry.last_name) {
    const combined = [entry.first_name, entry.last_name].filter(Boolean).join(" ").trim();
    if (combined && !looksLikeId(combined)) return combined;
  }
  return "";
}

function getIdEntries(row) {
  if (!row) return [];
  return [
    { key: "gsis_id", value: row.gsis_id },
    { key: "sleeper_id", value: row.sleeper_id },
    { key: "espn_id", value: row.espn_id },
    { key: "player_id", value: row.player_id },
  ];
}

export function resolvePlayerName(row, playerIndex) {
  if (!row) return "(Unknown Player)";
  const directName = row.display_name || row.player_name || row.player;
  if (directName && !looksLikeId(directName)) return directName;
  if (playerIndex) {
    for (const { key, value } of getIdEntries(row)) {
      if (!value) continue;
      const lookup = playerIndex[key];
      if (!lookup) continue;
      const entry = lookup.get(String(value));
      const resolved = resolveNameFromEntry(entry);
      if (resolved) return resolved;
    }
  }
  if (row.player_id) return "(Unknown Player)";
  return "(Unknown Player)";
}

export function buildPlayerIndex({ players = [], playerIds = [] } = {}) {
  const byGsis = new Map();
  const bySleeper = new Map();
  const byEspn = new Map();
  const byPlayerId = new Map();
  const byUid = new Map();

  for (const player of players) {
    if (!player) continue;
    if (player.player_uid) byUid.set(String(player.player_uid), player);
    if (player.gsis_id) byGsis.set(String(player.gsis_id), player);
    if (player.sleeper_id) bySleeper.set(String(player.sleeper_id), player);
    if (player.espn_id) byEspn.set(String(player.espn_id), player);
    if (player.player_id) byPlayerId.set(String(player.player_id), player);
  }

  for (const entry of playerIds) {
    if (!entry?.id_value || !entry?.player_uid) continue;
    const player = byUid.get(String(entry.player_uid));
    if (!player) continue;
    const value = String(entry.id_value);
    if (entry.id_type === "sleeper") {
      bySleeper.set(value, player);
      byPlayerId.set(value, player);
    }
    if (entry.id_type === "gsis") byGsis.set(value, player);
    if (entry.id_type === "espn") byEspn.set(value, player);
  }

  return {
    gsis_id: byGsis,
    sleeper_id: bySleeper,
    espn_id: byEspn,
    player_id: byPlayerId,
  };
}
