import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
const fileArg = process.argv.find((value, index, args) => index > 1 && !value.startsWith("--") && args[index - 1] !== "--file");
const fileFlag = process.argv.indexOf("--file");
const bundledFile = fileURLToPath(new URL("../data/compras/carga-inicial-compras.xlsx", import.meta.url));
const file = fileFlag >= 0 ? process.argv[fileFlag + 1] : fileArg || bundledFile;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurado.");

const buffer = await readFile(file);
const hash = createHash("sha256").update(buffer).digest("hex");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const cells = [];
const suppliers = new Map();
const materials = new Map();
const ignored = /^(total|valor|data|material|materiais|fornecedor|fornecedores|telefone|endereço|observa|quantidade|qtd|preço|cotação|compras|nome)$/i;
const normalized = value => String(value ?? "").replace(/\s+/g, " ").trim();
const cellText = cell => {
  try {
    if (cell.type === ExcelJS.ValueType.Merge && !cell.master?.value) return "";
    const value = cell.value;
    if (value && typeof value === "object") {
      if ("result" in value && value.result != null) return normalized(value.result);
      if ("text" in value && value.text != null) return normalized(value.text);
      if ("richText" in value) return normalized(value.richText.map(part => part.text).join(""));
    }
    return normalized(value);
  } catch { return ""; }
};

for (const sheet of workbook.worksheets) {
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    row.eachCell({ includeEmpty: false }, cell => {
      const text = cellText(cell);
      if (text) cells.push({ sheet: sheet.name, address: cell.address, value: text, formula: typeof cell.value === "object" && cell.value?.formula ? cell.value.formula : null });
      values.push(text);
    });
    const textValues = values.filter(Boolean);
    if (/^planilha2$/i.test(sheet.name) && textValues.length) {
      const name = textValues[0];
      if (name.length >= 2 && !ignored.test(name)) suppliers.set(name.toLocaleUpperCase("pt-BR"), { nome: name, telefone: textValues[1] || null, endereco: textValues.slice(2).join(" | ") || null });
    }
    const numericCount = values.filter(v => /^-?[\d.,]+$/.test(v)).length;
    const candidate = textValues.find(v => v.length >= 3 && v.length <= 300 && !ignored.test(v) && !/^\d+[\d.,\s]*(kg|l|m|sc)?$/i.test(v));
    if (candidate && numericCount > 0 && !/^planilha2$/i.test(sheet.name)) materials.set(candidate.toLocaleUpperCase("pt-BR"), { descricao: candidate, categoria: sheet.name });
  });
}

const report = { modo: apply ? "APPLY" : "DRY_RUN", arquivo: file, hash, abas: workbook.worksheets.length, celulas: cells.length, fornecedores: suppliers.size, materiaisCandidatos: materials.size };
console.log(JSON.stringify(report, null, 2));
if (!apply) { console.log("Nenhum dado foi alterado. Revise o diagnóstico e use --apply."); process.exit(0); }

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [[schema]] = await connection.query("SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='compras_importacoes'");
  if (!Number(schema.total)) throw new Error("Estrutura ausente. Execute npm run compras:schema -- --apply antes da carga.");
  const [[existing]] = await connection.query("SELECT id,status FROM compras_importacoes WHERE hash_arquivo=?", [hash]);
  if (existing) { console.log(`Planilha já importada no lote ${existing.id}. Nenhum dado duplicado.`); process.exit(0); }
  await connection.beginTransaction();
  const [lot] = await connection.execute("INSERT INTO compras_importacoes(arquivo,hash_arquivo,status,importado_por) VALUES(?,?,'PROCESSANDO','Migração')", [file, hash]);
  for (const supplier of suppliers.values()) await connection.execute("INSERT INTO compras_fornecedores(nome,telefone,endereco,origem_planilha) VALUES(?,?,?,TRUE) ON DUPLICATE KEY UPDATE telefone=COALESCE(VALUES(telefone),telefone),endereco=COALESCE(VALUES(endereco),endereco)", [supplier.nome, supplier.telefone, supplier.endereco]);
  for (const material of materials.values()) await connection.execute("INSERT INTO compras_materiais(descricao,categoria,origem_planilha) VALUES(?,?,TRUE) ON DUPLICATE KEY UPDATE categoria=COALESCE(categoria,VALUES(categoria))", [material.descricao, material.categoria]);
  for (let index = 0; index < cells.length; index += 400) {
    const chunk = cells.slice(index, index + 400);
    const placeholders = chunk.map(() => "(?,?,?,?,?)").join(",");
    await connection.query(`INSERT INTO compras_importacao_celulas(importacao_id,aba,celula,valor,formula) VALUES ${placeholders}`, chunk.flatMap(cell => [lot.insertId, cell.sheet, cell.address, cell.value, cell.formula]));
  }
  await connection.execute("UPDATE compras_importacoes SET status='CONCLUIDA',resumo=? WHERE id=?", [JSON.stringify(report), lot.insertId]);
  await connection.commit();
  console.log(`Carga concluída no lote ${lot.insertId}, sem duplicar registros existentes.`);
} catch (error) { await connection.rollback(); throw error; } finally { await connection.end(); }
