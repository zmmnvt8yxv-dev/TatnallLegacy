export type PlayerAlias = {
  alias: string;
  canonical: string;
  team?: string;
  pos?: string;
};

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export const aliasMap: PlayerAlias[] = [
  { alias: "Mitch Trubisky", canonical: "Mitchell Trubisky" },
  { alias: "Hollywood Brown", canonical: "Marquise Brown" },
  { alias: "Gabe Davis", canonical: "Gabriel Davis" },
];

const stripDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function normalizeName(name: string): string {
  if (!name) {
    return "";
  }
  const cleaned = stripDiacritics(name)
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[-/]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const tokens = cleaned.split(" ").filter(Boolean);
  const filtered = tokens.filter((token) => !NAME_SUFFIXES.has(token));
  const result: string[] = [];
  let initials: string[] = [];

  const flushInitials = () => {
    if (initials.length > 0) {
      result.push(initials.join(""));
      initials = [];
    }
  };

  filtered.forEach((token) => {
    if (token.length === 1) {
      initials.push(token);
      return;
    }
    flushInitials();
    result.push(token);
  });

  flushInitials();

  return result.join(" ");
}

const matchesMetadata = (
  alias: PlayerAlias,
  metadata?: { team?: string; pos?: string },
): boolean => {
  if (!metadata) {
    return !alias.team && !alias.pos;
  }
  if (alias.team && metadata.team && alias.team.toLowerCase() !== metadata.team.toLowerCase()) {
    return false;
  }
  if (alias.team && !metadata.team) {
    return false;
  }
  if (alias.pos && metadata.pos && alias.pos.toLowerCase() !== metadata.pos.toLowerCase()) {
    return false;
  }
  if (alias.pos && !metadata.pos) {
    return false;
  }
  return true;
};

export function resolvePlayerKey(
  inputName: string,
  optionalMetadata?: { team?: string; pos?: string },
): string {
  const normalized = normalizeName(inputName);
  if (!normalized) {
    return "";
  }

  const alias = aliasMap.find((entry) => {
    const aliasNormalized = normalizeName(entry.alias);
    if (aliasNormalized !== normalized) {
      return false;
    }
    return matchesMetadata(entry, optionalMetadata);
  });

  if (alias) {
    return normalizeName(alias.canonical);
  }

  return normalized;
}

export function addAliasEntry(entry: PlayerAlias): void {
  aliasMap.push(entry);
}
