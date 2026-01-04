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

function resolvePlayerFromIndex(playerIndex, candidates) {
  if (!playerIndex) return null;
  for (const { key, value } of candidates) {
    if (!value) continue;
    const lookup = playerIndex[key];
    if (!lookup) continue;
    const entry = lookup.get(String(value));
    if (entry) return entry;
  }
  return null;
}

function getSleeperEntry(sleeperPlayers, playerId) {
  if (!sleeperPlayers || !playerId) return null;
  if (sleeperPlayers instanceof Map) return sleeperPlayers.get(String(playerId)) || null;
  if (Array.isArray(sleeperPlayers)) {
    return sleeperPlayers.find((entry) => String(entry?.player_id) === String(playerId)) || null;
  }
  return sleeperPlayers[String(playerId)] || null;
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

export function resolvePlayerDisplay(playerId, { row, playerIndex, sleeperPlayers } = {}) {
  const effectiveRow = row || {};
  const directName = effectiveRow.display_name || effectiveRow.player_name || effectiveRow.player;
  const candidates = [
    { key: "player_id", value: effectiveRow.player_id || playerId },
    { key: "sleeper_id", value: effectiveRow.sleeper_id || playerId },
    { key: "gsis_id", value: effectiveRow.gsis_id },
    { key: "espn_id", value: effectiveRow.espn_id },
  ];
  const player = resolvePlayerFromIndex(playerIndex, candidates);
  const sleeperEntry = getSleeperEntry(sleeperPlayers, effectiveRow.player_id || playerId);
  const resolvedName = directName && !looksLikeId(directName) ? directName : resolveNameFromEntry(player);
  const fallbackName = resolveNameFromEntry(sleeperEntry);
  const sleeperIdCandidate = effectiveRow.sleeper_id || effectiveRow.player_id || playerId;
  const sleeperHeadshot =
    sleeperIdCandidate && /^\d+$/.test(String(sleeperIdCandidate))
      ? `https://sleepercdn.com/content/nfl/players/${sleeperIdCandidate}.jpg`
      : null;
  return {
    name: resolvedName || fallbackName || "(Unknown Player)",
    headshotUrl:
      player?.headshot_url ||
      player?.headshotUrl ||
      player?.headshot ||
      sleeperEntry?.headshot_url ||
      sleeperEntry?.headshotUrl ||
      sleeperEntry?.headshot ||
      sleeperHeadshot ||
      null,
    position: player?.position || sleeperEntry?.position || effectiveRow.position || "—",
    team: player?.nfl_team || sleeperEntry?.team || sleeperEntry?.nfl_team || effectiveRow.nfl_team || "—",
  };
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
