import { readFile } from "node:fs/promises";
import { join } from "node:path";

function resolvePath(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

async function readJson(path) {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const distRoot = join(process.cwd(), "dist");
  const dataRoot = join(distRoot, "data");
  const manifestPath = join(dataRoot, "manifest.json");
  const manifest = await readJson(manifestPath);

  const requiredPaths = ["seasonSummary", "weeklyChunk", "transactions"];
  for (const key of requiredPaths) {
    assert(manifest?.paths?.[key], `Missing manifest.paths.${key}`);
  }

  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  assert(seasons.length > 0, "No seasons found in manifest.");
  const maxSeason = Math.max(...seasons);
  const weeksBySeason = manifest?.weeksBySeason || {};

  let maxWeek = 0;
  let totalMatchups = 0;
  let totalLineups = 0;
  let totalStandingsRows = 0;
  const transactionCounts = { add: 0, drop: 0, trade: 0 };

  for (const season of seasons) {
    const seasonPath = resolvePath(manifest.paths.seasonSummary, { season });
    const seasonPayload = await readJson(join(distRoot, seasonPath));
    assert(Array.isArray(seasonPayload?.standings), `Missing standings for season ${season}`);
    totalStandingsRows += seasonPayload.standings.length;

    const weeks = (weeksBySeason[String(season)] || []).filter((week) => week >= 1 && week <= 18);
    for (const week of weeks) {
      maxWeek = Math.max(maxWeek, Number(week));
      const weekPath = resolvePath(manifest.paths.weeklyChunk, { season, week });
      const weekPayload = await readJson(join(distRoot, weekPath));
      assert(Array.isArray(weekPayload?.matchups), `Missing matchups for ${season} week ${week}`);
      assert(Array.isArray(weekPayload?.lineups), `Missing lineups for ${season} week ${week}`);
      totalMatchups += weekPayload.matchups.length;
      totalLineups += weekPayload.lineups.length;
    }

    const txnPath = resolvePath(manifest.paths.transactions, { season });
    const txnPayload = await readJson(join(distRoot, txnPath));
    assert(Array.isArray(txnPayload?.entries), `Missing transactions for season ${season}`);
    for (const entry of txnPayload.entries) {
      if (entry?.type === "add") transactionCounts.add += 1;
      if (entry?.type === "drop") transactionCounts.drop += 1;
      if (entry?.type === "trade") transactionCounts.trade += 1;
    }
  }

  console.log("=== FRONTEND DATA VERIFY ===");
  console.log(`Seasons: ${seasons.length} (max ${maxSeason})`);
  console.log(`Max week: ${maxWeek}`);
  console.log(`Standings rows: ${totalStandingsRows}`);
  console.log(`Matchups: ${totalMatchups}`);
  console.log(`Lineups (rosters): ${totalLineups}`);
  console.log(
    `Transactions - trades: ${transactionCounts.trade}, adds: ${transactionCounts.add}, drops: ${transactionCounts.drop}`,
  );
}

main().catch((err) => {
  console.error("VERIFY_FRONTEND_DATA_FAILED", err.message || err);
  process.exit(1);
});
