import "dotenv/config";
import mysql from "mysql2/promise";

const REQUIRED_TABLES = [
  "users",
  "pedidos",
  "historico",
  "contatos",
  "sincronizacaoCrti",
];

const REQUIRED_COLUMNS = {
  users: ["id", "openId", "name", "email", "loginMethod", "role", "profile", "createdAt", "updatedAt", "lastSignedIn"],
  pedidos: [
    "id",
    "dataPedido",
    "cliente",
    "pedido",
    "situacao",
    "qtde",
    "valorUnit",
    "totalPedido",
    "saldo",
    "percentual",
    "prioridade",
    "qtdeGranel",
    "qtdeTapFacil",
    "status",
    "dataEntrega",
    "observacoes",
    "criadoEm",
    "atualizadoEm",
  ],
  historico: ["id", "pedidoId", "pedidoNum", "campo", "valorAnterior", "valorNovo", "usuario", "dataHora"],
  contatos: ["id", "pedidoId", "pedidoNum", "tipo", "descricao", "dataContato", "usuario"],
  sincronizacaoCrti: [
    "id",
    "pedidoId",
    "pedidoNum",
    "tipoPedido",
    "statusCrti",
    "statusLocal",
    "dataImportacao",
    "dataUltimaSincronizacao",
  ],
};

const EXPECTED_NON_ENUM_COLUMNS = [
  ["pedidos", "status"],
  ["contatos", "tipo"],
  ["sincronizacaoCrti", "statusLocal"],
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

let connection;
const errors = [];
const warnings = [];

try {
  connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    connectTimeout: Number.parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000", 10),
  });

  const [databaseRows] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRows?.[0]?.databaseName || "(desconhecido)";
  const [tableRows] = await connection.query("SHOW TABLES");
  const tableNames = tableRows.map((row) => String(Object.values(row)[0]));
  const tableNamesLower = new Map(tableNames.map((name) => [name.toLowerCase(), name]));

  console.log(`Banco atual: ${databaseName}`);
  console.log(`Tabelas encontradas: ${tableNames.join(", ") || "(nenhuma)"}`);

  for (const table of REQUIRED_TABLES) {
    if (tableNames.includes(table)) continue;

    const caseInsensitiveMatch = tableNamesLower.get(table.toLowerCase());
    if (caseInsensitiveMatch) {
      const message = `Tabela ${table} encontrada como ${caseInsensitiveMatch}.`;
      if (process.platform === "win32") {
        warnings.push(`${message} No Windows isso costuma funcionar, mas na hospedagem Linux o nome deve ser exatamente ${table}.`);
      } else {
        errors.push(`${message} Renomeie/crie com o nome exato ${table}.`);
      }
      continue;
    }

    errors.push(`Tabela ausente: ${table}`);
  }

  for (const [table, expectedColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const actualTable = tableNames.includes(table) ? table : tableNamesLower.get(table.toLowerCase());
    if (!actualTable) continue;

    const [columns] = await connection.query(`SHOW COLUMNS FROM \`${actualTable}\``);
    const columnMap = new Map(columns.map((column) => [column.Field, column]));

    for (const column of expectedColumns) {
      if (!columnMap.has(column)) {
        errors.push(`Coluna ausente: ${table}.${column}`);
      }
    }
  }

  for (const [table, column] of EXPECTED_NON_ENUM_COLUMNS) {
    const actualTable = tableNames.includes(table) ? table : tableNamesLower.get(table.toLowerCase());
    if (!actualTable) continue;

    const [columns] = await connection.query(`SHOW COLUMNS FROM \`${actualTable}\` LIKE ?`, [column]);
    const type = String(columns?.[0]?.Type || "");
    if (!type) continue;

    if (type.toLowerCase().startsWith("enum(")) {
      errors.push(`Coluna ${table}.${column} ainda esta como ENUM. Rode npm run db:repair na hospedagem.`);
    } else if (!type.toLowerCase().startsWith("varchar(")) {
      warnings.push(`Coluna ${table}.${column} esta como ${type}; esperado varchar.`);
    }
  }

  if (warnings.length > 0) {
    console.log("\nAvisos:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (errors.length > 0) {
    console.error("\nProblemas encontrados:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log("\nSchema MySQL OK para esta versao do codigo.");
} catch (error) {
  console.error("Falha ao conferir schema MySQL.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await connection?.end();
}
