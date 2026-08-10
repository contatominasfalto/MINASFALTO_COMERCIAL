import "dotenv/config";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurado.");

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() banco");
  const database = String(databaseRow?.banco || "");
  if (!database) throw new Error("Nenhum banco selecionado no DATABASE_URL.");
  if (database === "minasfalto_alimentacao") {
    throw new Error("Operação bloqueada: o destino não pode ser o banco legado.");
  }

  const sql = await readFile(new URL("../drizzle/0016_controle_alimentacao.sql", import.meta.url), "utf8");
  const statements = sql.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean);

  console.log(`Banco de destino: ${database}`);
  console.log(`Tabelas previstas: ${statements.length}`);
  if (!apply) {
    console.log("Diagnóstico concluído. Nenhuma tabela foi criada. Use --apply para confirmar.");
    process.exit(0);
  }

  for (const statement of statements) await connection.query(statement);

  const exclusionColumns = [
    ["alimentacao_funcionarios", "excluido_em", "timestamp NULL"],
    ["alimentacao_funcionarios", "excluido_por", "varchar(120) NULL"],
    ["alimentacao_funcionarios", "motivo_exclusao", "varchar(500) NULL"],
    ["alimentacao_fornecedores", "excluido_em", "timestamp NULL"],
    ["alimentacao_fornecedores", "excluido_por", "varchar(120) NULL"],
    ["alimentacao_fornecedores", "motivo_exclusao", "varchar(500) NULL"],
  ];
  for (const [table, column, definition] of exclusionColumns) {
    const [[existingColumn]] = await connection.query(
      `SELECT COUNT(*) total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
      [table, column]
    );
    if (!Number(existingColumn?.total || 0)) {
      await connection.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
      );
    }
  }

  const [tables] = await connection.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name LIKE 'alimentacao_%'
    ORDER BY table_name
  `);
  const names = tables.map(row => row.TABLE_NAME ?? row.table_name);
  if (names.length !== 5) throw new Error(`Estrutura incompleta: encontradas ${names.length} de 5 tabelas.`);
  console.log("Estrutura do Controle de Alimentação criada e validada:");
  names.forEach(name => console.log(`- ${name}`));
} finally {
  await connection.end();
}
