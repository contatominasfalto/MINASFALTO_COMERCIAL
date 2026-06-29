import "dotenv/config";
import { Client } from "pg";

const table = process.argv[2];

if (!table) {
  console.error("Uso: node scripts/inspect-crti-table.mjs schema.tabela");
  process.exit(1);
}

function quoteIdentifierPath(identifierPath) {
  return identifierPath
    .split(".")
    .map((part) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
        throw new Error(`Nome de tabela CRTI invalido: ${identifierPath}`);
      }
      return `"${part}"`;
    })
    .join(".");
}

const tableName = table.includes(".") ? table.split(".").at(-1) : table;
const schemaName = table.includes(".") ? table.split(".").at(0) : "public";

const client = new Client({
  host: process.env.CRTI_HOST,
  port: Number(process.env.CRTI_PORT || 5432),
  database: process.env.CRTI_DATABASE,
  user: process.env.CRTI_USER,
  password: process.env.CRTI_PASSWORD,
  ssl: { rejectUnauthorized: process.env.CRTI_SSL_REJECT_UNAUTHORIZED === "true" },
  connectionTimeoutMillis: 10_000,
});

await client.connect();

try {
  const columns = await client.query(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schemaName, tableName],
  );
  const count = await client.query(`SELECT COUNT(*)::int AS total FROM ${quoteIdentifierPath(table)}`);
  const sample = await client.query(`SELECT * FROM ${quoteIdentifierPath(table)} LIMIT 3`);

  console.log(
    JSON.stringify(
      {
        table,
        total: count.rows[0]?.total ?? 0,
        columns: columns.rows,
        sample: sample.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
