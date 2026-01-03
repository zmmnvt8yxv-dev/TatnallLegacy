export const OWNER_ALIASES = {
  "carl marvin": "Carl Marvin",
  "cmarvin713": "Carl Marvin",
  "sdmarvin713": "Carl Marvin",
  "stephen marvin": "Carl Marvin",
  "conner malley": "Conner Malley",
  "conner27lax": "Conner Malley",
  "connerandfinn": "Conner Malley",
  "jared duncan": "Jared Duncan",
  "jawnwick13": "Jared Duncan",
  "jdunca5228572": "Jared Duncan",
  "jeff crossland": "Jeff Crossland",
  "jeffrey crossland": "Jeff Crossland",
  "jefe6700": "Jeff Crossland",
  "junktion": "Jeff Crossland",
  "john downs": "John Downs",
  "john downs123": "John Downs",
  "downsliquidity": "John Downs",
  "roy lee": "Roy Lee",
  "roylee6": "Roy Lee",
  "espn92085473": "Roy Lee",
  "edward saad": "Edward Saad",
  "edward3864": "Edward Saad",
  "phillyphilly709": "Edward Saad",
  "jalen del rosario": "Jalen Del Rosario",
  "jalendelrosario": "Jalen Del Rosario",
  "jalendelrosario@comcast.net": "Jalen Del Rosario",
  "jack sheehy": "Jackie Sheehy",
  "jksheehy": "Jackie Sheehy",
  "samuel kirby": "Samuel Kirby",
  "lbmbets": "Samuel Kirby",
  "max hardin": "Max Hardin",
  "mhardi5674696": "Max Hardin",
  "matt maloy": "Matt Maloy",
  "mattmaloy99": "Matt Maloy",
  "brendan hanrahan": "Brendan Hanrahan",
  "bhanrahan7": "Brendan Hanrahan",
};

const PUNCTUATION_REGEX = /[.,'\"]/g;
const WHITESPACE_REGEX = /\s+/g;

function titleCase(input) {
  if (!input) return "";
  return String(input)
    .trim()
    .split(WHITESPACE_REGEX)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

export function normalizeKey(value) {
  try {
    if (value === null || value === undefined) return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const ascii = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const collapsed = ascii.replace(WHITESPACE_REGEX, " ").trim();
    if (collapsed.includes("@")) {
      return collapsed.toLowerCase();
    }
    const stripped = collapsed.replace(PUNCTUATION_REGEX, " ").replace(WHITESPACE_REGEX, " ").trim();
    return stripped.toLowerCase();
  } catch {
    return "";
  }
}

export function resolveOwnerName(input) {
  try {
    if (!input) return "";
    const key = normalizeKey(input);
    return OWNER_ALIASES[key] || titleCase(String(input));
  } catch {
    return "";
  }
}

export function resolveOwnerFromRoster(roster, usersById) {
  try {
    if (!roster) return "";
    const candidates = [
      roster.owner_id,
      roster.ownerId,
      roster.user_id,
      roster.userId,
      roster.owner,
      roster.username,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const id = String(candidate);
      const user = usersById?.get ? usersById.get(id) : usersById?.[id];
      const raw = user?.display_name || user?.username || user?.name || user?.email || candidate;
      const resolved = resolveOwnerName(raw);
      if (resolved) return resolved;
    }
    return "";
  } catch {
    return "";
  }
}
