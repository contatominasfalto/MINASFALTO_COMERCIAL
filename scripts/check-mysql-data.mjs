import "dotenv/config";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

const tables = [
  "users",
  "pedidos",
  "historico",
  "contatos",
  "sincronizacaoCrti",
  "estoque_movimentacoes",
];

let connection;
const problems = [];

try {
  connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    connectTimeout: Number.parseInt(
      process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000",
      10,
    ),
  });

  const [[identity]] = await connection.query(`
    SELECT
      DATABASE() AS databaseName,
      CURRENT_USER() AS authenticatedUser,
      USER() AS connectedUser,
      VERSION() AS serverVersion
  `);

  console.log("=== Conexao usada pela aplicacao ===");
  console.log(`Banco: ${identity.databaseName}`);
  console.log(`Usuario autenticado: ${identity.authenticatedUser}`);
  console.log(`Origem da conexao: ${identity.connectedUser}`);
  console.log(`MySQL: ${identity.serverVersion}`);

  console.log("\n=== Leitura de todas as tabelas ===");
  for (const table of tables) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS total FROM \`${table}\``,
    );
    console.log(`${table}: ${Number(row.total)} registro(s)`);
  }

  const checks = [
    {
      label: "historico sem pedido correspondente",
      sql: `
        SELECT COUNT(*) AS total
        FROM historico h
        LEFT JOIN pedidos p ON p.id = h.pedidoId
        WHERE p.id IS NULL
      `,
    },
    {
      label: "contatos sem pedido correspondente",
      sql: `
        SELECT COUNT(*) AS total
        FROM contatos c
        LEFT JOIN pedidos p ON p.id = c.pedidoId
        WHERE p.id IS NULL
      `,
    },
    {
      label: "sincronizacoes com pedidoId invalido",
      sql: `
        SELECT COUNT(*) AS total
        FROM sincronizacaoCrti s
        LEFT JOIN pedidos p ON p.id = s.pedidoId
        WHERE s.pedidoId IS NOT NULL AND p.id IS NULL
      `,
    },
    {
      label: "numeros de pedido duplicados",
      sql: `
        SELECT COUNT(*) AS total
        FROM (
          SELECT pedido
          FROM pedidos
          GROUP BY pedido
          HAVING COUNT(*) > 1
        ) duplicados
      `,
    },
    {
      label: "movimentacoes com valores negativos",
      sql: `
        SELECT COUNT(*) AS total
        FROM estoque_movimentacoes
        WHERE estoque_inicial < 0
           OR producao_sacos < 0
           OR saida_sacos < 0
           OR entrada_granel_ton < 0
           OR saida_granel_ton < 0
      `,
    },
  ];

  console.log("\n=== Consistencia dos dados ===");
  for (const check of checks) {
    const [[row]] = await connection.query(check.sql);
    const total = Number(row.total);
    console.log(`${check.label}: ${total}`);
    if (total > 0) problems.push(`${check.label}: ${total}`);
  }

  const [[stockRange]] = await connection.query(`
    SELECT
      MIN(data_movimentacao) AS primeiraData,
      MAX(data_movimentacao) AS ultimaData,
      MAX(atualizado_em) AS ultimaAtualizacao
    FROM estoque_movimentacoes
  `);

  console.log("\n=== Estoque ===");
  console.log(`Primeira data: ${stockRange.primeiraData ?? "(sem dados)"}`);
  console.log(`Ultima data: ${stockRange.ultimaData ?? "(sem dados)"}`);
  console.log(
    `Ultima atualizacao: ${stockRange.ultimaAtualizacao ?? "(sem dados)"}`,
  );

  if (problems.length > 0) {
    console.error("\nDiagnostico concluido com inconsistencias:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(
      "\nDiagnostico MySQL OK: todas as tabelas foram lidas e as verificacoes passaram.",
    );
  }
} catch (error) {
  console.error("Falha no diagnostico geral do MySQL.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await connection?.end();
}
