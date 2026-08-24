import "dotenv/config";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurado.");
const sql = await readFile(new URL("../drizzle/0026_controle_compras.sql", import.meta.url), "utf8");
const statements = sql.split("--> statement-breakpoint").map(v => v.trim()).filter(Boolean);
if (!apply) {
  console.log(`Estruturas previstas: ${statements.length}`);
  console.log("Diagnóstico concluído. Nada foi alterado. Use --apply para criar as tabelas.");
  process.exit(0);
}
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [[row]] = await connection.query("SELECT DATABASE() banco");
  console.log(`Banco de destino: ${row.banco}`);
  console.log(`Estruturas previstas: ${statements.length}`);
  {
    for (const statement of statements) await connection.query(statement);
    const [tables] = await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'compras_%' ORDER BY table_name");
    console.log("Estrutura criada e validada:");
    tables.forEach(row => console.log(`- ${row.TABLE_NAME ?? row.table_name}`));
  }
} finally { await connection.end(); }
