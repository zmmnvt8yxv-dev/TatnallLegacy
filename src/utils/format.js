export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function formatPoints(value, digits = 2) {
  const num = safeNumber(value, null);
  if (num === null) return "—";
  return num.toFixed(digits);
}

export function filterRegularSeasonWeeks(rows, weekKey = "week") {
  return (rows || []).filter((row) => {
    const week = Number(row?.[weekKey]);
    return Number.isFinite(week) && week >= 1 && week <= 18;
  });
}
