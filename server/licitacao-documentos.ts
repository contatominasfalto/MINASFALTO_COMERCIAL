import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const LICITACOES_DOCUMENTOS_ROOT = process.env.LICITACOES_DOCUMENTOS_ROOT
  || "\\\\SERVIDOR\\Dados\\Minasfalto_Licitacoes";

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
const INVALID_WINDOWS_NAME = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function dateParts(value: string) {
  const text = String(value || "").trim().split("T")[0];
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { year: iso[1], folderDate: `${iso[1]}.${iso[2]}.${iso[3]}` };
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return { year: br[3], folderDate: `${br[3]}.${br[2]}.${br[1]}` };
  return null;
}

function cityFolderName(value: string) {
  const words = String(value || "").trim().toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean);
  const titled = words.map((word, index) => {
    if (index > 0 && ["da", "das", "de", "do", "dos", "e"].includes(word)) return word;
    return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
  }).join(" ");
  return titled.replace(/\s/, "_");
}

export function buildLicitacaoDocumentPath(data: string, cidade: string) {
  const parsed = dateParts(data);
  const city = cityFolderName(cidade);
  if (!parsed || !city) return "";
  return path.win32.join(LICITACOES_DOCUMENTOS_ROOT, parsed.year, `${parsed.folderDate}_${city}`);
}

export function validateLicitacaoDocumentPath(value: string) {
  const resolvedRoot = path.win32.resolve(LICITACOES_DOCUMENTOS_ROOT);
  const resolvedPath = path.win32.resolve(String(value || "").trim());
  const relative = path.win32.relative(resolvedRoot, resolvedPath);
  if (!value || relative.startsWith("..") || path.win32.isAbsolute(relative)) {
    throw new Error(`A pasta deve estar dentro de ${LICITACOES_DOCUMENTOS_ROOT}.`);
  }
  return resolvedPath;
}

function validateEntryName(value: string) {
  const name = String(value || "").trim();
  if (!name || name === "." || name === ".." || INVALID_WINDOWS_NAME.test(name)
    || RESERVED_WINDOWS_NAMES.test(name) || /[. ]$/.test(name)) {
    throw new Error("Nome de arquivo ou pasta inválido.");
  }
  return name;
}

function resolveWithinLicitacao(baseValue: string, relativeValue = "", entryName?: string) {
  const basePath = validateLicitacaoDocumentPath(baseValue);
  const normalizedRelative = String(relativeValue || "").replaceAll("/", "\\").trim();
  if (path.win32.isAbsolute(normalizedRelative)) throw new Error("Caminho relativo inválido.");
  const directoryPath = path.win32.resolve(basePath, normalizedRelative || ".");
  const relativeToBase = path.win32.relative(basePath, directoryPath);
  if (relativeToBase.startsWith("..") || path.win32.isAbsolute(relativeToBase)) {
    throw new Error("Acesso fora da pasta desta licitação não é permitido.");
  }
  if (!entryName) return { basePath, targetPath: directoryPath };
  return { basePath, targetPath: path.win32.join(directoryPath, validateEntryName(entryName)) };
}

function relativeFromBase(basePath: string, targetPath: string) {
  return path.win32.relative(basePath, targetPath).replaceAll("\\", "/");
}

function mimeTypeFor(name: string) {
  const extension = path.win32.extname(name).toLowerCase();
  return ({
    ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  } as Record<string, string>)[extension] || "application/octet-stream";
}

export async function ensureLicitacaoDocumentFolder(value: string) {
  const folderPath = validateLicitacaoDocumentPath(value);
  await mkdir(folderPath, { recursive: true });
  await access(folderPath);
  return folderPath;
}

export async function inspectLicitacaoDocumentFolder(value: string, relativePath = "") {
  const resolved = resolveWithinLicitacao(value, relativePath);
  try {
    await access(resolved.targetPath);
  } catch {
    return { path: resolved.targetPath, relativePath: "", parentPath: null, exists: false, entries: [] };
  }
  const directoryStats = await stat(resolved.targetPath);
  if (!directoryStats.isDirectory()) throw new Error("O caminho informado não é uma pasta.");
  const entries = await readdir(resolved.targetPath, { withFileTypes: true });
  const detailedEntries = await Promise.all(entries.filter((entry) => !entry.isSymbolicLink()).map(async (entry) => {
    const entryPath = path.win32.join(resolved.targetPath, entry.name);
    const entryStats = await stat(entryPath);
    return {
      name: entry.name,
      type: entry.isDirectory() ? "folder" as const : "file" as const,
      size: entry.isFile() ? entryStats.size : null,
      modifiedAt: entryStats.mtime.toISOString(),
    };
  }));
  const currentRelative = relativeFromBase(resolved.basePath, resolved.targetPath);
  return {
    path: resolved.targetPath,
    relativePath: currentRelative,
    parentPath: currentRelative ? relativeFromBase(resolved.basePath, path.win32.dirname(resolved.targetPath)) : null,
    exists: true,
    entries: detailedEntries.sort((left, right) => left.type === right.type
      ? left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" })
      : left.type === "folder" ? -1 : 1),
  };
}

export async function createLicitacaoDocumentFolder(base: string, relativePath: string, name: string) {
  const resolved = resolveWithinLicitacao(base, relativePath, name);
  await mkdir(resolved.targetPath, { recursive: false });
  return { success: true };
}

export async function uploadLicitacaoDocument(base: string, relativePath: string, name: string, base64: string) {
  const resolved = resolveWithinLicitacao(base, relativePath, name);
  const content = Buffer.from(base64, "base64");
  if (!content.length) throw new Error("O arquivo está vazio.");
  if (content.length > MAX_DOCUMENT_SIZE) throw new Error("O arquivo excede o limite de 25 MB.");
  await writeFile(resolved.targetPath, content, { flag: "wx" });
  return { success: true };
}

export async function downloadLicitacaoDocument(base: string, relativePath: string, name: string) {
  const resolved = resolveWithinLicitacao(base, relativePath, name);
  const fileStats = await stat(resolved.targetPath);
  if (!fileStats.isFile()) throw new Error("O item selecionado não é um arquivo.");
  if (fileStats.size > MAX_DOCUMENT_SIZE) throw new Error("O arquivo excede o limite de download de 25 MB.");
  const content = await readFile(resolved.targetPath);
  return { name, mimeType: mimeTypeFor(name), base64: content.toString("base64") };
}

export async function renameLicitacaoDocument(base: string, relativePath: string, oldName: string, newName: string) {
  const source = resolveWithinLicitacao(base, relativePath, oldName);
  const destination = resolveWithinLicitacao(base, relativePath, newName);
  await rename(source.targetPath, destination.targetPath);
  return { success: true };
}

export async function deleteLicitacaoDocument(base: string, relativePath: string, name: string) {
  const resolved = resolveWithinLicitacao(base, relativePath, name);
  await rm(resolved.targetPath, { recursive: true, force: false });
  return { success: true };
}
