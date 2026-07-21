import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  host: process.env.CRTI_HOST,
  port: Number(process.env.CRTI_PORT || 5432),
  database: process.env.CRTI_DATABASE,
  user: process.env.CRTI_USER,
  password: process.env.CRTI_PASSWORD,
  ssl: { rejectUnauthorized: process.env.CRTI_SSL_REJECT_UNAUTHORIZED === "true" },
  connectionTimeoutMillis: 10_000,
  query_timeout: 60_000,
});

const terms = [
  "%conta%",
  "%pagar%",
  "%receber%",
  "%documento%",
  "%fornecedor%",
  "%cliente%",
];

await client.connect();

try {
  const tables = await client.query(
    `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND (
          lower(table_name) LIKE $1
          OR lower(table_name) LIKE $2
          OR lower(table_name) LIKE $3
          OR lower(table_name) LIKE $4
          OR lower(table_name) LIKE $5
          OR lower(table_name) LIKE $6
        )
      ORDER BY table_schema, table_name
      LIMIT 200
    `,
    terms,
  );

  const columns = await client.query(
    `
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND (
          lower(column_name) LIKE $1
          OR lower(column_name) LIKE $2
          OR lower(column_name) LIKE $3
          OR lower(column_name) LIKE $4
          OR lower(column_name) LIKE $5
          OR lower(column_name) LIKE $6
          OR lower(column_name) LIKE '%complemento%'
          OR lower(column_name) LIKE '%emissao%'
          OR lower(column_name) LIKE '%vencimento%'
        )
      ORDER BY table_schema, table_name, ordinal_position
      LIMIT 300
    `,
    terms,
  );

  console.log(JSON.stringify({ tables: tables.rows, columns: columns.rows }, null, 2));
} finally {
  await client.end();
}
