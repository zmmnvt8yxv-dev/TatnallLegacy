const { Client } = require("pg");

exports.handler = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("SELECT year FROM seasons ORDER BY year ASC");
  await client.end();
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ years: rows.map(r => r.year) })
  };
};
