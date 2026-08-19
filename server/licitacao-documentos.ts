import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

export const LICITACOES_DOCUMENTOS_ROOT = process.env.LICITACOES_DOCUMENTOS_ROOT
  || "\\\\SERVIDOR\\Dados\\Minasfalto_Licitacoes";

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

export async function ensureLicitacaoDocumentFolder(value: string) {
  const folderPath = validateLicitacaoDocumentPath(value);
  await mkdir(folderPath, { recursive: true });
  await access(folderPath);
  return folderPath;
}

export async function inspectLicitacaoDocumentFolder(value: string) {
  const folderPath = validateLicitacaoDocumentPath(value);
  try {
    await access(folderPath);
  } catch {
    return { path: folderPath, exists: false, entries: [] as Array<{ name: string; type: "folder" | "file" }> };
  }
  const entries = await readdir(folderPath, { withFileTypes: true });
  return {
    path: folderPath,
    exists: true,
    entries: entries
      .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "folder" as const : "file" as const }))
      .sort((left, right) => left.type === right.type
        ? left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" })
        : left.type === "folder" ? -1 : 1),
  };
}
