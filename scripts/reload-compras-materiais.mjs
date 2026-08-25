import "dotenv/config";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
if (!file) throw new Error("Informe a planilha com --file <caminho>.");

const normalized = value =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const uppercase = value => normalized(value).toLocaleUpperCase("pt-BR");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(file));
const sheet = workbook.getWorksheet("Materiais") || workbook.worksheets[0];
if (!sheet) throw new Error("A planilha nao possui abas.");

const headers = [1, 2, 3, 4].map(column => uppercase(sheet.getCell(1, column).value));
if (
  !headers[0].includes("CÓDIGO") ||
  !headers[1].includes("DESCRIÇÃO") ||
  !headers[3].includes("GRUPO")
) {
  throw new Error(`Cabecalhos inesperados: ${headers.join(" | ")}`);
}

const materials = [];
const descriptions = new Set();
for (let row = 2; row <= sheet.rowCount; row++) {
  const code = normalized(sheet.getCell(row, 1).value);
  const description = normalized(sheet.getCell(row, 2).value);
  const sourceUnit = uppercase(sheet.getCell(row, 3).value);
  const category = uppercase(sheet.getCell(row, 4).value);
  if (!code && !description && !category) continue;
  if (!code || !description || !category)
    throw new Error(`Linha ${row} incompleta: codigo, descricao e grupo sao obrigatorios.`);
  const combinedDescription = uppercase(`${code} - ${description}`);
  if (combinedDescription.length > 300)
    throw new Error(`Descricao acima de 300 caracteres na linha ${row}.`);
  if (category.length > 120)
    throw new Error(`Categoria acima de 120 caracteres na linha ${row}.`);
  if (descriptions.has(combinedDescription))
    throw new Error(`Material duplicado na linha ${row}: ${combinedDescription}`);
  descriptions.add(combinedDescription);
  materials.push({
    descricao: combinedDescription,
    categoria: category,
    unidade: sourceUnit === "LT" ? "LT" : "UN",
  });
}

const report = {
  modo: apply ? "APPLY" : "DRY_RUN",
  arquivo: path.basename(file),
  aba: sheet.name,
  materiais: materials.length,
  categorias: new Set(materials.map(item => item.categoria)).size,
  unidades: materials.reduce(
    (result, item) => ({ ...result, [item.unidade]: (result[item.unidade] || 0) + 1 }),
    {}
  ),
};
console.log(JSON.stringify(report, null, 2));
if (!apply) {
  console.log("Nenhum dado foi alterado. Use --apply apos revisar o diagnostico.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurada.");

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [currentMaterials] = await connection.query(
    "SELECT id,descricao,categoria,unidade,ativo,origem_planilha origemPlanilha,criado_em criadoEm,atualizado_em atualizadoEm FROM compras_materiais ORDER BY id"
  );
  const backupFile = path.join(
    os.tmpdir(),
    `backup-compras-materiais-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await writeFile(backupFile, JSON.stringify(currentMaterials, null, 2), "utf8");
  console.log(`Backup criado em: ${backupFile}`);

  await connection.beginTransaction();
  await connection.execute("DELETE FROM compras_materiais");
  for (let index = 0; index < materials.length; index += 400) {
    const chunk = materials.slice(index, index + 400);
    const placeholders = chunk.map(() => "(?,?,?,TRUE,TRUE)").join(",");
    await connection.query(
      `INSERT INTO compras_materiais(descricao,categoria,unidade,ativo,origem_planilha) VALUES ${placeholders}`,
      chunk.flatMap(item => [item.descricao, item.categoria, item.unidade])
    );
  }
  const [[verification]] = await connection.query(
    "SELECT COUNT(*) total,COUNT(DISTINCT descricao) descricoes,COUNT(DISTINCT categoria) categorias,SUM(unidade='LT') litros FROM compras_materiais"
  );
  if (
    Number(verification.total) !== materials.length ||
    Number(verification.descricoes) !== materials.length
  ) {
    throw new Error(`Falha na verificacao da carga: ${JSON.stringify(verification)}`);
  }
  await connection.commit();
  console.log(
    JSON.stringify(
      {
        concluido: true,
        removidos: currentMaterials.length,
        inseridos: Number(verification.total),
        categorias: Number(verification.categorias),
        litros: Number(verification.litros),
        backup: backupFile,
      },
      null,
      2
    )
  );
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
