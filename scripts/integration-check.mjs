import "dotenv/config";
import mysql from "mysql2/promise";
import { Client } from "pg";

const daysArg = Number.parseInt(process.argv[2] || process.env.CRTI_SYNC_DAYS || "120", 10);
const days = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 120;

function maskDatabaseUrl(value) {
  if (!value) return "(nao configurada)";

  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  }
}

async function checkMysql() {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      message: "DATABASE_URL nao configurada.",
    };
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      uri: process.env.DATABASE_URL,
      connectTimeout: Number.parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000", 10),
    });

    const [databaseRows] = await connection.query("SELECT DATABASE() AS databaseName");
    const databaseName = databaseRows?.[0]?.databaseName || "(desconhecido)";
    const [tableRows] = await connection.query("SHOW TABLES");
    const tables = tableRows.map((row) => Object.values(row)[0]);

    return {
      ok: true,
      message: `MySQL OK. Banco atual: ${databaseName}`,
      databaseUrl: maskDatabaseUrl(process.env.DATABASE_URL),
      tables,
    };
  } catch (error) {
    return {
      ok: false,
      message: `MySQL falhou: ${error instanceof Error ? error.message : String(error)}`,
      databaseUrl: maskDatabaseUrl(process.env.DATABASE_URL),
    };
  } finally {
    await connection?.end();
  }
}

async function checkCrti() {
  const required = ["CRTI_HOST", "CRTI_DATABASE", "CRTI_USER", "CRTI_PASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `CRTI incompleto. Variaveis ausentes: ${missing.join(", ")}`,
    };
  }

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

  try {
    await client.connect();
    const tableName = process.env.CRTI_TABLE_APROVADOS || "public.pedidos_venda_material";
    const summary = await client.query(
      `
        SELECT tipopedido, situacaopedido, COUNT(DISTINCT numeropedido)::int AS total
        FROM ${quoteIdentifierPath(tableName)}
        WHERE UPPER(tipopedido) LIKE '%TAPF%'
          AND (UPPER(tipopedido) LIKE '%SC%' OR UPPER(tipopedido) LIKE '%GRANEL%')
          AND datapedido >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
          AND (UPPER(situacaopedido) LIKE 'APROV%' OR UPPER(situacaopedido) LIKE 'CONCLU%')
        GROUP BY tipopedido, situacaopedido
        ORDER BY total DESC
      `,
      [days],
    );
    const obrasSummary = await client.query(
      `
        SELECT tipopedido, situacaopedido, COUNT(DISTINCT numeropedido)::int AS total
        FROM ${quoteIdentifierPath(tableName)}
        WHERE (
            ${normalizeSql("tipopedido")} LIKE '%MATERIAL%OBRAS%PROPRIAS%'
            OR ${normalizeSql("tipopedido")} LIKE '%MATERIAL%OBRA%PROPRIA%'
            OR ${normalizeSql("tipopedido")} LIKE '%OBRAS%PROPRIAS%'
          )
          AND ${normalizeSql("situacaopedido")} IN ('APROVADO', 'CONCLUIDO', 'CANCELADO')
        GROUP BY tipopedido, situacaopedido
        ORDER BY total DESC
      `,
    );

    return {
      ok: true,
      message: `CRTI OK. Pedidos TapFacil e Obras encontrados.`,
      table: tableName,
      summary: summary.rows,
      obrasSummary: obrasSummary.rows,
    };
  } catch (error) {
    return {
      ok: false,
      message: `CRTI falhou: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function quoteIdentifierPath(identifierPath) {
  return identifierPath
    .split(".")
    .map((part) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
        throw new Error(`Nome de tabela invalido: ${identifierPath}`);
      }
      return `"${part}"`;
    })
    .join(".");
}

function normalizeSql(field) {
  return `TRANSLATE(UPPER(${field}), 'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ', 'AAAAEEEIIIOOOOUUUC')`;
}

const [mysqlResult, crtiResult] = await Promise.all([checkMysql(), checkCrti()]);

console.log("\n=== Diagnostico de Integracao ===\n");
console.log(mysqlResult.message);
if (mysqlResult.databaseUrl) console.log(`DATABASE_URL: ${mysqlResult.databaseUrl}`);
if (mysqlResult.tables) console.log(`Tabelas MySQL: ${mysqlResult.tables.join(", ") || "(nenhuma)"}`);

console.log("");
console.log(crtiResult.message);
if (crtiResult.table) console.log(`Tabela CRTI: ${crtiResult.table}`);
if (crtiResult.summary) console.table(crtiResult.summary);
if (crtiResult.obrasSummary) {
  console.log("\nResumo CRTI Obras:");
  console.table(crtiResult.obrasSummary);
}

if (!mysqlResult.ok || !crtiResult.ok) {
  process.exitCode = 1;
}
