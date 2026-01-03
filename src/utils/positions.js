const POSITION_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];

export function positionSort(a, b) {
  const aIndex = POSITION_ORDER.indexOf(a);
  const bIndex = POSITION_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) return String(a).localeCompare(String(b));
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

export function getPositionOrder() {
  return POSITION_ORDER.slice();
}
