import "dotenv/config";
import mysql from "mysql2/promise";
import { spawn } from "node:child_process";
import { access, mkdir, open, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Backup e correção explícitos, nunca executados na inicialização da aplicação.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const url = new URL(process.env.DATABASE_URL || "");
if (!["mysql:", "mysql2:"].includes(url.protocol)) throw new Error("DATABASE_URL deve apontar para MySQL.");
const database = decodeURIComponent(url.pathname.slice(1));
if (!database) throw new Error("Banco não informado no DATABASE_URL.");

function run(executable, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env, windowsHide: true, shell: false });
    let output = "";
    child.stdout.on("data", data => { output = (output + data).slice(-20000); });
    child.stderr.on("data", data => { output = (output + data).slice(-20000); });
    child.on("error", () => reject(new Error("Não foi possível executar a ferramenta de backup/migração.")));
    child.on("close", code => {
      // Evitar que uma ferramenta externa imprima credenciais em uma falha.
      const password = decodeURIComponent(url.password);
      const safeOutput = password ? output.split(password).join("[senha omitida]") : output;
      if (code !== 0) reject(new Error(`Ferramenta encerrou com código ${code}. ${safeOutput}`));
      else resolve(safeOutput);
    });
  });
}

async function findDump(baseDir) {
  const dirs = [path.join(baseDir, "bin"), baseDir, "C:/xampp/mysql/bin", "C:/laragon/bin/mysql"];
  dirs.push(...(process.env.PATH || "").split(path.delimiter).map(dir => dir.replace(/^"|"$/g, "")));
  for (const programDir of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)) {
    for (const child of await readdir(programDir, { withFileTypes: true }).catch(() => [])) {
      if (!child.isDirectory() || !/mysql|mariadb/i.test(child.name)) continue;
      const folder = path.join(programDir, child.name);
      dirs.push(path.join(folder, "bin"));
      for (const version of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
        if (version.isDirectory()) dirs.push(path.join(folder, version.name, "bin"));
      }
    }
  }
  const names = process.platform === "win32" ? ["mariadb-dump.exe", "mysqldump.exe"] : ["mariadb-dump", "mysqldump"];
  for (const dir of dirs.filter(Boolean)) for (const name of names) {
    const candidate = path.resolve(dir, name);
    try { await access(candidate); if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  throw new Error("Ferramenta mysqldump/mariadb-dump não encontrada. Nenhuma alteração foi aplicada ao banco.");
}

let connection;
try {
  connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 10000 });
  const [[target]] = await connection.query("SELECT DATABASE() banco, @@basedir baseDir");
  if (target.banco !== database) throw new Error("Banco conectado diferente do configurado. Operação interrompida.");
  const [engines] = await connection.query("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND ENGINE <> 'InnoDB'");
  if (engines.length) throw new Error("Há tabelas fora do InnoDB. É necessário um backup com bloqueio/manutenção; nenhuma migração foi aplicada.");
  const [[count]] = await connection.query("SELECT COUNT(*) total FROM licitacoes");
  const dump = await findDump(target.baseDir);
  console.log(`Banco: ${database}. Licitações: ${count.total}. Ferramenta de backup localizada.`);
  console.log(await run(process.execPath, ["scripts/migrate-licitacao-itens.mjs"]));
  if (!apply) {
    console.log("DRY-RUN concluído. Para criar o backup e corrigir a coluna, execute com --apply.");
  } else {
    const backupDir = process.env.MINASFALTO_BACKUP_DIR || (process.platform === "win32"
      ? path.join(process.env.SystemDrive || "C:", "Backups", "Minasfalto")
      : path.join(path.dirname(root), "backups-minasfalto"));
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const filename = `${database.replace(/[^a-zA-Z0-9_-]/g, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.sql`;
    const backup = path.resolve(backupDir, filename);
    const partial = `${backup}.partial`;
    await (await open(partial, "wx", 0o600)).close();
    const version = String(await run(dump, ["--version"]));
    const args = ["--no-defaults", `--host=${url.hostname}`, `--port=${url.port || 3306}`,
      `--user=${decodeURIComponent(url.username)}`, "--single-transaction", "--quick", "--routines", "--events", "--triggers",
      "--hex-blob", "--default-character-set=utf8mb4", "--no-tablespaces", `--result-file=${partial}`];
    if (!/mariadb/i.test(version) && /(?:Ver|Distrib)\s+(?:8|9)\./i.test(version)) args.push("--column-statistics=0", "--set-gtid-purged=OFF");
    args.push(database);
    console.log("Criando backup completo. Aguarde; a migração ainda não foi aplicada.");
    await run(dump, args, { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) });
    const size = (await stat(partial)).size;
    if (!size) throw new Error("Backup vazio. Migração interrompida.");
    const file = await open(partial, "r");
    let tail;
    try {
      const buffer = Buffer.alloc(Math.min(size, 8192));
      await file.read(buffer, 0, buffer.length, size - buffer.length);
      tail = buffer.toString("utf8");
    } finally { await file.close(); }
    if (!tail.includes("-- Dump completed on")) throw new Error("Backup sem marcador de conclusão. Migração interrompida.");
    await rename(partial, backup);
    await writeFile(`${backup}.json`, JSON.stringify({ banco: database, criadoEm: new Date().toISOString(), bytes: size,
      licitacoesAntes: count.total, verificacao: "dump terminou com código zero, arquivo não vazio e marcador de conclusão", restauracaoTestada: false }, null, 2), { flag: "wx", mode: 0o600 });
    console.log(`Backup concluído e verificado: ${backup} (${size} bytes).`);
    console.log(await run(process.execPath, ["scripts/migrate-licitacao-itens.mjs", "--apply", "--backup", backup]));
    console.log(await run(process.execPath, ["scripts/migrate-licitacao-itens.mjs"]));
    console.log("CORREÇÃO CONCLUÍDA. Tente salvar a licitação e reabra para conferir os itens. Não é necessário reiniciar para adicionar esta coluna.");
  }
} catch (error) {
  const password = decodeURIComponent(url.password);
  const message = error instanceof Error ? error.message : String(error);
  console.error(password ? message.split(password).join("[senha omitida]") : message);
  process.exitCode = 1;
} finally { if (connection) await connection.end(); }
