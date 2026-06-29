import "dotenv/config";
import { Client } from "pg";

const pedido = process.argv[2] || "5503";

const client = new Client({
  host: process.env.CRTI_HOST,
  port: Number(process.env.CRTI_PORT || 5432),
  database: process.env.CRTI_DATABASE,
  user: process.env.CRTI_USER,
  password: process.env.CRTI_PASSWORD,
  ssl: process.env.CRTI_SSL === "false"
    ? false
    : { rejectUnauthorized: process.env.CRTI_SSL_REJECT_UNAUTHORIZED === "true" },
  connectionTimeoutMillis: 10_000,
  query_timeout: 60_000,
});

function quoteIdentifierPath(schema, table) {
  return `"${schema.replaceAll('"', '""')}"."${table.replaceAll('"', '""')}"`;
}

await client.connect();

try {
  const { rows: tables } = await client.query(
    `
      SELECT table_schema, table_name,
        array_agg(column_name ORDER BY ordinal_position) AS columns
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      GROUP BY table_schema, table_name
      HAVING bool_or(column_name IN ('pedido', 'numeropedido'))
      ORDER BY table_schema, table_name
    `,
  );

  for (const table of tables) {
    const columns = Array.isArray(table.columns)
      ? table.columns
      : String(table.columns || "").replace(/[{}]/g, "").split(",").filter(Boolean);
    const pedidoColumn = columns.includes("pedido") ? "pedido" : "numeropedido";
    const interestingColumns = columns.filter((column) =>
      [
        "pedido",
        "numeropedido",
        "situacao",
        "situacaopedido",
        "cliente",
        "nomecliente",
        "tipopedido",
        "tipo",
        "total_semtol",
        "saldo_semtol",
        "perc_semtol",
        "total_comtol",
        "saldo_comtol",
        "perc_comtol",
        "data",
        "datapedido",
        "descricao",
        "material",
        "numero_saida",
        "quantidade",
        "valorunitariomaterial",
        "valortotalliquido",
        "valortotalbruto",
        "datahorasaida",
      ].includes(column),
    );

    const tableName = quoteIdentifierPath(table.table_schema, table.table_name);
    const selectColumns = interestingColumns.map((column) => `"${column}"`).join(", ");
    const query = `
      SELECT ${selectColumns}
      FROM ${tableName}
      WHERE "${pedidoColumn}"::text = $1
      LIMIT 10
    `;

    try {
      const { rows } = await client.query(query, [pedido]);
      if (rows.length > 0) {
        console.log(`\n${table.table_schema}.${table.table_name}`);
        console.table(rows);
      }
    } catch (error) {
      console.warn(`Falha ao consultar ${table.table_schema}.${table.table_name}: ${error.message}`);
    }
  }
} finally {
  await client.end().catch(() => undefined);
}
