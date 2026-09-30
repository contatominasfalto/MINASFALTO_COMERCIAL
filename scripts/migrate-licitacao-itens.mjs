import "dotenv/config";
import mysql from "mysql2/promise";
import { readFile, stat } from "node:fs/promises";

const apply = process.argv.includes("--apply");
const backupIndex = process.argv.indexOf("--backup");
if (apply) {
  const backup = backupIndex >= 0 ? process.argv[backupIndex + 1] : undefined;
  if (!backup || !(await stat(backup)).isFile() || (await stat(backup)).size === 0)
    throw new Error("Informe --backup CAMINHO de um backup MySQL já concluído e validado.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 10000 });
try {
  const [[target]] = await connection.query("SELECT DATABASE() banco");
  const [columns] = await connection.query("SHOW COLUMNS FROM licitacoes LIKE 'itensJson'");
  const [[count]] = await connection.query("SELECT COUNT(*) total FROM licitacoes");
  console.log(`Banco: ${target.banco}. Licitações existentes: ${count.total}.`);
  if (columns.length) {
    if (columns[0].Type.toLowerCase() !== "text" || columns[0].Null !== "YES")
      throw new Error("A coluna itensJson já existe com uma definição diferente. Revisão necessária.");
    console.log("Coluna itensJson já está correta. Nenhuma alteração necessária.");
  } else if (!apply) {
    console.log("DRY-RUN: adicionar coluna itensJson TEXT NULL. Nenhum dado será atualizado. Nada foi alterado.");
  } else {
    const sql = await readFile(new URL("../drizzle/0027_licitacao_itens.sql", import.meta.url), "utf8");
    await connection.query(sql);
    const [after] = await connection.query("SHOW COLUMNS FROM licitacoes LIKE 'itensJson'");
    if (after.length !== 1) throw new Error("A coluna não foi confirmada após a migração.");
    console.log("Coluna adicionada. Registros históricos permanecem sem conversão.");
  }
} finally { await connection.end(); }
