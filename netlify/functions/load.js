const { Client } = require("pg");

const RAW_BASE = "https://raw.githubusercontent.com/zmmnvt8yxv-dev/TatnallLegacy/main/data";

async function up(conn, sql, args) { await conn.query(sql, args); }
async function rows(conn, sql, args) { return (await conn.query(sql,args)).rows; }

exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).key;
  if (!key || key !== process.env.ADMIN_TOKEN) return { statusCode: 401, body: "unauthorized" };

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // schema (idempotent)
  await up(client, `CREATE TABLE IF NOT EXISTS seasons (year INT PRIMARY KEY);`);
  await up(client, `CREATE TABLE IF NOT EXISTS teams (
    id BIGSERIAL PRIMARY KEY, year INT REFERENCES seasons(year) ON DELETE CASCADE,
    team_id INT, team_name TEXT, owner TEXT, record TEXT,
    points_for NUMERIC, points_against NUMERIC, regular_season_rank INT, final_rank INT);`);
  await up(client, `CREATE TABLE IF NOT EXISTS matchups (
    id BIGSERIAL PRIMARY KEY, year INT REFERENCES seasons(year) ON DELETE CASCADE,
    week INT, home_team TEXT, home_score NUMERIC, away_team TEXT, away_score NUMERIC, is_playoff BOOLEAN);`);
  await up(client, `CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY, year INT REFERENCES seasons(year) ON DELETE CASCADE, date_text TEXT);`);
  await up(client, `CREATE TABLE IF NOT EXISTS transaction_entries (
    id BIGSERIAL PRIMARY KEY, transaction_id BIGINT REFERENCES transactions(id) ON DELETE CASCADE,
    type TEXT, team TEXT, player TEXT, faab INT);`);
  await up(client, `CREATE TABLE IF NOT EXISTS draft_picks (
    id BIGSERIAL PRIMARY KEY, year INT REFERENCES seasons(year) ON DELETE CASCADE,
    round INT, overall INT, team TEXT, player TEXT, player_nfl TEXT, keeper BOOLEAN);`);

  // fetch manifest
  const manifest = await fetch(`${RAW_BASE}/manifest.json`).then(r => r.json());
  const years = Array.isArray(manifest.years) ? manifest.years : [];

  // wipe existing rows for these years (safe reimport)
  await up(client, `DELETE FROM teams WHERE year = ANY($1)`, [years]);
  await up(client, `DELETE FROM matchups WHERE year = ANY($1)`, [years]);
  await up(client, `DELETE FROM transaction_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE year = ANY($1))`, [years]);
  await up(client, `DELETE FROM transactions WHERE year = ANY($1)`, [years]);
  await up(client, `DELETE FROM draft_picks WHERE year = ANY($1)`, [years]);
  await up(client, `DELETE FROM seasons WHERE year = ANY($1)`, [years]);

  for (const y of years) {
    const doc = await fetch(`${RAW_BASE}/${y}.json`).then(r => r.json());
    await up(client, `INSERT INTO seasons(year) VALUES($1) ON CONFLICT DO NOTHING`, [y]);

    for (const t of (doc.teams||[])) {
      await up(client, `INSERT INTO teams(year,team_id,team_name,owner,record,points_for,points_against,regular_season_rank,final_rank)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [y,t.team_id||null,t.team_name||null,t.owner||null,t.record||null,t.points_for||null,t.points_against||null,t.regular_season_rank||null,t.final_rank||null]);
    }

    for (const m of (doc.matchups||[])) {
      await up(client, `INSERT INTO matchups(year,week,home_team,home_score,away_team,away_score,is_playoff)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [y,m.week||null,m.home_team||null,m.home_score||null,m.away_team||null,m.away_score||null,!!m.is_playoff]);
    }

    for (const tx of (doc.transactions||[])) {
      const ins = await rows(client, `INSERT INTO transactions(year,date_text) VALUES($1,$2) RETURNING id`, [y, tx.date||null]);
      const txId = ins[0].id;
      for (const e of (tx.entries||[])) {
        await up(client, `INSERT INTO transaction_entries(transaction_id,type,team,player,faab)
          VALUES($1,$2,$3,$4,$5)`, [txId, e.type||null, e.team||null, e.player||null, e.faab||null]);
      }
    }

    for (const d of (doc.draft||[])) {
      await up(client, `INSERT INTO draft_picks(year,round,overall,team,player,player_nfl,keeper)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [y,d.round||null,d.overall||null,d.team||null,d.player||null,d.player_nfl||null, !!d.keeper]);
    }
  }

  await client.end();
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ imported_years: years }) };
};
