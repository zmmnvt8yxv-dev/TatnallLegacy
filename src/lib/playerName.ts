import type {
  PlayerIndex,
  PlayerLookupResult,
  PlayerDisplay,
  IdEntry,
  PlayerRow,
} from "../types/index";
import type { Player, PlayerId, EspnNameMap } from "../schemas/index";

export function looksLikeId(value: unknown): boolean {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (/^\d+$/.test(text)) return true;
  if (/^\d{2}-\d{6,}$/.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  return false;
}

function isPlaceholderName(value: unknown): boolean {
  if (!value) return false;
  return /^ESPN Player \d+$/i.test(String(value).trim());
}

function resolveNameFromEntry(entry: PlayerLookupResult | null | undefined): string {
  if (!entry) return "";
  const directName = entry.display_name || entry.player_display_name || entry.full_name || entry.name;
  if (directName && !looksLikeId(directName) && !isPlaceholderName(directName)) return directName;
  if (entry.first_name || entry.last_name) {
    const combined = [entry.first_name, entry.last_name].filter(Boolean).join(" ").trim();
    if (combined && !looksLikeId(combined)) return combined;
  }
  return "";
}

function resolveEspnName(espnNameMap: EspnNameMap | Map<string, string> | null | undefined, espnId: string | null | undefined): string {
  if (!espnNameMap || !espnId) return "";
  const key = String(espnId);
  if (espnNameMap instanceof Map) return espnNameMap.get(key) || "";
  return espnNameMap[key] || "";
}

function resolveEspnIdFromRow(row: PlayerRow | null | undefined): string | null {
  if (!row) return null;
  if (row.espn_id) return row.espn_id;
  if (row.id_type === "espn" && row.id) return row.id;
  if (row.source === "espn" && row.player_id) return row.player_id;
  if (row.source === "espn" && row.source_player_id) return row.source_player_id;
  return null;
}

function getIdEntries(row: PlayerRow | null | undefined): IdEntry[] {
  if (!row) return [];
  return [
    { key: "sleeper_id", value: row.sleeper_id },
    { key: "gsis_id", value: row.gsis_id },
    { key: "espn_id", value: row.espn_id },
    { key: "player_id", value: row.player_id },
  ];
}

function resolvePlayerFromIndex(playerIndex: PlayerIndex | null | undefined, candidates: IdEntry[]): PlayerLookupResult | null {
  if (!playerIndex) return null;
  for (const { key, value } of candidates) {
    if (!value) continue;
    const lookup = playerIndex[key as keyof PlayerIndex];
    if (!lookup) continue;
    const entry = lookup.get(String(value));
    if (entry) return entry as unknown as PlayerLookupResult;
  }
  return null;
}

interface GetCanonicalPlayerIdOptions {
  row?: PlayerRow;
  playerIndex?: PlayerIndex | null;
}

export function getCanonicalPlayerId(
  playerId: string | null | undefined,
  { row, playerIndex }: GetCanonicalPlayerIdOptions = {}
): string {
  const effectiveRow = row || {};
  const rawId = playerId != null ? String(playerId) : "";
  if (playerIndex && rawId) {
    const direct =
      playerIndex.sleeper_id?.get(rawId) ||
      playerIndex.player_id?.get(rawId) ||
      playerIndex.espn_id?.get(rawId) ||
      playerIndex.gsis_id?.get(rawId);
    if (direct) {
      const lookupResult = direct as unknown as PlayerLookupResult;
      const mappedId = lookupResult.sleeper_id || lookupResult.player_id;
      if (mappedId) return String(mappedId);
    }
  }
  const candidates: IdEntry[] = [
    { key: "sleeper_id", value: effectiveRow.sleeper_id },
    { key: "player_id", value: effectiveRow.player_id },
    { key: "gsis_id", value: effectiveRow.gsis_id },
    { key: "espn_id", value: effectiveRow.espn_id },
  ];
  const resolved = resolvePlayerFromIndex(playerIndex ?? null, candidates);
  if (resolved?.sleeper_id) return String(resolved.sleeper_id);
  if (resolved?.player_id) return String(resolved.player_id);
  if (effectiveRow.sleeper_id) return String(effectiveRow.sleeper_id);
  if (effectiveRow.player_id) return String(effectiveRow.player_id);
  if (rawId) return rawId;
  return "";
}

export function canResolvePlayerId(playerId: string | null | undefined, playerIndex: PlayerIndex | null | undefined): boolean {
  if (!playerId || !playerIndex) return false;
  const id = String(playerId);
  return (
    playerIndex.sleeper_id?.has(id) ||
    playerIndex.player_id?.has(id) ||
    playerIndex.espn_id?.has(id) ||
    playerIndex.gsis_id?.has(id) ||
    false
  );
}

type SleeperPlayersLookup = Map<string, PlayerLookupResult> | PlayerLookupResult[] | Record<string, PlayerLookupResult>;

function getSleeperEntry(sleeperPlayers: SleeperPlayersLookup | null | undefined, playerId: string | null | undefined): PlayerLookupResult | null {
  if (!sleeperPlayers || !playerId) return null;
  if (sleeperPlayers instanceof Map) return sleeperPlayers.get(String(playerId)) || null;
  if (Array.isArray(sleeperPlayers)) {
    return sleeperPlayers.find((entry) => String(entry?.player_id) === String(playerId)) || null;
  }
  return sleeperPlayers[String(playerId)] || null;
}

export function resolvePlayerName(
  row: PlayerRow | null | undefined,
  playerIndex: PlayerIndex | null | undefined,
  espnNameMap: EspnNameMap | Map<string, string> | null | undefined
): string {
  if (!row) return "(Unknown Player)";
  const directName = row.display_name || row.player_display_name || row.player_name || row.player;
  if (directName && !looksLikeId(directName) && !isPlaceholderName(directName)) return directName;
  if (playerIndex) {
    for (const { key, value } of getIdEntries(row)) {
      if (!value) continue;
      const lookup = playerIndex[key as keyof PlayerIndex];
      if (!lookup) continue;
      const entry = lookup.get(String(value));
      const resolved = resolveNameFromEntry(entry as unknown as PlayerLookupResult);
      if (resolved) return resolved;
    }
  }
  const espnName = resolveEspnName(espnNameMap, resolveEspnIdFromRow(row));
  if (espnName) return espnName;
  if (row.player_id) return "(Unknown Player)";
  return "(Unknown Player)";
}

interface ResolvePlayerDisplayOptions {
  row?: PlayerRow;
  playerIndex?: PlayerIndex | null;
  sleeperPlayers?: SleeperPlayersLookup | null;
  espnNameMap?: EspnNameMap | Map<string, string> | null;
}

export function resolvePlayerDisplay(
  playerId: string | null | undefined,
  { row, playerIndex, sleeperPlayers, espnNameMap }: ResolvePlayerDisplayOptions = {}
): PlayerDisplay {
  const effectiveRow = row || {};
  const directName =
    effectiveRow.display_name || effectiveRow.player_display_name || effectiveRow.player_name || effectiveRow.player;
  const candidates: IdEntry[] = [
    { key: "sleeper_id", value: effectiveRow.sleeper_id || playerId },
    { key: "gsis_id", value: effectiveRow.gsis_id },
    { key: "espn_id", value: effectiveRow.espn_id },
    { key: "player_id", value: effectiveRow.player_id || playerId },
  ];
  const player = resolvePlayerFromIndex(playerIndex ?? null, candidates);
  const sleeperEntry = getSleeperEntry(sleeperPlayers, effectiveRow.player_id || playerId);
  const resolvedName =
    directName && !looksLikeId(directName) && !isPlaceholderName(directName)
      ? directName
      : resolveNameFromEntry(player);
  const espnFallback =
    resolvedName ||
    resolveEspnName(
      espnNameMap,
      resolveEspnIdFromRow(effectiveRow)
    );
  const fallbackName = resolveNameFromEntry(sleeperEntry);
  const sleeperIdCandidate = effectiveRow.sleeper_id || effectiveRow.player_id || playerId;
  const sleeperHeadshot =
    sleeperIdCandidate && /^\d+$/.test(String(sleeperIdCandidate))
      ? `https://sleepercdn.com/content/nfl/players/${sleeperIdCandidate}.jpg`
      : null;
  return {
    name: espnFallback || fallbackName || "(Unknown Player)",
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

interface BuildPlayerIndexOptions {
  players?: Player[];
  playerIds?: PlayerId[];
}

export function buildPlayerIndex({ players = [], playerIds = [] }: BuildPlayerIndexOptions = {}): PlayerIndex {
  const byGsis = new Map<string, Player>();
  const bySleeper = new Map<string, Player>();
  const byEspn = new Map<string, Player>();
  const byPlayerId = new Map<string, Player>();
  const byUid = new Map<string, Player>();

  for (const player of players) {
    if (!player) continue;
    const playerAny = player as Player & { player_uid?: string; sleeper_id?: string; gsis_id?: string; espn_id?: string; player_id?: string };
    if (playerAny.player_uid) byUid.set(String(playerAny.player_uid), player);
    if (playerAny.gsis_id) byGsis.set(String(playerAny.gsis_id), player);
    if (playerAny.sleeper_id) bySleeper.set(String(playerAny.sleeper_id), player);
    if (playerAny.espn_id) byEspn.set(String(playerAny.espn_id), player);
    if (playerAny.player_id) byPlayerId.set(String(playerAny.player_id), player);
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
