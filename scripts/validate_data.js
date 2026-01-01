const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "public", "data", "manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatIssue(issue) {
  return `- ${issue}`;
}

function main() {
  const issues = [];
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest at ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const years = Array.isArray(manifest.years) ? manifest.years : [];
  if (!manifest.generatedAt) {
    issues.push("manifest.generatedAt is missing");
  }
  if (years.length === 0) {
    issues.push("manifest.years is empty or missing");
  }

  const requiredArrayKeys = ["teams", "matchups", "transactions", "draft", "awards", "lineups"];
  const nonEmptyKeys = ["teams", "matchups", "draft"];
  const lineupRequiredFromYear = 2020;

  const yearsSet = new Set(years);

  for (const year of years) {
    const seasonPath = path.join(root, "public", "data", `${year}.json`);
    if (!fs.existsSync(seasonPath)) {
      issues.push(`Missing season file for ${year}: ${seasonPath}`);
      continue;
    }

    const season = readJson(seasonPath);
    if (season.year !== year) {
      issues.push(`${year}: season.year (${season.year}) does not match manifest`);
    }

    for (const key of ["schemaVersion", "year", ...requiredArrayKeys]) {
      if (!(key in season)) {
        issues.push(`${year}: missing key ${key}`);
      }
    }

    for (const key of requiredArrayKeys) {
      if (!Array.isArray(season[key])) {
        issues.push(`${year}: ${key} is not an array`);
      }
    }

    for (const key of nonEmptyKeys) {
      if (Array.isArray(season[key]) && season[key].length === 0) {
        issues.push(`${year}: ${key} is empty`);
      }
    }

    if (year >= lineupRequiredFromYear && Array.isArray(season.lineups) && season.lineups.length === 0) {
      issues.push(`${year}: lineups is empty but should include player profiles`);
    }

    if (Array.isArray(season.lineups)) {
      const teamNames = new Set(
        (Array.isArray(season.teams) ? season.teams : [])
          .map((team) => (team ? team.team_name : null))
          .filter((name) => typeof name === "string" && name.length > 0)
      );
      const matchupWeeks = (Array.isArray(season.matchups) ? season.matchups : [])
        .map((matchup) => (matchup ? matchup.week : null))
        .filter((week) => Number.isInteger(week));
      const lineupWeeks = season.lineups
        .map((lineup) => (lineup ? lineup.week : null))
        .filter((week) => Number.isInteger(week));

      const weeks = new Set(matchupWeeks);
      if (matchupWeeks.length && lineupWeeks.length) {
        const maxMatchupWeek = Math.max(...matchupWeeks);
        const extraWeeks = lineupWeeks.filter((week) => week > maxMatchupWeek);
        if (extraWeeks.length) {
          const maxLineupWeek = Math.max(...extraWeeks);
          const expectedExtraWeeks = new Set();
          for (let week = maxMatchupWeek + 1; week <= maxLineupWeek; week += 1) {
            expectedExtraWeeks.add(week);
          }
          const lineupExtraWeeks = new Set(extraWeeks);
          const hasContinuousExtension = [...expectedExtraWeeks].every((week) => lineupExtraWeeks.has(week));
          if (hasContinuousExtension) {
            expectedExtraWeeks.forEach((week) => weeks.add(week));
          }
        }
      }

      season.lineups.forEach((lineup, index) => {
        const team = lineup?.team ?? null;
        const week = lineup?.week ?? null;
        if (!team || !teamNames.has(team)) {
          issues.push(`${year}: lineup[${index}] references unknown team (${team})`);
        }
        if (week === null || !weeks.has(week)) {
          issues.push(`${year}: lineup[${index}] references unknown week (${week})`);
        }
      });
    }

    if (year === 2025) {
      const tolerance = 0.01;
      const lineupTotals = new Map();
      for (const entry of season.lineups || []) {
        if (!entry || !entry.started) continue;
        const team = entry.team;
        const week = entry.week;
        if (!team || !Number.isInteger(week)) continue;
        const key = `${team}::${week}`;
        const points = typeof entry.points === "number" ? entry.points : 0;
        lineupTotals.set(key, (lineupTotals.get(key) || 0) + points);
      }

      for (const matchup of season.matchups || []) {
        const week = matchup?.week;
        if (!Number.isInteger(week)) continue;
        const homeTeam = matchup?.home_team;
        const awayTeam = matchup?.away_team;
        const homeScore = matchup?.home_score;
        const awayScore = matchup?.away_score;

        const entries = [
          { team: homeTeam, score: homeScore },
          { team: awayTeam, score: awayScore },
        ];

        for (const { team, score } of entries) {
          if (!team || typeof score !== "number") {
            continue;
          }
          const key = `${team}::${week}`;
          if (!lineupTotals.has(key)) {
            issues.push(`${year}: missing lineup totals for ${team} week ${week}`);
            continue;
          }
          const total = lineupTotals.get(key);
          if (Math.abs(total - score) > tolerance) {
            issues.push(
              `${year}: ${team} week ${week} points mismatch (score ${score} vs starters ${total})`
            );
          }
        }
      }
    }
  }

  if (!yearsSet.has(2025)) {
    issues.push("manifest.years does not include 2025");
  }

  if (issues.length) {
    console.error("Data validation failed:\n" + issues.map(formatIssue).join("\n"));
    process.exit(1);
  }

  console.log("Data validation passed.");
}

main();
