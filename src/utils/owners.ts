/**
 * Owner name resolution utilities
 *
 * This module re-exports functions from lib/identity.ts for backward compatibility.
 * Consider importing directly from lib/identity.ts for new code.
 */
import { normalizeOwnerName, resolveOwnerFromRoster } from "../lib/identity";
import type { OwnerInput, RosterEntry, UsersById } from "../types/index";

// Re-export for backward compatibility
export { normalizeOwnerName };

/**
 * Resolves an owner name from various input formats
 * @param raw - The raw owner input (string or object with name fields)
 * @returns Normalized owner name
 */
export function resolveOwnerName(raw: OwnerInput): string {
  return normalizeOwnerName(raw);
}

/**
 * Resolves an owner name from a roster entry and user lookup
 * @param roster - The roster entry containing owner/user IDs
 * @param userById - Map or object to look up user details by ID
 * @returns Resolved owner name
 */
export function resolveOwnerFromRosterEntry(
  roster: RosterEntry | null | undefined,
  userById: UsersById | null | undefined
): string {
  return resolveOwnerFromRoster(roster, userById);
}

// Also re-export resolveOwnerFromRoster with original name for backward compatibility
export { resolveOwnerFromRoster };
