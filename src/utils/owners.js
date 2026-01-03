import { normalizeOwnerName } from "../lib/identity.js";

export { normalizeOwnerName };

export function resolveOwnerName(raw) {
  return normalizeOwnerName(raw);
}

export function resolveOwnerFromRoster(roster, userById) {
  if (!roster) return "";
  const user = userById?.get ? userById.get(roster.owner_id) : null;
  const raw =
    user?.metadata?.team_name ||
    user?.metadata?.nickname ||
    user?.display_name ||
    roster?.display_name ||
    roster?.username ||
    roster?.team_name ||
    roster?.owner_id ||
    roster?.user_id ||
    (roster?.roster_id ? `Roster ${roster.roster_id}` : "");
  return normalizeOwnerName(raw);
}
