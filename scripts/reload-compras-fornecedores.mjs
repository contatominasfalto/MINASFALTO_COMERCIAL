import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import mysql from "mysql2/promise";
import unzipper from "unzipper";

const apply = process.argv.includes("--apply");
const fileIndex = process.argv.indexOf("--file");
const bundledFile = fileURLToPath(new URL("../fornecedores crti.zip", import.meta.url));
const file = path.resolve(fileIndex >= 0 ? process.argv[fileIndex + 1] : bundledFile);
if (!file) throw new Error("Informe o ZIP com --file <caminho>.");

const normalized = value => String(value ?? "").replace(/\s+/g, " ").trim();
const uppercase = value => normalized(value).toLocaleUpperCase("pt-BR");
const digits = value => normalized(value).replace(/\D/g, "");
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const limit = (value, size) => normalized(value).slice(0, size);
const joinAddress = address => limit([
  [address?.endereco, address?.numero].filter(Boolean).join(", "),
  address?.complemento,
  address?.bairroDistrito,
  address?.cep ? `CEP ${digits(address.cep)}` : "",
  [address?.nomeCidade, address?.siglaEstado].filter(Boolean).join("/"),
  address?.nomePais,
].map(uppercase).filter(Boolean).join(" - "), 500);

const archiveBuffer = await readFile(file);
const archive = await unzipper.Open.buffer(archiveBuffer);
const xmlEntries = archive.files
  .filter(entry => entry.type === "File" && entry.path.toLocaleLowerCase().endsWith(".xml"))
  .sort((a, b) => a.path.localeCompare(b.path));
if (!xmlEntries.length) throw new Error("O ZIP não contém arquivos XML.");

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});
const suppliers = [];
for (const entry of xmlEntries) {
  const parsed = parser.parse((await entry.buffer()).toString("utf8"));
  const records = array(parsed?.importacaoFornecedores?.fornecedores?.fornecedor);
  if (!records.length) throw new Error(`Nenhum fornecedor encontrado em ${entry.path}.`);
  for (const record of records) {
    if (String(record?.tipo?.fornecedor).toLocaleLowerCase() !== "true") continue;
    const codigo = normalized(record.codigo);
    const razaoSocial = uppercase(record.razaoSocial || record.nomeFantasia);
    const documento = digits(record.cnpj || record.cpf);
    if (!codigo || !razaoSocial)
      throw new Error(`Fornecedor incompleto em ${entry.path}: código e razão social são obrigatórios.`);
    suppliers.push({
      codigo,
      razaoSocial,
      nome: limit(`${codigo} - ${razaoSocial}`, 180),
      documento: limit(documento, 30),
      telefone: limit(digits(record?.contato?.telefone), 80),
      email: limit(uppercase(record?.contato?.email), 180),
      endereco: joinAddress(record.enderecoPrincipal),
      ativo: String(record?.tipo?.bloqueado).toLocaleLowerCase() !== "true",
      arquivo: entry.path,
    });
  }
}

const duplicate = (values, label) => {
  const seen = new Set();
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) throw new Error(`${label} duplicado no XML: ${value}`);
    seen.add(value);
  }
};
duplicate(suppliers.map(item => item.codigo), "Código CRTI");
duplicate(suppliers.map(item => item.documento), "CPF/CNPJ");
duplicate(suppliers.map(item => item.nome), "Nome do fornecedor");

const report = {
  modo: apply ? "APPLY" : "DRY_RUN",
  arquivo: path.basename(file),
  sha256: createHash("sha256").update(archiveBuffer).digest("hex"),
  xmls: xmlEntries.length,
  fornecedores: suppliers.length,
  ativos: suppliers.filter(item => item.ativo).length,
  bloqueados: suppliers.filter(item => !item.ativo).length,
  comDocumento: suppliers.filter(item => item.documento).length,
  comTelefone: suppliers.filter(item => item.telefone).length,
  comEmail: suppliers.filter(item => item.email).length,
  comEndereco: suppliers.filter(item => item.endereco).length,
};
console.log(JSON.stringify(report, null, 2));
if (!apply) {
  console.log("Nenhum dado foi alterado. Use --apply após revisar o diagnóstico.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [current] = await connection.query(`
    SELECT f.id,f.nome,f.documento,f.telefone,f.email,f.endereco,f.ativo,
      f.origem_planilha origemPlanilha,f.fornecedor_nota fornecedorNota,
      f.fornecedor_item fornecedorItem,
      (SELECT COUNT(*) FROM compras_orcamentos o WHERE o.fornecedor_escolhido_id=f.id) referenciasOrcamentos,
      (SELECT COUNT(*) FROM compras_orcamento_ofertas x WHERE x.fornecedor_id=f.id) referenciasOfertas
    FROM compras_fornecedores f ORDER BY f.id
  `);
  const backupFile = path.join(os.tmpdir(), `backup-compras-fornecedores-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(backupFile, JSON.stringify(current, null, 2), "utf8");
  console.log(`Backup criado em: ${backupFile}`);

  const noteSuppliers = current.filter(item => Boolean(item.fornecedorNota));
  const byDocument = new Map();
  const byName = new Map();
  for (const item of noteSuppliers) {
    const document = digits(item.documento);
    if (document) {
      if (byDocument.has(document)) throw new Error(`CPF/CNPJ duplicado no banco: ${document}`);
      byDocument.set(document, item);
    }
    for (const name of [uppercase(item.nome), uppercase(item.nome).replace(/^\d+\s*-\s*/, "")]) {
      if (name && !byName.has(name)) byName.set(name, item);
    }
  }
  const matchedIds = new Set();
  const assignments = suppliers.map(source => {
    const match = (source.documento && byDocument.get(source.documento)) ||
      byName.get(source.nome) || byName.get(source.razaoSocial);
    if (match && matchedIds.has(Number(match.id)))
      throw new Error(`Mais de um XML corresponde ao fornecedor ${match.nome}.`);
    if (match) matchedIds.add(Number(match.id));
    return { source, match };
  });
  const stale = noteSuppliers.filter(item => !matchedIds.has(Number(item.id)));

  await connection.beginTransaction();
  for (const item of stale) {
    const references = Number(item.referenciasOrcamentos) + Number(item.referenciasOfertas);
    if (Boolean(item.fornecedorItem) || references > 0) {
      await connection.execute("UPDATE compras_fornecedores SET fornecedor_nota=FALSE WHERE id=?", [item.id]);
    } else {
      await connection.execute("DELETE FROM compras_fornecedores WHERE id=?", [item.id]);
    }
  }
  for (const { match } of assignments) {
    if (match)
      await connection.execute("UPDATE compras_fornecedores SET nome=CONCAT('__CRTI_TEMP_',id) WHERE id=?", [match.id]);
  }
  for (const { source, match } of assignments) {
    const values = [source.nome, source.documento || null, source.telefone || null, source.email || null, source.endereco || null, source.ativo];
    if (match) {
      await connection.execute(
        "UPDATE compras_fornecedores SET nome=?,documento=?,telefone=?,email=?,endereco=?,ativo=?,origem_planilha=TRUE,fornecedor_nota=TRUE WHERE id=?",
        [...values, match.id]
      );
    } else {
      await connection.execute(
        "INSERT INTO compras_fornecedores(nome,documento,telefone,email,endereco,ativo,origem_planilha,fornecedor_nota,fornecedor_item) VALUES(?,?,?,?,?,?,TRUE,TRUE,FALSE)",
        values
      );
    }
  }
  const [[verification]] = await connection.query(`
    SELECT COUNT(*) total,
      SUM(fornecedor_nota=TRUE AND origem_planilha=TRUE) fornecedoresCrti,
      SUM(fornecedor_item=TRUE) marcasPreservadas
    FROM compras_fornecedores
  `);
  if (Number(verification.fornecedoresCrti) !== suppliers.length)
    throw new Error(`Falha na verificação da carga: ${JSON.stringify(verification)}`);
  await connection.commit();
  console.log(JSON.stringify({
    concluido: true,
    atualizados: matchedIds.size,
    inseridos: suppliers.length - matchedIds.size,
    antigosRemovidos: stale.filter(item => !Boolean(item.fornecedorItem) && Number(item.referenciasOrcamentos) + Number(item.referenciasOfertas) === 0).length,
    antigosPreservadosNoHistorico: stale.filter(item => Boolean(item.fornecedorItem) || Number(item.referenciasOrcamentos) + Number(item.referenciasOfertas) > 0).length,
    fornecedoresCrti: Number(verification.fornecedoresCrti),
    marcasPreservadas: Number(verification.marcasPreservadas),
    backup: backupFile,
  }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
