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
    const [supplierColumns] = await connection.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='compras_fornecedores' AND column_name IN ('fornecedor_nota','fornecedor_item')"
    );
    const existingSupplierColumns = new Set(
      supplierColumns.map(row => row.COLUMN_NAME ?? row.column_name)
    );
    if (!existingSupplierColumns.has("fornecedor_nota"))
      await connection.query(
        "ALTER TABLE compras_fornecedores ADD COLUMN fornecedor_nota boolean NOT NULL DEFAULT true AFTER origem_planilha"
      );
    if (!existingSupplierColumns.has("fornecedor_item"))
      await connection.query(
        "ALTER TABLE compras_fornecedores ADD COLUMN fornecedor_item boolean NOT NULL DEFAULT false AFTER fornecedor_nota"
      );
    const [quoteColumns] = await connection.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='compras_orcamentos' AND column_name='prazo_entrega_padrao'"
    );
    if (!quoteColumns.length)
      await connection.query(
        "ALTER TABLE compras_orcamentos ADD COLUMN prazo_entrega_padrao varchar(120) NULL AFTER observacoes"
      );
    const [tables] = await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'compras_%' ORDER BY table_name");
    console.log("Estrutura criada e validada:");
    tables.forEach(row => console.log(`- ${row.TABLE_NAME ?? row.table_name}`));
  }
} finally { await connection.end(); }
