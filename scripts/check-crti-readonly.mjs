import "dotenv/config";
import { Client } from "pg";

const tables = [
  process.env.CRTI_TABLE_APROVADOS || "public.pedidos_venda_material",
  process.env.CRTI_TABLE_CONCLUIDOS || "public.pedidos_venda_material",
];

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
  const availableTables = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);

  for (const table of tables) {
    const tableName = table.includes(".") ? table.split(".").at(-1) : table;
    const schemaName = table.includes(".") ? table.split(".").at(0) : "public";
    const columns = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
      `,
      [schemaName, tableName],
    );

    if (columns.rows.length === 0) {
      console.log(
        JSON.stringify({
          table,
          exists: false,
          availableTables: availableTables.rows,
        }),
      );
      continue;
    }

    const count = await client.query(`SELECT COUNT(*)::int AS total FROM ${quoteIdentifierPath(table)}`);

    console.log(
      JSON.stringify({
        table,
        exists: true,
        total: count.rows[0]?.total ?? 0,
        columns: columns.rows.map((row) => row.column_name),
      }),
    );
  }
} finally {
  await client.end();
}
