const { Client } = require("pg");

exports.handler = async (event) => {
  const year = parseInt((event.queryStringParameters || {}).year, 10);
  if (!year) return { statusCode: 400, body: "year required" };

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const q = async (sql, args=[]) => (await client.query(sql,args)).rows;

  const teams = await q("SELECT * FROM teams WHERE year=$1", [year]);
  const matchups = await q("SELECT * FROM matchups WHERE year=$1 ORDER BY week", [year]);
  const draft = await q("SELECT * FROM draft_picks WHERE year=$1 ORDER BY overall", [year]);

  const txRaw = await q(`
    SELECT t.id, t.date_text, e.type, e.team, e.player, e.faab
    FROM transactions t LEFT JOIN transaction_entries e ON e.transaction_id=t.id
    WHERE t.year=$1 ORDER BY t.id, e.id`, [year]);

  // group transactions
  const grouped = [];
  let cur = null, curId = null;
  for (const r of txRaw) {
    if (r.id !== curId) {
      if (cur) grouped.push(cur);
      curId = r.id;
      cur = { date: r.date_text, entries: [] };
    }
    if (r.type || r.team || r.player) {
      cur.entries.push({ type: r.type, team: r.team, player: r.player, faab: r.faab });
    }
  }
  if (cur) grouped.push(cur);

  await client.end();
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ year, teams, matchups, transactions: grouped, draft }) };
};
