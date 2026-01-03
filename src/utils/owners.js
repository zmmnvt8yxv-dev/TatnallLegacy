const OWNER_ALIASES = {
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

const LOWER_PARTICLES = new Set(["de", "del", "da", "di", "van", "von", "la", "le"]);

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWER_PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function resolveOwnerName(raw) {
  if (raw === null || raw === undefined) return "";
  if (typeof raw !== "string") {
    const guess =
      raw?.name ||
      raw?.nickname ||
      raw?.display_name ||
      raw?.team_name ||
      raw?.owner ||
      "";
    if (typeof guess !== "string") return "";
    raw = guess;
  }
  let normalized = raw.trim();
  if (!normalized) return "";
  if (normalized.includes("@")) normalized = normalized.split("@")[0];
  normalized = normalized.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  const key = normalized.toLowerCase();
  if (OWNER_ALIASES[key]) return OWNER_ALIASES[key];
  if (/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(normalized)) return titleCaseName(normalized);
  return normalized;
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
  return resolveOwnerName(raw);
}
