import type mysql from "mysql2/promise";
import { getMysqlPool } from "./db";

const MODULE_LABELS: Record<string, string> = {
  pedidos: "Comercial", contatos: "Comercial", historico: "Comercial", atividadesComerciais: "Comercial",
  estoque: "Estoque", pedidosObras: "Custo Obras", despesasTabelaGeral: "Custo Obras",
  licitacoes: "Licitações", alimentacao: "Alimentação", userManagement: "Controle de Usuários",
  crti: "Integração CRTI", auth: "Autenticação",
};

const SECRET_KEYS = /password|senha|secret|token|authorization|cookie/i;
let schemaPromise: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaPromise) schemaPromise = (async () => {
    const pool = await getMysqlPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS \`system_audit_log\` (
      \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY, \`occurredAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`userId\` int NULL, \`username\` varchar(64) NULL, \`displayName\` varchar(255) NULL,
      \`module\` varchar(80) NOT NULL, \`action\` varchar(80) NOT NULL, \`procedurePath\` varchar(180) NOT NULL,
      \`entityType\` varchar(100) NULL, \`entityId\` varchar(100) NULL, \`description\` varchar(500) NOT NULL,
      \`result\` enum('success','error') NOT NULL, \`ipAddress\` varchar(64) NULL, \`userAgent\` varchar(500) NULL,
      \`inputData\` text NULL, \`errorMessage\` text NULL,
      KEY \`system_audit_date_idx\` (\`occurredAt\`), KEY \`system_audit_user_idx\` (\`userId\`), KEY \`system_audit_module_idx\` (\`module\`)
    )`);
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[limite de profundidade]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, SECRET_KEYS.test(key) ? "[PROTEGIDO]" : sanitize(item, depth + 1)]));
  if (typeof value === "string" && value.length > 3000) return `${value.slice(0, 3000)}…`;
  return value;
}

function identity(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const nested = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {};
  return data.id ?? data.pedidoId ?? data.licitacaoId ?? data.adesaoId ?? data.pedido ?? nested.id ?? null;
}

export async function recordAudit(event: {
  path: string; input?: unknown; user?: any; result: "success" | "error"; error?: unknown;
  ipAddress?: string | null; userAgent?: string | null;
}) {
  try {
    await ensureSchema();
    const pool = await getMysqlPool();
    const [root, ...segments] = event.path.split(".");
    const action = segments.at(-1) || root;
    const entityId = identity(event.input);
    const module = MODULE_LABELS[root] || root;
    const description = `${event.result === "success" ? "Operação concluída" : "Falha na operação"}: ${action}`;
    await pool.execute(`INSERT INTO \`system_audit_log\`
      (\`userId\`,\`username\`,\`displayName\`,\`module\`,\`action\`,\`procedurePath\`,\`entityType\`,\`entityId\`,\`description\`,\`result\`,\`ipAddress\`,\`userAgent\`,\`inputData\`,\`errorMessage\`)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      event.user?.id || null, event.user?.username || null, event.user?.name || null, module, action, event.path,
      segments.length > 1 ? segments.at(-2) : root, entityId == null ? null : String(entityId), description, event.result,
      event.ipAddress || null, event.userAgent?.slice(0, 500) || null,
      event.input === undefined ? null : JSON.stringify(sanitize(event.input)),
      event.error instanceof Error ? event.error.message.slice(0, 4000) : event.error ? String(event.error).slice(0, 4000) : null,
    ]);
  } catch (error) {
    console.error("[Rastreabilidade] Não foi possível registrar o evento:", error);
  }
}

export async function listAudit(filters: { search?: string; module?: string; result?: string; start?: string; end?: string; page: number; pageSize: number }) {
  await ensureSchema();
  const pool = await getMysqlPool();
  const where: string[] = ["1=1"];
  const values: unknown[] = [];
  if (filters.search) { where.push("(\`username\` LIKE ? OR \`displayName\` LIKE ? OR \`action\` LIKE ? OR \`description\` LIKE ? OR \`entityId\` LIKE ?)"); const q = `%${filters.search}%`; values.push(q,q,q,q,q); }
  if (filters.module) { where.push("\`module\` = ?"); values.push(filters.module); }
  if (filters.result) { where.push("\`result\` = ?"); values.push(filters.result); }
  if (filters.start) { where.push("\`occurredAt\` >= ?"); values.push(`${filters.start} 00:00:00`); }
  if (filters.end) { where.push("\`occurredAt\` <= ?"); values.push(`${filters.end} 23:59:59`); }
  const clause = where.join(" AND ");
  const [countRows] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) total FROM \`system_audit_log\` WHERE ${clause}`, values);
  const offset = (filters.page - 1) * filters.pageSize;
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT * FROM \`system_audit_log\` WHERE ${clause} ORDER BY \`occurredAt\` DESC, \`id\` DESC LIMIT ? OFFSET ?`, [...values, filters.pageSize, offset]);
  const [modules] = await pool.query<mysql.RowDataPacket[]>("SELECT DISTINCT `module` FROM `system_audit_log` ORDER BY `module`");
  return { items: rows, total: Number(countRows[0]?.total || 0), modules: modules.map((row) => String(row.module)) };
}
