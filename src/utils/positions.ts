/** Standard fantasy football position order */
const POSITION_ORDER: readonly string[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];

/**
 * Sort function for positions according to standard fantasy football order
 * @param a - First position to compare
 * @param b - Second position to compare
 * @returns Negative if a comes before b, positive if after, 0 if equal
 */
export function positionSort(a: string, b: string): number {
  const aIndex = POSITION_ORDER.indexOf(a);
  const bIndex = POSITION_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) return String(a).localeCompare(String(b));
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

/**
 * Returns a copy of the standard position order array
 * @returns Array of position codes in display order
 */
export function getPositionOrder(): string[] {
  return POSITION_ORDER.slice();
}
