import { eq, and, or, like, desc, asc, isNull, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { Client, type ClientConfig } from "pg";
import {
  InsertUser,
  users,
  pedidos,
  pedidoAtividades,
  pedidosObras,
  historico,
  contatos,
  sincronizacaoCrti,
  sincronizacaoCrtiObras,
  estoqueMovimentacoes,
  pedidoObraFinanceiro,
  pedidoObraDespesas,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;
let _dbUrl: string | null = null;
let _pool: mysql.Pool | null = null;
let _licitacaoAdesoesSchemaPromise: Promise<void> | null = null;
let _licitacaoPregaoAlertSchemaPromise: Promise<void> | null = null;
let _pedidoAtividadesSchemaPromise: Promise<void> | null = null;

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}

function quoteCrtiIdentifierPath(identifierPath: string) {
  const parts = identifierPath.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Nome de tabela CRTI invalido.");
  return parts.map((part) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
      throw new Error(`Nome de tabela CRTI invalido: ${identifierPath}`);
    }
    return `"${part}"`;
  }).join(".");
}

async function withCrtiLicitacaoClient<T>(callback: (client: Client) => Promise<T>) {
  if (!process.env.CRTI_PASSWORD) {
    throw new Error("Credenciais CRTI nao configuradas.");
  }

  const config: ClientConfig = {
    host: process.env.CRTI_HOST || "minasfaltocrtierp.postgres.database.azure.com",
    port: Number.parseInt(process.env.CRTI_PORT || "5432", 10),
    database: process.env.CRTI_DATABASE || "postgres",
    user: process.env.CRTI_USER || "minasfaltocrtierpadmin",
    password: process.env.CRTI_PASSWORD,
    connectionTimeoutMillis: 15000,
  };

  if (envFlag("CRTI_SSL", true)) {
    config.ssl = { rejectUnauthorized: envFlag("CRTI_SSL_REJECT_UNAUTHORIZED", false) };
  }

  const client = new Client(config);
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  if (_db && _dbUrl === databaseUrl) {
    return _db;
  }

  if (_pool && _dbUrl !== databaseUrl) {
    await _pool.end().catch(() => undefined);
    _pool = null;
    _db = null;
    _licitacaoAdesoesSchemaPromise = null;
    _licitacaoPregaoAlertSchemaPromise = null;
    _pedidoAtividadesSchemaPromise = null;
  }

  if (!_db) {
    try {
      const connectTimeout = Number.parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000", 10);
      _pool = mysql.createPool({
        uri: databaseUrl,
        waitForConnections: true,
        connectionLimit: Number.parseInt(process.env.MYSQL_CONNECTION_LIMIT || "5", 10),
        queueLimit: 0,
        connectTimeout: Number.isFinite(connectTimeout) ? connectTimeout : 8000,
      });
      _db = drizzle(_pool as any);
      _dbUrl = databaseUrl;
    } catch (error) {
      console.warn("[Database] Failed to initialize:", error);
      _pool = null;
      _db = null;
      _dbUrl = null;
    }
  }
  return _db;
}

/** Pool compartilhado para módulos que precisam de transações SQL explícitas. */
export async function getMysqlPool() {
  await getDb();
  if (!_pool) throw new Error("Banco de dados não configurado.");
  return _pool;
}

async function ensurePedidoAtividadesSchema() {
  const pool = await getMysqlPool();
  if (!_pedidoAtividadesSchemaPromise) {
    _pedidoAtividadesSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS pedido_atividades (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        pedidoId int NULL,
        pedidoNum varchar(50) NULL,
        cliente varchar(255) NULL,
        descricao text NOT NULL,
        criadoPor varchar(100) DEFAULT 'Sistema',
        criadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX pedido_atividades_pedido_idx (pedidoId),
        INDEX pedido_atividades_data_idx (criadoEm)
      )
    `).then(() => pool.query(`
      ALTER TABLE pedido_atividades
        MODIFY COLUMN pedidoId int NULL,
        MODIFY COLUMN pedidoNum varchar(50) NULL,
        MODIFY COLUMN cliente varchar(255) NULL
    `)).then(() => pool.query(`
      UPDATE pedido_atividades
      SET pedidoId = NULL, pedidoNum = NULL, cliente = NULL
      WHERE pedidoId IS NOT NULL OR pedidoNum IS NOT NULL OR cliente IS NOT NULL
    `)).then(() => undefined).catch((error) => {
      _pedidoAtividadesSchemaPromise = null;
      throw error;
    });
  }
  await _pedidoAtividadesSchemaPromise;
}

function shouldUseDemoData() {
  const hasLocalLogin =
    Boolean(process.env.LOCAL_LOGIN_ADMFULL) ||
    Boolean(process.env.LOCAL_LOGIN_COMERCIAL) ||
    Boolean(process.env.LOCAL_LOGIN_SUBCOMERCIAL) ||
    Boolean(process.env.LOCAL_LOGIN_GERENCIA) ||
    Boolean(process.env.LOCAL_LOGIN_DIRETORIA);

  return !process.env.DATABASE_URL && (
    process.env.LOCAL_AUTH_BYPASS === "true" ||
    hasLocalLogin
  );
}

function normalizePrioridade(value: unknown) {
  return value === "PRIORIDADE" ? "PRIORIDADE" : "NORMAL";
}

const STATUS_SAIDA_OK = "SA\u00cdDA OK";
const STATUS_SAIDA_OK_VARIANTS = [
  STATUS_SAIDA_OK,
  "SAIDA OK",
  "SA\u00c3\u008dDA OK",
  "SA\u00c3\u0192\u00c2\u008dDA OK",
];
function normalizeStatus(value: unknown) {
  const text = String(value || "").toUpperCase();
  if (text === "CANCELADO") return "CANCELADO";
  if (text.includes("SA") && text.includes("OK")) return STATUS_SAIDA_OK;
  return "PENDENTE";
}

let demoPedidos: any[] = [
  { id: 1, pedido: "5143", dataPedido: "23/01/2026", cliente: "CONSTRUTORA SINARCO LTDA", status: "PENDENTE", prioridade: "NORMAL", qtde: 250, qtdeTapFacil: 50, qtdeGranel: 0, totalPedido: 5500, saldo: 1100, dataEntrega: "", situacao: "Aprovado", valorUnit: 22, percentual: 80, observacoes: "" },
  { id: 2, pedido: "5260", dataPedido: "12/02/2026", cliente: "CONSTRUTORA SINARCO LTDA", status: "PENDENTE", prioridade: "NORMAL", qtde: 2000, qtdeTapFacil: 400, qtdeGranel: 0, totalPedido: 44000, saldo: 8800, dataEntrega: "", situacao: "Aprovado", valorUnit: 22, percentual: 80, observacoes: "" },
  { id: 3, pedido: "5308", dataPedido: "25/02/2026", cliente: "PREFEITURA MUNICIPAL DE SÃO GONÇALO DO RIO ABAIXO", status: "PENDENTE", prioridade: "NORMAL", qtde: 1500, qtdeTapFacil: 940, qtdeGranel: 0, totalPedido: 37500, saldo: 23500, dataEntrega: "", situacao: "Aprovado", valorUnit: 25, percentual: 37.33, observacoes: "" },
  { id: 4, pedido: "5380", dataPedido: "10/03/2026", cliente: "FAUSTO ALEXANDRE DE AQUINO", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 48, qtdeTapFacil: 24, qtdeGranel: 0, totalPedido: 0, saldo: 672, dataEntrega: "11/03/2026", situacao: "Aprovado", valorUnit: 0, percentual: 0, observacoes: "" },
  { id: 5, pedido: "5421", dataPedido: "17/03/2026", cliente: "PLASCAR INDUSTRIA DE COMPONENTES PLASTICOS", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 60, qtdeTapFacil: 60, qtdeGranel: 0, totalPedido: 1800, saldo: 1800, dataEntrega: "", situacao: "Aprovado", valorUnit: 30, percentual: 0, observacoes: "" },
  { id: 6, pedido: "5454", dataPedido: "23/03/2026", cliente: "EDSON ANTONIO AMARAL DE OLIVEIRA", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 4, qtdeTapFacil: 0, qtdeGranel: 0, totalPedido: 120, saldo: 0, dataEntrega: "23/03/2026", situacao: "Aprovado", valorUnit: 30, percentual: 100, observacoes: "" },
  { id: 7, pedido: "5455", dataPedido: "23/03/2026", cliente: "CONSORCIO MANUTENCAO GRBS AGUA/ESGOTO", status: "PENDENTE", prioridade: "NORMAL", qtde: 9, qtdeTapFacil: 0, qtdeGranel: 0, totalPedido: 5400, saldo: 0, dataEntrega: "", situacao: "Aprovado", valorUnit: 600, percentual: 100, observacoes: "" },
  { id: 8, pedido: "5457", dataPedido: "23/03/2026", cliente: "ENCEL ENGENHARIA DE CONSTRUCOES ELETRICAS LTDA", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 30, qtdeTapFacil: 0, qtdeGranel: 0, totalPedido: 900, saldo: 0, dataEntrega: "23/03/2026", situacao: "Aprovado", valorUnit: 30, percentual: 100, observacoes: "" },
  { id: 9, pedido: "5458", dataPedido: "23/03/2026", cliente: "PATRUS TRANSPORTES LTDA", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 30, qtdeTapFacil: 0, qtdeGranel: 0, totalPedido: 900, saldo: 0, dataEntrega: "25/03/2026", situacao: "Aprovado", valorUnit: 30, percentual: 100, observacoes: "" },
  { id: 10, pedido: "5459", dataPedido: "23/03/2026", cliente: "CONSTRUTORA LAGE & GOMES LTDA - EPP", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 150, qtdeTapFacil: 1, qtdeGranel: 0, totalPedido: 4400, saldo: 3280, dataEntrega: "26/03/2026", situacao: "Aprovado", valorUnit: 29.33, percentual: 25.45, observacoes: "" },
  { id: 11, pedido: "5460", dataPedido: "23/03/2026", cliente: "LUIZ HENRIQUE ALVES GUIMARÃES", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 1, qtdeTapFacil: 0, qtdeGranel: 0, totalPedido: 30, saldo: 0, dataEntrega: "23/03/2026", situacao: "Aprovado", valorUnit: 30, percentual: 100, observacoes: "" },
  { id: 12, pedido: "5461", dataPedido: "23/03/2026", cliente: "IVM PAVIMENTACAO E TRANSPORTE LTDA", status: "SAÍDA OK", prioridade: "NORMAL", qtde: 10, qtdeTapFacil: 0, qtdeGranel: 0, totalPedido: 250, saldo: 0, dataEntrega: "23/03/2026", situacao: "Aprovado", valorUnit: 25, percentual: 100, observacoes: "" },
];
let demoPedidoAtividades: any[] = [];

let demoHistorico = [
  { id: 1, pedidoId: 1, pedidoNum: "5143", campo: "Saldo (Atualização CRTI)", valorAnterior: "R$ 5.500,00", valorNovo: "R$ 1.100,00", usuario: "Sincronizador CRTI", dataHora: new Date("2026-05-20T14:38:51") },
  { id: 2, pedidoId: 1, pedidoNum: "5143", campo: "Qtde Tap Fácil (Atualização CRTI)", valorAnterior: "250 sacos", valorNovo: "50 sacos", usuario: "Sincronizador CRTI", dataHora: new Date("2026-05-20T14:38:51") },
];

const demoContatos = [
  { id: 1, pedidoId: 1, pedidoNum: "5143", tipo: "Ligação", descricao: "Cliente confirmou programação para entrega parcial.", usuario: "admfull", dataContato: new Date("2026-05-22T09:58:00") },
];

let demoPedidosObras: any[] = [
  {
    id: 1,
    pedido: "5962",
    dataPedido: "20/07/2026",
    cliente: "ASSOCIACAO DO RESIDENCIAL GRAN VILLE IGARAPE",
    status: "Aprovado",
    prioridade: "NORMAL",
    qtde: 0,
    qtdeTapFacil: 0,
    qtdeGranel: 0,
    valorUnit: 0,
    totalPedido: 0,
    saldo: 0,
    situacao: "Aprovado",
    observacoesPagamento: "",
    observacoes: "",
    observacoesOperador: "",
    condicaoPagamento: "",
    materiais: "Dados demonstrativos aguardando sincronizacao CRTI",
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  },
];

const HISTORICO_CAMPOS = [
  "cliente", "situacao", "qtde", "valorUnit", "totalPedido", "saldo",
  "percentual", "prioridade", "qtdeGranel", "qtdeTapFacil", "status",
  "dataEntrega", "observacoes"
];

const HISTORICO_NUMERIC_CAMPOS = new Set([
  "qtde",
  "valorUnit",
  "totalPedido",
  "saldo",
  "percentual",
  "qtdeGranel",
  "qtdeTapFacil",
]);

function formatHistoricoValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function historicoValuesEqual(campo: string, valorAnterior: unknown, valorNovo: unknown) {
  if (valorNovo === undefined) return true;

  if (HISTORICO_NUMERIC_CAMPOS.has(campo)) {
    const anterior = Number(valorAnterior ?? 0);
    const novo = Number(valorNovo ?? 0);
    if (Number.isFinite(anterior) && Number.isFinite(novo)) {
      return Math.abs(anterior - novo) < 0.0001;
    }
  }

  return formatHistoricoValue(valorAnterior) === formatHistoricoValue(valorNovo);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "username"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (user.profile !== undefined) {
      values.profile = user.profile;
      updateSet.profile = user.profile;
    }
    if (user.status !== undefined) {
      values.status = user.status;
      updateSet.status = user.status;
    }
    if (user.isProtected !== undefined) {
      values.isProtected = user.isProtected;
      updateSet.isProtected = user.isProtected;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────

export async function listPedidos(filters?: {
  status?: string;
  prioridade?: string;
  cliente?: string;
  pedido?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) return [];
    return demoPedidos.filter((pedido) => {
      const matchesStatus = !filters?.status || filters.status === "TODOS" || normalizeStatus(pedido.status) === filters.status;
      const matchesPrioridade = !filters?.prioridade || filters.prioridade === "TODOS" || normalizePrioridade(pedido.prioridade) === filters.prioridade;
      const search = filters?.search?.toLowerCase();
      const matchesSearch = !search || pedido.pedido.toLowerCase().includes(search) || pedido.cliente.toLowerCase().includes(search);
      return matchesStatus && matchesPrioridade && matchesSearch;
    });
  }

  let query: any = db.select().from(pedidos);
  const conditions: any[] = [];

  if (filters?.status && filters.status !== "TODOS") {
    const normalizedStatus = normalizeStatus(filters.status);
    if (normalizedStatus === STATUS_SAIDA_OK) {
      conditions.push(or(...STATUS_SAIDA_OK_VARIANTS.map((status) => eq(pedidos.status, status as any))));
    } else if (normalizedStatus === "PENDENTE") {
      conditions.push(or(eq(pedidos.status, "PENDENTE"), eq(pedidos.status, "" as any), isNull(pedidos.status)));
    } else if (normalizedStatus === "CANCELADO") {
      conditions.push(eq(pedidos.status, "CANCELADO"));
    } else {
      conditions.push(eq(pedidos.status, normalizedStatus as any));
    }
  }

  if (filters?.prioridade && filters.prioridade !== "TODOS") {
    if (filters.prioridade === "NORMAL") {
      conditions.push(or(eq(pedidos.prioridade, "NORMAL"), isNull(pedidos.prioridade)));
    } else {
      conditions.push(eq(pedidos.prioridade, filters.prioridade as any));
    }
  }

  if (filters?.cliente) {
    conditions.push(like(pedidos.cliente, `%${filters.cliente}%`));
  }

  if (filters?.pedido) {
    conditions.push(like(pedidos.pedido, `%${filters.pedido}%`));
  }

  if (filters?.search) {
    conditions.push(
      or(
        like(pedidos.pedido, `%${filters.search}%`),
        like(pedidos.cliente, `%${filters.search}%`)
      )
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query.orderBy(desc(pedidos.criadoEm));
}

export async function getPedidoById(id: number) {
  const db = await getDb();
  if (!db) return shouldUseDemoData() ? demoPedidos.find((pedido) => pedido.id === id) ?? null : null;

  const result = await db.select().from(pedidos).where(eq(pedidos.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPedidoByNumber(pedidoNum: string) {
  const db = await getDb();
  if (!db) return shouldUseDemoData() ? demoPedidos.find((pedido) => pedido.pedido === pedidoNum) ?? null : null;

  const result = await db.select().from(pedidos).where(eq(pedidos.pedido, pedidoNum)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createPedido(data: any) {
  const insertData = {
    ...data,
    prioridade: normalizePrioridade(data.prioridade),
    status: normalizeStatus(data.status),
  };

  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    const next = { id: Math.max(...demoPedidos.map((pedido) => pedido.id)) + 1, ...insertData };
    demoPedidos = [next, ...demoPedidos];
    return { insertId: next.id };
  }

  const result = await db.insert(pedidos).values({
    dataPedido: insertData.dataPedido,
    cliente: insertData.cliente,
    pedido: insertData.pedido,
    situacao: insertData.situacao || "Aprovado",
    qtde: insertData.qtde || 0,
    valorUnit: insertData.valorUnit || 0,
    totalPedido: insertData.totalPedido || 0,
    saldo: insertData.saldo || 0,
    percentual: insertData.percentual || 0,
    prioridade: insertData.prioridade,
    qtdeGranel: insertData.qtdeGranel || 0,
    qtdeTapFacil: insertData.qtdeTapFacil || 0,
    status: insertData.status,
    dataEntrega: insertData.dataEntrega || null,
    observacoes: insertData.observacoes || "",
  }) as any;

  return result;
}

export async function updatePedido(id: number, data: any, usuario: string = "Sistema") {
  const updateData = { ...data };
  if (usuario === "CRTI") {
    delete updateData.prioridade;
  } else if (updateData.prioridade === "" || updateData.prioridade === null) {
    updateData.prioridade = "NORMAL";
  }

  if (updateData.status !== undefined) {
    updateData.status = normalizeStatus(updateData.status);
  }

  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    const pedidoAtual = demoPedidos.find((pedido) => pedido.id === id);
    if (!pedidoAtual) throw new Error("Pedido não encontrado");

    let nextHistoricoId = Math.max(0, ...demoHistorico.map((item) => item.id || 0)) + 1;
    const novasAlteracoes = HISTORICO_CAMPOS
      .filter((campo) => !historicoValuesEqual(campo, (pedidoAtual as any)[campo], (updateData as any)[campo]))
      .map((campo) => ({
        id: nextHistoricoId++,
        pedidoId: id,
        pedidoNum: pedidoAtual.pedido,
        campo,
        valorAnterior: formatHistoricoValue((pedidoAtual as any)[campo]),
        valorNovo: formatHistoricoValue((updateData as any)[campo]),
        usuario,
        dataHora: new Date(),
      }));

    if (novasAlteracoes.length > 0) {
      demoHistorico = [...novasAlteracoes, ...demoHistorico];
    }

    demoPedidos = demoPedidos.map((pedido) => pedido.id === id ? { ...pedido, ...updateData } : pedido);
    return { affectedRows: 1, usuario };
  }

  const pedidoAtual = await getPedidoById(id);
  if (!pedidoAtual) throw new Error("Pedido não encontrado");

  // Registrar alterações no histórico
  for (const campo of HISTORICO_CAMPOS) {
    const valorAnterior = (pedidoAtual as any)[campo];
    const valorNovo = (updateData as any)[campo];
    
    if (!historicoValuesEqual(campo, valorAnterior, valorNovo)) {
      await db.insert(historico).values({
        pedidoId: id,
        pedidoNum: pedidoAtual.pedido,
        campo,
        valorAnterior: formatHistoricoValue(valorAnterior),
        valorNovo: formatHistoricoValue(valorNovo),
        usuario,
      });
    }
  }

  return db.update(pedidos).set({
    ...updateData,
    atualizadoEm: new Date(),
  }).where(eq(pedidos.id, id));
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1);
  return result[0];
}

export async function listPedidoAtividades() {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) return [];
    return demoPedidoAtividades.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  }

  await ensurePedidoAtividadesSchema();
  return db.select().from(pedidoAtividades)
    .orderBy(desc(pedidoAtividades.criadoEm), desc(pedidoAtividades.id));
}

export async function createPedidoAtividade(data: { descricao: string; criadoPor: string }) {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    const nextId = Math.max(0, ...demoPedidoAtividades.map((item) => item.id)) + 1;
    const atividade = {
      id: nextId,
      pedidoId: null,
      pedidoNum: null,
      cliente: null,
      descricao: data.descricao.trim(),
      criadoPor: data.criadoPor,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };
    demoPedidoAtividades.unshift(atividade);
    return atividade;
  }

  await ensurePedidoAtividadesSchema();
  const result = await db.insert(pedidoAtividades).values({
    pedidoId: null,
    pedidoNum: null,
    cliente: null,
    descricao: data.descricao.trim(),
    criadoPor: data.criadoPor,
  }) as any;
  return { id: Number(result?.[0]?.insertId ?? result?.insertId ?? 0) };
}

export async function updatePedidoAtividade(data: { id: number; descricao: string }) {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    demoPedidoAtividades = demoPedidoAtividades.map((atividade) =>
      atividade.id === data.id
        ? { ...atividade, descricao: data.descricao.trim(), atualizadoEm: new Date() }
        : atividade
    );
    return { affectedRows: 1 };
  }

  await ensurePedidoAtividadesSchema();
  return db.update(pedidoAtividades)
    .set({ descricao: data.descricao.trim(), atualizadoEm: new Date() })
    .where(eq(pedidoAtividades.id, data.id));
}

export async function deletePedidoAtividade(id: number) {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    demoPedidoAtividades = demoPedidoAtividades.filter((atividade) => atividade.id !== id);
    return { affectedRows: 1 };
  }

  await ensurePedidoAtividadesSchema();
  return db.delete(pedidoAtividades)
    .where(eq(pedidoAtividades.id, id));
}

export async function deletePedido(id: number) {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    demoPedidos = demoPedidos.filter((pedido) => pedido.id !== id);
    return { affectedRows: 1 };
  }

  // Deletar histórico e contatos relacionados
  await db.delete(historico).where(eq(historico.pedidoId, id));
  await db.delete(contatos).where(eq(contatos.pedidoId, id));
  await db.delete(sincronizacaoCrti).where(eq(sincronizacaoCrti.pedidoId, id));

  return db.delete(pedidos).where(eq(pedidos.id, id));
}

// PEDIDOS OBRAS
export async function listPedidosObras(filters?: {
  status?: string;
  prioridade?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.trunc(filters?.page || 1));
  const pageSize = Math.min(200, Math.max(10, Math.trunc(filters?.pageSize || 50)));
  const offset = (page - 1) * pageSize;

  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) {
      return { items: [], total: 0, page, pageSize, totalPages: 1 };
    }
    const filtered = demoPedidosObras.filter((pedido) => {
      const matchesStatus = !filters?.status || filters.status === "TODOS" || pedido.status === filters.status;
      const matchesPrioridade = !filters?.prioridade || filters.prioridade === "TODOS" || normalizePrioridade(pedido.prioridade) === filters.prioridade;
      const search = filters?.search?.toLowerCase();
      const matchesSearch = !search || String(pedido.pedido).toLowerCase().includes(search) || String(pedido.cliente).toLowerCase().includes(search);
      return matchesStatus && matchesPrioridade && matchesSearch;
    });
    const total = filtered.length;
    return {
      items: filtered.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  const whereSql: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.status && filters.status !== "TODOS") {
    const normalizedStatus = String(filters.status).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedStatus.toLowerCase() === "concluido") {
      whereSql.push("status IN (?, ?)");
      params.push("Concluido", "Concluído");
    } else {
      whereSql.push("status = ?");
      params.push(filters.status);
    }
  }

  if (filters?.prioridade && filters.prioridade !== "TODOS") {
    whereSql.push("prioridade = ?");
    params.push(normalizePrioridade(filters.prioridade));
  }

  if (filters?.search) {
    whereSql.push("(pedido LIKE ? OR cliente LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const whereClause = whereSql.length > 0 ? `WHERE ${whereSql.join(" AND ")}` : "";
  const [countRows] = await _pool!.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM pedidos_obras ${whereClause}`,
    params,
  );

  const total = Number(countRows[0]?.total) || 0;
  const [items] = await _pool!.query<mysql.RowDataPacket[]>(
    `
      SELECT
        po.id,
        po.dataPedido,
        po.cliente,
        po.pedido,
        po.situacao,
        po.qtde,
        po.qtdeTapFacil,
        po.qtdeGranel,
        po.valorUnit,
        COALESCE(por.totalReceitas, 0) AS totalPedido,
        (
          COALESCE(por.totalReceitas, 0)
          - (COALESCE(por.totalNfeReceitas, 0) * (COALESCE(pof.porcentagemImposto, 17) / 100))
          - COALESCE(pod.totalDespesas, 0)
          - COALESCE(poc.totalCustos, 0)
        ) AS saldo,
        po.prioridade,
        po.status,
        po.observacoesPagamento,
        po.observacoes,
        po.observacoesOperador,
        po.condicaoPagamento,
        po.materiais,
        po.criadoEm,
        po.atualizadoEm
      FROM pedidos_obras po
      LEFT JOIN pedido_obra_financeiro pof ON pof.pedidoObraId = po.id
      LEFT JOIN (
        SELECT
          pedidoNum,
          SUM(COALESCE(valorTotalDocumento, valor, 0)) AS totalReceitas,
          SUM(CASE WHEN status = 'Nfe' THEN COALESCE(valorTotalDocumento, valor, 0) ELSE 0 END) AS totalNfeReceitas
        FROM pedido_obra_receitas
        GROUP BY pedidoNum
      ) por ON por.pedidoNum = po.pedido
      LEFT JOIN (
        SELECT pedidoNum, SUM(COALESCE(valorTotalDocumento, 0)) AS totalDespesas
        FROM pedido_obra_despesas
        GROUP BY pedidoNum
      ) pod ON pod.pedidoNum = po.pedido
      LEFT JOIN (
        SELECT pedidoNum, SUM(COALESCE(valorTotal, 0)) AS totalCustos
        FROM pedido_obra_custos
        GROUP BY pedidoNum
      ) poc ON poc.pedidoNum = po.pedido
      ${whereClause}
      ORDER BY po.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset],
  );

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function exportPedidosObras(filters?: {
  status?: string;
  prioridade?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db || !_pool) {
    return [];
  }

  const whereSql: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.status && filters.status !== "TODOS") {
    const normalizedStatus = String(filters.status).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedStatus.toLowerCase() === "concluido") {
      whereSql.push("status IN (?, ?)");
      params.push("Concluido", "Concluí­do");
    } else {
      whereSql.push("status = ?");
      params.push(filters.status);
    }
  }

  if (filters?.prioridade && filters.prioridade !== "TODOS") {
    whereSql.push("prioridade = ?");
    params.push(normalizePrioridade(filters.prioridade));
  }

  if (filters?.search) {
    whereSql.push("(pedido LIKE ? OR cliente LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const whereClause = whereSql.length > 0 ? `WHERE ${whereSql.join(" AND ")}` : "";
  const [items] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        po.id,
        po.dataPedido,
        po.cliente,
        po.pedido,
        po.situacao,
        po.qtde,
        po.qtdeTapFacil,
        po.qtdeGranel,
        po.valorUnit,
        COALESCE(por.totalReceitas, 0) AS totalPedido,
        (
          COALESCE(por.totalReceitas, 0)
          - (COALESCE(por.totalNfeReceitas, 0) * (COALESCE(pof.porcentagemImposto, 17) / 100))
          - COALESCE(pod.totalDespesas, 0)
          - COALESCE(poc.totalCustos, 0)
        ) AS saldo,
        po.prioridade,
        po.status,
        po.condicaoPagamento,
        po.materiais,
        po.criadoEm,
        po.atualizadoEm
      FROM pedidos_obras po
      LEFT JOIN pedido_obra_financeiro pof ON pof.pedidoObraId = po.id
      LEFT JOIN (
        SELECT
          pedidoNum,
          SUM(COALESCE(valorTotalDocumento, valor, 0)) AS totalReceitas,
          SUM(CASE WHEN status = 'Nfe' THEN COALESCE(valorTotalDocumento, valor, 0) ELSE 0 END) AS totalNfeReceitas
        FROM pedido_obra_receitas
        GROUP BY pedidoNum
      ) por ON por.pedidoNum = po.pedido
      LEFT JOIN (
        SELECT pedidoNum, SUM(COALESCE(valorTotalDocumento, 0)) AS totalDespesas
        FROM pedido_obra_despesas
        GROUP BY pedidoNum
      ) pod ON pod.pedidoNum = po.pedido
      LEFT JOIN (
        SELECT pedidoNum, SUM(COALESCE(valorTotal, 0)) AS totalCustos
        FROM pedido_obra_custos
        GROUP BY pedidoNum
      ) poc ON poc.pedidoNum = po.pedido
      ${whereClause}
      ORDER BY po.id DESC
    `,
    params,
  );

  return items;
}

export async function getPedidoObraByNumber(pedidoNum: string) {
  const db = await getDb();
  if (!db) return shouldUseDemoData() ? demoPedidosObras.find((pedido) => pedido.pedido === pedidoNum) ?? null : null;

  const result = await db.select().from(pedidosObras).where(eq(pedidosObras.pedido, pedidoNum)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPedidoObraById(id: number) {
  const db = await getDb();
  if (!db) return shouldUseDemoData() ? demoPedidosObras.find((pedido) => Number(pedido.id) === id) ?? null : null;

  const result = await db.select().from(pedidosObras).where(eq(pedidosObras.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertPedidoObraFromCrti(data: {
  dataPedido: string;
  cliente: string;
  pedido: string;
  situacao: string;
  qtde: number;
  qtdeTapFacil: number;
  qtdeGranel: number;
  valorUnit: number;
  totalPedido: number;
  saldo: number;
  status: string;
  condicaoPagamento?: string;
  materiais?: string;
}) {
  const db = await getDb();
  const values = {
    dataPedido: data.dataPedido,
    cliente: data.cliente,
    pedido: data.pedido,
    situacao: data.situacao,
    qtde: String(data.qtde),
    qtdeTapFacil: String(data.qtdeTapFacil),
    qtdeGranel: String(data.qtdeGranel),
    valorUnit: String(data.valorUnit),
    totalPedido: String(data.totalPedido),
    saldo: String(data.saldo),
    prioridade: "NORMAL" as const,
    status: data.status,
    condicaoPagamento: data.condicaoPagamento || "",
    materiais: data.materiais || "",
  };

  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    const existing = demoPedidosObras.find((pedido) => pedido.pedido === data.pedido);
    if (existing) {
      Object.assign(existing, values, { atualizadoEm: new Date() });
      return { affectedRows: 1 };
    }
    const next = {
      id: Math.max(0, ...demoPedidosObras.map((pedido) => pedido.id || 0)) + 1,
      ...values,
      observacoesPagamento: "",
      observacoes: "",
      observacoesOperador: "",
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };
    demoPedidosObras = [next, ...demoPedidosObras];
    return { insertId: next.id };
  }

  return db.insert(pedidosObras).values(values).onDuplicateKeyUpdate({
    set: {
      dataPedido: values.dataPedido,
      cliente: values.cliente,
      situacao: values.situacao,
      qtde: values.qtde,
      qtdeTapFacil: values.qtdeTapFacil,
      qtdeGranel: values.qtdeGranel,
      valorUnit: values.valorUnit,
      totalPedido: values.totalPedido,
      saldo: values.saldo,
      status: values.status,
      condicaoPagamento: values.condicaoPagamento,
      materiais: values.materiais,
      atualizadoEm: new Date(),
    },
  });
}

export async function updatePedidoObraObservacoes(
  id: number,
  data: {
    observacoesPagamento?: string;
    observacoes?: string;
    observacoesOperador?: string;
  },
) {
  const values: Record<string, unknown> = { atualizadoEm: new Date() };
  if (data.observacoesPagamento !== undefined) values.observacoesPagamento = data.observacoesPagamento;
  if (data.observacoes !== undefined) values.observacoes = data.observacoes;
  if (data.observacoesOperador !== undefined) values.observacoesOperador = data.observacoesOperador;

  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    demoPedidosObras = demoPedidosObras.map((pedido) => pedido.id === id ? { ...pedido, ...values } : pedido);
    return { affectedRows: 1 };
  }

  return db.update(pedidosObras).set(values).where(eq(pedidosObras.id, id));
}

export async function createSincronizacaoObras(data: {
  pedidoObraId: number | null;
  pedidoNum: string;
  tipoPedido: string;
  statusCrti: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(sincronizacaoCrtiObras).values({
    pedidoObraId: data.pedidoObraId || null,
    pedidoNum: data.pedidoNum,
    tipoPedido: data.tipoPedido,
    statusCrti: data.statusCrti,
  });
}

export async function registrarExecucaoSincronizacaoObras() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [registro] = await db.select({ id: sincronizacaoCrtiObras.id })
    .from(sincronizacaoCrtiObras)
    .orderBy(desc(sincronizacaoCrtiObras.dataImportacao), desc(sincronizacaoCrtiObras.id))
    .limit(1);

  if (!registro) return null;

  const data = new Date();
  await db.update(sincronizacaoCrtiObras)
    .set({ dataUltimaSincronizacao: data })
    .where(eq(sincronizacaoCrtiObras.id, registro.id));

  return data;
}

export async function getUltimaSincronizacaoObras() {
  const db = await getDb();
  if (!db) return null;

  const [ultimaExecucao] = await db.select({
    data: sincronizacaoCrtiObras.dataUltimaSincronizacao,
  })
    .from(sincronizacaoCrtiObras)
    .where(isNotNull(sincronizacaoCrtiObras.dataUltimaSincronizacao))
    .orderBy(desc(sincronizacaoCrtiObras.dataUltimaSincronizacao))
    .limit(1);

  const [ultimaImportacao] = await db.select({
    data: sincronizacaoCrtiObras.dataImportacao,
  })
    .from(sincronizacaoCrtiObras)
    .orderBy(desc(sincronizacaoCrtiObras.dataImportacao))
    .limit(1);

  const datas = [ultimaExecucao?.data, ultimaImportacao?.data]
    .filter((data): data is Date => data instanceof Date);

  if (datas.length === 0) return null;
  return new Date(Math.max(...datas.map((data) => data.getTime())));
}

// ─────────────────────────────────────────────
// CONTATOS
// ─────────────────────────────────────────────

// DESPESAS TABELA GERAL
export async function listDespesasTabelaGeral(filters?: {
  tipoConta?: string;
  search?: string;
  somenteNaoVinculados?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}) {
  const page = Math.max(1, Math.trunc(filters?.page || 1));
  const pageSize = Math.min(200, Math.max(10, Math.trunc(filters?.pageSize || 50)));
  const offset = (page - 1) * pageSize;
  const mysqlDateSortExpression = (column: string) => `
    COALESCE(
      STR_TO_DATE(NULLIF(CAST(${column} AS CHAR), ''), '%Y-%m-%d %H:%i:%s'),
      STR_TO_DATE(NULLIF(CAST(${column} AS CHAR), ''), '%Y-%m-%d'),
      STR_TO_DATE(NULLIF(CAST(${column} AS CHAR), ''), '%d/%m/%Y %H:%i:%s'),
      STR_TO_DATE(NULLIF(CAST(${column} AS CHAR), ''), '%d/%m/%Y')
    )
  `;
  const sortColumns: Record<string, string> = {
    id: "despesas_tabela_geral.id",
    codigoFornecedorCliente: "CAST(COALESCE(despesas_tabela_geral.codigoFornecedorCliente, '') AS CHAR)",
    fornecedorCliente: "COALESCE(despesas_tabela_geral.fornecedorCliente, '')",
    numeroDocumento: "CAST(COALESCE(despesas_tabela_geral.numeroDocumento, '') AS CHAR)",
    tipoConta: "COALESCE(despesas_tabela_geral.tipoConta, '')",
    tipoDocumento: "COALESCE(despesas_tabela_geral.tipoDocumento, '')",
    dataEmissao: mysqlDateSortExpression("despesas_tabela_geral.dataEmissao"),
    dataVencimento: mysqlDateSortExpression("despesas_tabela_geral.dataVencimento"),
    valorTotalDocumento: "CAST(COALESCE(despesas_tabela_geral.valorTotalDocumento, 0) AS DECIMAL(18, 2))",
    complemento: "COALESCE(despesas_tabela_geral.complemento, '')",
    observacoesAprovacao: "COALESCE(despesas_tabela_geral.observacoesAprovacao, '')",
    vinculado: "COALESCE(pod.pedidoNum, 0)",
  };
  const sortBy = filters?.sortBy && sortColumns[filters.sortBy] ? filters.sortBy : "id";
  const sortDirection = filters?.sortDirection === "asc" ? "ASC" : "DESC";
  const orderBy = sortColumns[sortBy];

  const db = await getDb();
  if (!db || !_pool) {
    return { items: [], total: 0, page, pageSize, totalPages: 1 };
  }

  const whereSql: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.tipoConta && filters.tipoConta !== "TODOS") {
    whereSql.push("tipoConta = ?");
    params.push(filters.tipoConta);
  }

  if (filters?.search) {
    whereSql.push("(codigoFornecedorCliente LIKE ? OR fornecedorCliente LIKE ? OR numeroDocumento LIKE ? OR complemento LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search, search);
  }

  if (filters?.somenteNaoVinculados) {
    whereSql.push(`
      NOT EXISTS (SELECT 1 FROM pedido_obra_despesas pod_filter WHERE pod_filter.despesaTabelaGeralId = despesas_tabela_geral.id)
      AND NOT EXISTS (SELECT 1 FROM pedido_obra_receitas por_filter WHERE por_filter.despesaTabelaGeralId = despesas_tabela_geral.id)
    `);
  }

  const whereClause = whereSql.length > 0 ? `WHERE ${whereSql.join(" AND ")}` : "";
  const [countRows] = await _pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM despesas_tabela_geral ${whereClause}`,
    params,
  );

  const total = Number(countRows[0]?.total) || 0;
  const [items] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        sourceKey,
        codigoFornecedorCliente,
        fornecedorCliente,
        numeroDocumento,
        tipoConta,
        tipoDocumento,
        dataEmissao,
        dataVencimento,
        valorTotalDocumento,
        complemento,
        observacoesAprovacao,
        CASE
          WHEN pod.pedidoNum IS NULL THEN ''
          ELSE CONCAT('VO', pod.pedidoNum)
        END AS vinculado,
        situacao,
        criadoEm,
        atualizadoEm
      FROM despesas_tabela_geral
      LEFT JOIN (
        SELECT despesaTabelaGeralId, MAX(pedidoNum) AS pedidoNum
        FROM (
          SELECT despesaTabelaGeralId, pedidoNum FROM pedido_obra_despesas WHERE despesaTabelaGeralId IS NOT NULL
          UNION ALL
          SELECT despesaTabelaGeralId, pedidoNum FROM pedido_obra_receitas WHERE despesaTabelaGeralId IS NOT NULL
        ) vinculos
        GROUP BY despesaTabelaGeralId
      ) pod ON pod.despesaTabelaGeralId = despesas_tabela_geral.id
      ${whereClause}
      ORDER BY ${orderBy} ${sortDirection}, despesas_tabela_geral.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset],
  );

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function exportDespesasTabelaGeral(filters?: {
  tipoConta?: string;
  search?: string;
  somenteNaoVinculados?: boolean;
}) {
  const db = await getDb();
  if (!db || !_pool) {
    return [];
  }

  const whereSql: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.tipoConta && filters.tipoConta !== "TODOS") {
    whereSql.push("tipoConta = ?");
    params.push(filters.tipoConta);
  }

  if (filters?.search) {
    whereSql.push("(codigoFornecedorCliente LIKE ? OR fornecedorCliente LIKE ? OR numeroDocumento LIKE ? OR complemento LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search, search);
  }

  if (filters?.somenteNaoVinculados) {
    whereSql.push(`
      NOT EXISTS (SELECT 1 FROM pedido_obra_despesas pod_filter WHERE pod_filter.despesaTabelaGeralId = despesas_tabela_geral.id)
      AND NOT EXISTS (SELECT 1 FROM pedido_obra_receitas por_filter WHERE por_filter.despesaTabelaGeralId = despesas_tabela_geral.id)
    `);
  }

  const whereClause = whereSql.length > 0 ? `WHERE ${whereSql.join(" AND ")}` : "";
  const [items] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        despesas_tabela_geral.id,
        codigoFornecedorCliente,
        fornecedorCliente,
        numeroDocumento,
        tipoConta,
        tipoDocumento,
        dataEmissao,
        dataVencimento,
        valorTotalDocumento,
        complemento,
        observacoesAprovacao,
        CASE
          WHEN pod.pedidoNum IS NULL THEN ''
          ELSE CONCAT('VO', pod.pedidoNum)
        END AS vinculado
      FROM despesas_tabela_geral
      LEFT JOIN (
        SELECT despesaTabelaGeralId, MAX(pedidoNum) AS pedidoNum
        FROM (
          SELECT despesaTabelaGeralId, pedidoNum FROM pedido_obra_despesas WHERE despesaTabelaGeralId IS NOT NULL
          UNION ALL
          SELECT despesaTabelaGeralId, pedidoNum FROM pedido_obra_receitas WHERE despesaTabelaGeralId IS NOT NULL
        ) vinculos
        GROUP BY despesaTabelaGeralId
      ) pod ON pod.despesaTabelaGeralId = despesas_tabela_geral.id
      ${whereClause}
      ORDER BY despesas_tabela_geral.id DESC
    `,
    params,
  );

  return items;
}

export async function upsertDespesasTabelaGeralFromCrti(items: Array<{
  sourceKey: string;
  codigoFornecedorCliente: string;
  fornecedorCliente: string;
  numeroDocumento: string;
  tipoConta: string;
  tipoDocumento: string;
  dataEmissao: string;
  dataVencimento: string;
  valorTotalDocumento: number;
  complemento: string;
  situacao: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");
  if (items.length === 0) return { affectedRows: 0 };

  const columns = [
    "sourceKey",
    "codigoFornecedorCliente",
    "fornecedorCliente",
    "numeroDocumento",
    "tipoConta",
    "tipoDocumento",
    "dataEmissao",
    "dataVencimento",
    "valorTotalDocumento",
    "complemento",
    "situacao",
  ];
  const placeholders = items.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
  const values = items.flatMap((item) => [
    item.sourceKey,
    item.codigoFornecedorCliente,
    item.fornecedorCliente,
    item.numeroDocumento,
    item.tipoConta,
    item.tipoDocumento,
    item.dataEmissao,
    item.dataVencimento,
    item.valorTotalDocumento,
    item.complemento,
    item.situacao,
  ]);

  return _pool.query(
    `
      INSERT INTO despesas_tabela_geral (${columns.map((column) => `\`${column}\``).join(", ")})
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        codigoFornecedorCliente = VALUES(codigoFornecedorCliente),
        fornecedorCliente = VALUES(fornecedorCliente),
        numeroDocumento = VALUES(numeroDocumento),
        tipoConta = VALUES(tipoConta),
        tipoDocumento = VALUES(tipoDocumento),
        dataEmissao = VALUES(dataEmissao),
        dataVencimento = VALUES(dataVencimento),
        valorTotalDocumento = VALUES(valorTotalDocumento),
        complemento = VALUES(complemento),
        situacao = VALUES(situacao),
        atualizadoEm = CURRENT_TIMESTAMP
    `,
    values,
  );
}

export async function upsertPedidoObraCustosFromCrti(items: Array<{
  sourceKey: string;
  pedidoNum: string;
  numeroDocumento: string;
  dataEmissao: string;
  valorTotal: number;
  situacao: string;
  complemento: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");
  if (items.length === 0) return { affectedRows: 0 };

  const pedidoNums = Array.from(new Set(items.map((item) => item.pedidoNum).filter(Boolean)));
  if (pedidoNums.length === 0) return { affectedRows: 0 };

  const [pedidosLocais] = await _pool.query<mysql.RowDataPacket[]>(
    `SELECT id, pedido FROM pedidos_obras WHERE pedido IN (${pedidoNums.map(() => "?").join(", ")})`,
    pedidoNums,
  );
  const pedidoIdByNum = new Map(pedidosLocais.map((pedido) => [String(pedido.pedido), Number(pedido.id)]));
  const linkedItems = items
    .map((item) => ({
      ...item,
      pedidoObraId: pedidoIdByNum.get(item.pedidoNum),
    }))
    .filter((item): item is typeof item & { pedidoObraId: number } => Number.isFinite(item.pedidoObraId));

  if (linkedItems.length === 0) return { affectedRows: 0 };

  const columns = [
    "sourceKey",
    "pedidoObraId",
    "pedidoNum",
    "numeroDocumento",
    "dataEmissao",
    "valorTotal",
    "situacao",
    "complemento",
  ];
  const placeholders = linkedItems.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
  const values = linkedItems.flatMap((item) => [
    item.sourceKey,
    item.pedidoObraId,
    item.pedidoNum,
    item.numeroDocumento,
    item.dataEmissao,
    item.valorTotal,
    item.situacao,
    item.complemento,
  ]);

  return _pool.query(
    `
      INSERT INTO pedido_obra_custos (${columns.map((column) => `\`${column}\``).join(", ")})
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        pedidoObraId = VALUES(pedidoObraId),
        pedidoNum = VALUES(pedidoNum),
        numeroDocumento = VALUES(numeroDocumento),
        dataEmissao = VALUES(dataEmissao),
        valorTotal = VALUES(valorTotal),
        situacao = VALUES(situacao),
        complemento = VALUES(complemento),
        atualizadoEm = CURRENT_TIMESTAMP
    `,
    values,
  );
}

export async function getPedidoObraModalData(pedidoObraId: number) {
  const db = await getDb();
  if (!db || !_pool) {
    return {
      financeiro: {
        pedidoObraId,
        nfes: "0",
        faturamentoDireto: "0",
        valorTotalImposto: "0",
        porcentagemImposto: "17.00",
      },
      receitas: [],
      despesas: [],
      custos: [],
    };
  }

  const [financeiroRows] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT id, pedidoObraId, pedidoNum, nfes, faturamentoDireto, valorTotalImposto, porcentagemImposto, criadoEm, atualizadoEm
      FROM pedido_obra_financeiro
      WHERE pedidoObraId = ?
      LIMIT 1
    `,
    [pedidoObraId],
  );

  const [despesas] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        pedidoObraId,
        pedidoNum,
        despesaTabelaGeralId,
        origem,
        categoria,
        justificativaOutros,
        codigoFornecedorCliente,
        fornecedorCliente,
        numeroDocumento,
        tipoConta,
        tipoDocumento,
        dataEmissao,
        dataVencimento,
        valorTotalDocumento,
        complemento,
        observacoesAprovacao,
        criadoPor,
        criadoEm,
        atualizadoEm
      FROM pedido_obra_despesas
      WHERE pedidoObraId = ?
      ORDER BY id DESC
    `,
    [pedidoObraId],
  );

  let receitas: mysql.RowDataPacket[];
  try {
    const [receitasRows] = await _pool.query<mysql.RowDataPacket[]>(
      `
        SELECT
          id,
          pedidoObraId,
          pedidoNum,
          despesaTabelaGeralId,
          codigoFornecedorCliente,
          fornecedorCliente,
          numeroDocumento,
          status,
          tipoReceitaOutros,
          tipoConta,
          tipoDocumento,
          dataEmissao,
          dataVencimento,
          valorTotalDocumento,
          \`data\`,
          valor,
          descricao,
          criadoPor,
          criadoEm,
          atualizadoEm
        FROM pedido_obra_receitas
        WHERE pedidoObraId = ?
        ORDER BY id DESC
      `,
      [pedidoObraId],
    );
    receitas = receitasRows;
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_BAD_FIELD_ERROR") throw error;
    const [receitasRows] = await _pool.query<mysql.RowDataPacket[]>(
      `
        SELECT
          id,
          pedidoObraId,
          pedidoNum,
          NULL AS despesaTabelaGeralId,
          '' AS codigoFornecedorCliente,
          '' AS fornecedorCliente,
          numeroDocumento,
          status,
          '' AS tipoReceitaOutros,
          '' AS tipoConta,
          '' AS tipoDocumento,
          \`data\` AS dataEmissao,
          \`data\` AS dataVencimento,
          valor AS valorTotalDocumento,
          \`data\`,
          valor,
          descricao,
          criadoPor,
          criadoEm,
          atualizadoEm
        FROM pedido_obra_receitas
        WHERE pedidoObraId = ?
        ORDER BY id DESC
      `,
      [pedidoObraId],
    );
    receitas = receitasRows;
  }

  const [custos] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        id,
        sourceKey,
        pedidoObraId,
        pedidoNum,
        numeroDocumento,
        dataEmissao,
        valorTotal,
        situacao,
        complemento,
        criadoEm,
        atualizadoEm
      FROM pedido_obra_custos
      WHERE pedidoObraId = ?
      ORDER BY dataEmissao DESC, numeroDocumento DESC
    `,
    [pedidoObraId],
  );

  let resultadoAlocacoes: mysql.RowDataPacket[] = [];
  try {
    const [resultadoAlocacoesRows] = await _pool.query<mysql.RowDataPacket[]>(
      `
        SELECT
          id,
          pedidoObraId,
          pedidoNum,
          itemTipo,
          itemId,
          mesReferencia,
          dataReferencia,
          criadoPor,
          criadoEm,
          atualizadoEm
        FROM pedido_obra_resultado_alocacoes
        WHERE pedidoObraId = ?
      `,
      [pedidoObraId],
    );
    resultadoAlocacoes = resultadoAlocacoesRows;
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error;
  }

  return {
    financeiro: financeiroRows[0] ?? {
      pedidoObraId,
      nfes: "0",
      faturamentoDireto: "0",
      valorTotalImposto: "0",
      porcentagemImposto: "17.00",
    },
    receitas,
    despesas,
    custos,
    resultadoAlocacoes,
  };
}

export async function savePedidoObraResultadoAlocacoes(data: {
  pedidoObraId: number;
  pedidoNum: string;
  alocacoes: Array<{
    itemTipo: "receita" | "despesa" | "custo";
    itemId: number;
    mesReferencia: string;
    dataReferencia?: string;
  }>;
  criadoPor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  const validAlocacoes = data.alocacoes
    .map((item) => {
      const dataReferencia = /^\d{4}-\d{2}-\d{2}$/.test(item.dataReferencia || "")
        ? item.dataReferencia
        : /^\d{4}-\d{2}-\d{2}$/.test(item.mesReferencia)
          ? item.mesReferencia
          : undefined;
      const mesReferencia = dataReferencia
        ? dataReferencia.slice(0, 7)
        : /^\d{4}-\d{2}$/.test(item.mesReferencia)
          ? item.mesReferencia
          : "";

      return {
        ...item,
        mesReferencia,
        dataReferencia: dataReferencia || `${mesReferencia}-01`,
      };
    })
    .filter((item) =>
      ["receita", "despesa", "custo"].includes(item.itemTipo)
      && Number.isFinite(item.itemId)
      && /^\d{4}-\d{2}$/.test(item.mesReferencia)
      && /^\d{4}-\d{2}-\d{2}$/.test(item.dataReferencia)
    );

  if (validAlocacoes.length === 0) return { affectedRows: 0 };

  const values = validAlocacoes.flatMap((item) => [
    data.pedidoObraId,
    data.pedidoNum,
    item.itemTipo,
    item.itemId,
    item.mesReferencia,
    item.dataReferencia || `${item.mesReferencia}-01`,
    data.criadoPor || "Sistema",
  ]);

  const placeholders = validAlocacoes.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");

  const [result] = await _pool.query(
    `
      INSERT INTO pedido_obra_resultado_alocacoes (
        pedidoObraId,
        pedidoNum,
        itemTipo,
        itemId,
        mesReferencia,
        dataReferencia,
        criadoPor
      )
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        pedidoNum = VALUES(pedidoNum),
        mesReferencia = VALUES(mesReferencia),
        dataReferencia = VALUES(dataReferencia),
        criadoPor = VALUES(criadoPor),
        atualizadoEm = CURRENT_TIMESTAMP
    `,
    values,
  );

  return result;
}

export async function resetPedidoObraResultadoAlocacoes(pedidoObraId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  const [result] = await _pool.query(
    "DELETE FROM pedido_obra_resultado_alocacoes WHERE pedidoObraId = ?",
    [pedidoObraId],
  );

  return result;
}

export async function savePedidoObraFinanceiro(data: {
  pedidoObraId: number;
  pedidoNum: string;
  nfes: number;
  faturamentoDireto: number;
  valorTotalImposto: number;
  porcentagemImposto: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(pedidoObraFinanceiro).values({
    pedidoObraId: data.pedidoObraId,
    pedidoNum: data.pedidoNum,
    nfes: String(data.nfes),
    faturamentoDireto: String(data.faturamentoDireto),
    valorTotalImposto: String(data.valorTotalImposto),
    porcentagemImposto: String(data.porcentagemImposto),
  }).onDuplicateKeyUpdate({
    set: {
      pedidoNum: data.pedidoNum,
      nfes: String(data.nfes),
      faturamentoDireto: String(data.faturamentoDireto),
      valorTotalImposto: String(data.valorTotalImposto),
      porcentagemImposto: String(data.porcentagemImposto),
      atualizadoEm: new Date(),
    },
  });
}

export async function clearPedidoObraFinanceiro(pedidoObraId: number, pedidoNum: string) {
  return savePedidoObraFinanceiro({
    pedidoObraId,
    pedidoNum,
    nfes: 0,
    faturamentoDireto: 0,
    valorTotalImposto: 0,
    porcentagemImposto: 17,
  });
}

export async function createPedidoObraReceita(data: {
  pedidoObraId: number;
  pedidoNum: string;
  codigoFornecedorCliente?: string;
  fornecedorCliente?: string;
  numeroDocumento?: string;
  status: "Nfe" | "Faturamento Direto" | "Outros";
  tipoReceitaOutros?: string;
  tipoConta?: string;
  tipoDocumento?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  valorTotalDocumento: number;
  data?: string;
  valor?: number;
  descricao?: string;
  criadoPor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  const [result] = await _pool.query(
    `
      INSERT INTO pedido_obra_receitas (
        pedidoObraId,
        pedidoNum,
        codigoFornecedorCliente,
        fornecedorCliente,
        numeroDocumento,
        status,
        tipoReceitaOutros,
        tipoConta,
        tipoDocumento,
        dataEmissao,
        dataVencimento,
        valorTotalDocumento,
        \`data\`,
        valor,
        descricao,
        criadoPor
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.pedidoObraId,
      data.pedidoNum,
      data.codigoFornecedorCliente || "",
      data.fornecedorCliente || "",
      data.numeroDocumento || "",
      data.status,
      data.status === "Outros" ? data.tipoReceitaOutros || "" : "",
      data.tipoConta || "",
      data.tipoDocumento || "",
      data.dataEmissao || data.data || "",
      data.dataVencimento || data.data || "",
      data.valorTotalDocumento ?? data.valor ?? 0,
      data.data || data.dataVencimento || data.dataEmissao || "",
      data.valor ?? data.valorTotalDocumento ?? 0,
      data.descricao || "",
      data.criadoPor || "Sistema",
    ],
  );

  return result;
}

export async function updatePedidoObraReceita(data: {
  id: number;
  pedidoObraId: number;
  codigoFornecedorCliente?: string;
  fornecedorCliente?: string;
  numeroDocumento?: string;
  status: "Nfe" | "Faturamento Direto" | "Outros";
  tipoReceitaOutros?: string;
  tipoConta?: string;
  tipoDocumento?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  valorTotalDocumento: number;
  data?: string;
  valor?: number;
  descricao?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  const [result] = await _pool.query(
    `
      UPDATE pedido_obra_receitas
      SET
        codigoFornecedorCliente = ?,
        fornecedorCliente = ?,
        numeroDocumento = ?,
        status = ?,
        tipoReceitaOutros = ?,
        tipoConta = ?,
        tipoDocumento = ?,
        dataEmissao = ?,
        dataVencimento = ?,
        valorTotalDocumento = ?,
        \`data\` = ?,
        valor = ?,
        descricao = ?,
        atualizadoEm = CURRENT_TIMESTAMP
      WHERE id = ? AND pedidoObraId = ?
    `,
    [
      data.codigoFornecedorCliente || "",
      data.fornecedorCliente || "",
      data.numeroDocumento || "",
      data.status,
      data.status === "Outros" ? data.tipoReceitaOutros || "" : "",
      data.tipoConta || "",
      data.tipoDocumento || "",
      data.dataEmissao || data.data || "",
      data.dataVencimento || data.data || "",
      data.valorTotalDocumento ?? data.valor ?? 0,
      data.data || data.dataVencimento || data.dataEmissao || "",
      data.valor ?? data.valorTotalDocumento ?? 0,
      data.descricao || "",
      data.id,
      data.pedidoObraId,
    ],
  );

  return result;
}

export async function deletePedidoObraReceita(id: number, pedidoObraId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  const [result] = await _pool.query(
    "DELETE FROM pedido_obra_receitas WHERE id = ? AND pedidoObraId = ?",
    [id, pedidoObraId],
  );

  return result;
}

export async function createPedidoObraDespesaManual(data: {
  pedidoObraId: number;
  pedidoNum: string;
  categoria: "Custo" | "Despesa" | "Outros";
  justificativaOutros?: string;
  codigoFornecedorCliente?: string;
  fornecedorCliente?: string;
  numeroDocumento?: string;
  tipoConta?: string;
  tipoDocumento?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  valorTotalDocumento: number;
  complemento?: string;
  observacoesAprovacao?: string;
  criadoPor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  return _pool.query(
    `
      INSERT INTO pedido_obra_despesas (
        pedidoObraId,
        pedidoNum,
        origem,
        categoria,
        justificativaOutros,
        codigoFornecedorCliente,
        fornecedorCliente,
        numeroDocumento,
        tipoConta,
        tipoDocumento,
        dataEmissao,
        dataVencimento,
        valorTotalDocumento,
        complemento,
        observacoesAprovacao,
        criadoPor
      ) VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.pedidoObraId,
      data.pedidoNum,
      data.categoria,
      data.justificativaOutros || "",
      data.codigoFornecedorCliente || "",
      data.fornecedorCliente || "",
      data.numeroDocumento || "",
      data.tipoConta || "",
      data.tipoDocumento || "",
      data.dataEmissao || "",
      data.dataVencimento || "",
      data.valorTotalDocumento,
      data.complemento || "",
      data.observacoesAprovacao || "",
      data.criadoPor || "Sistema",
    ],
  );
}

export async function updatePedidoObraDespesa(data: {
  id: number;
  pedidoObraId: number;
  categoria: "Custo" | "Despesa" | "Outros";
  justificativaOutros?: string;
  codigoFornecedorCliente?: string;
  fornecedorCliente?: string;
  numeroDocumento?: string;
  tipoConta?: string;
  tipoDocumento?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  valorTotalDocumento?: number;
  complemento?: string;
  observacoesAprovacao?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  return _pool.query(
    `
      UPDATE pedido_obra_despesas
      SET
        categoria = ?,
        justificativaOutros = ?,
        codigoFornecedorCliente = ?,
        fornecedorCliente = ?,
        numeroDocumento = ?,
        tipoConta = ?,
        tipoDocumento = ?,
        dataEmissao = ?,
        dataVencimento = ?,
        valorTotalDocumento = ?,
        complemento = ?,
        observacoesAprovacao = ?,
        atualizadoEm = CURRENT_TIMESTAMP
      WHERE id = ? AND pedidoObraId = ?
    `,
    [
      data.categoria,
      data.justificativaOutros || "",
      data.codigoFornecedorCliente || "",
      data.fornecedorCliente || "",
      data.numeroDocumento || "",
      data.tipoConta || "",
      data.tipoDocumento || "",
      data.dataEmissao || "",
      data.dataVencimento || "",
      data.valorTotalDocumento ?? 0,
      data.complemento || "",
      data.observacoesAprovacao || "",
      data.id,
      data.pedidoObraId,
    ],
  );
}

export async function deletePedidoObraDespesa(id: number, pedidoObraId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.delete(pedidoObraDespesas)
    .where(and(eq(pedidoObraDespesas.id, id), eq(pedidoObraDespesas.pedidoObraId, pedidoObraId)));
}

export async function listDespesasTabelaGeralDisponiveis(filters?: {
  pedidoObraId?: number;
  tipoConta?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.trunc(filters?.page || 1));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(filters?.pageSize || 25)));
  const offset = (page - 1) * pageSize;

  const db = await getDb();
  if (!db || !_pool) {
    return { items: [], total: 0, page, pageSize, totalPages: 1 };
  }

  const whereSql = [`
    NOT EXISTS (SELECT 1 FROM pedido_obra_despesas pod WHERE pod.despesaTabelaGeralId = dtg.id)
    AND NOT EXISTS (SELECT 1 FROM pedido_obra_receitas por WHERE por.despesaTabelaGeralId = dtg.id)
  `];
  const params: Array<string | number> = [];

  if (filters?.tipoConta && filters.tipoConta !== "TODOS") {
    whereSql.push("dtg.tipoConta = ?");
    params.push(filters.tipoConta);
  }

  if (filters?.search) {
    whereSql.push("(dtg.codigoFornecedorCliente LIKE ? OR dtg.fornecedorCliente LIKE ? OR dtg.numeroDocumento LIKE ? OR dtg.complemento LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search, search);
  }

  const whereClause = `WHERE ${whereSql.join(" AND ")}`;
  const [countRows] = await _pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM despesas_tabela_geral dtg ${whereClause}`,
    params,
  );

  const total = Number(countRows[0]?.total) || 0;
  const [items] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        dtg.id,
        dtg.codigoFornecedorCliente,
        dtg.fornecedorCliente,
        dtg.numeroDocumento,
        dtg.tipoConta,
        dtg.tipoDocumento,
        dtg.dataEmissao,
        dtg.dataVencimento,
        dtg.valorTotalDocumento,
        dtg.complemento,
        dtg.observacoesAprovacao,
        dtg.situacao
      FROM despesas_tabela_geral dtg
      ${whereClause}
      ORDER BY dtg.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset],
  );

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function vincularDespesaTabelaGeralAoPedidoObra(data: {
  pedidoObraId: number;
  pedidoNum: string;
  despesaTabelaGeralId: number;
  categoria: "Custo" | "Despesa" | "Outros";
  justificativaOutros?: string;
  criadoPor?: string;
}) {
  const db = await getDb();
  if (!db || !_pool) throw new Error("Database not available");

  const connection = await _pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingLinks] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, pedidoObraId FROM pedido_obra_despesas WHERE despesaTabelaGeralId = ? LIMIT 1 FOR UPDATE",
      [data.despesaTabelaGeralId],
    );

    if (existingLinks.length > 0) {
      throw new Error("Esta despesa ja esta vinculada a uma obra.");
    }

    const [despesas] = await connection.query<mysql.RowDataPacket[]>(
      `
        SELECT
          codigoFornecedorCliente,
          fornecedorCliente,
          numeroDocumento,
          tipoConta,
          tipoDocumento,
          dataEmissao,
          dataVencimento,
          valorTotalDocumento,
          complemento,
          observacoesAprovacao
        FROM despesas_tabela_geral
        WHERE id = ?
        LIMIT 1
      `,
      [data.despesaTabelaGeralId],
    );

    const despesa = despesas[0];
    if (!despesa) {
      throw new Error("Despesa da tabela geral nao encontrada.");
    }

    await connection.query(
      `
        INSERT INTO pedido_obra_despesas (
          pedidoObraId,
          pedidoNum,
          despesaTabelaGeralId,
          origem,
          categoria,
          justificativaOutros,
          codigoFornecedorCliente,
          fornecedorCliente,
          numeroDocumento,
          tipoConta,
          tipoDocumento,
          dataEmissao,
          dataVencimento,
          valorTotalDocumento,
          complemento,
          observacoesAprovacao,
          criadoPor
        ) VALUES (?, ?, ?, 'vinculada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        data.pedidoObraId,
        data.pedidoNum,
        data.despesaTabelaGeralId,
        data.categoria,
        data.justificativaOutros || "",
        despesa.codigoFornecedorCliente,
        despesa.fornecedorCliente,
        despesa.numeroDocumento,
        despesa.tipoConta,
        despesa.tipoDocumento,
        despesa.dataEmissao,
        despesa.dataVencimento,
        despesa.valorTotalDocumento,
        despesa.complemento,
        despesa.observacoesAprovacao,
        data.criadoPor || "Sistema",
      ],
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function vincularSaidasAutomaticasObras(criadoPor = "Sistema") {
  const db = await getDb();
  if (!db || !_pool) throw new Error("Database not available");

  const [pedidoRows] = await _pool.query<mysql.RowDataPacket[]>(
    "SELECT id, pedido FROM pedidos_obras",
  );
  const pedidosPorNumero = new Map<string, { id: number; pedido: string }>();
  for (const pedido of pedidoRows) {
    const numero = String(pedido.pedido || "").trim();
    if (numero) pedidosPorNumero.set(numero, { id: Number(pedido.id), pedido: numero });
  }

  const [despesas] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        dtg.id,
        dtg.codigoFornecedorCliente,
        dtg.fornecedorCliente,
        dtg.numeroDocumento,
        dtg.tipoConta,
        dtg.tipoDocumento,
        dtg.dataEmissao,
        dtg.dataVencimento,
        dtg.valorTotalDocumento,
        dtg.complemento,
        dtg.observacoesAprovacao
      FROM despesas_tabela_geral dtg
      LEFT JOIN pedido_obra_despesas pod ON pod.despesaTabelaGeralId = dtg.id
      WHERE pod.id IS NULL
        AND UPPER(TRIM(COALESCE(dtg.tipoConta, ''))) = 'PAGAR'
        AND (
          COALESCE(dtg.complemento, '') REGEXP '[oO][[:space:]]*[0-9]+'
          OR COALESCE(dtg.observacoesAprovacao, '') REGEXP '[oO][[:space:]]*[0-9]+'
        )
      ORDER BY dtg.id DESC
    `,
  );

  const [receitas] = await _pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        dtg.id,
        dtg.codigoFornecedorCliente,
        dtg.fornecedorCliente,
        dtg.numeroDocumento,
        dtg.tipoConta,
        dtg.tipoDocumento,
        dtg.dataEmissao,
        dtg.dataVencimento,
        dtg.valorTotalDocumento,
        dtg.complemento,
        dtg.observacoesAprovacao
      FROM despesas_tabela_geral dtg
      LEFT JOIN pedido_obra_receitas por ON por.despesaTabelaGeralId = dtg.id
      WHERE por.id IS NULL
        AND UPPER(TRIM(COALESCE(dtg.tipoConta, ''))) = 'RECEBER'
        AND (
          COALESCE(dtg.complemento, '') REGEXP '[oO][[:space:]]*[0-9]+'
          OR COALESCE(dtg.observacoesAprovacao, '') REGEXP '[oO][[:space:]]*[0-9]+'
        )
      ORDER BY dtg.id DESC
    `,
  );

  const connection = await _pool.getConnection();
  let vinculadas = 0;
  let receitasVinculadas = 0;
  let semPedido = 0;
  let jaVinculadas = 0;
  const despesasProcessadas = despesas.length;
  const receitasProcessadas = receitas.length;
  const linkedExpenseIds = new Set<number>();
  const linkedRevenueIds = new Set<number>();

  try {
    await connection.beginTransaction();

    for (const despesa of despesas) {
      const despesaId = Number(despesa.id);
      if (linkedExpenseIds.has(despesaId)) continue;

      const texto = `${despesa.complemento || ""} ${despesa.observacoesAprovacao || ""}`;
      const matches = Array.from(texto.matchAll(/o\s*(\d+)/gi));
      const pedidoEncontrado = matches
        .map((match) => pedidosPorNumero.get(match[1]))
        .find(Boolean);

      if (!pedidoEncontrado) {
        semPedido += 1;
        continue;
      }

      const [existingLinks] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT id FROM pedido_obra_despesas WHERE despesaTabelaGeralId = ? LIMIT 1 FOR UPDATE",
        [despesaId],
      );

      if (existingLinks.length > 0) {
        jaVinculadas += 1;
        continue;
      }

      await connection.query(
        `
          INSERT INTO pedido_obra_despesas (
            pedidoObraId,
            pedidoNum,
            despesaTabelaGeralId,
            origem,
            categoria,
            justificativaOutros,
            codigoFornecedorCliente,
            fornecedorCliente,
            numeroDocumento,
            tipoConta,
            tipoDocumento,
            dataEmissao,
            dataVencimento,
            valorTotalDocumento,
            complemento,
            observacoesAprovacao,
            criadoPor
          ) VALUES (?, ?, ?, 'vinculada', 'Despesa', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          pedidoEncontrado.id,
          pedidoEncontrado.pedido,
          despesaId,
          despesa.codigoFornecedorCliente,
          despesa.fornecedorCliente,
          despesa.numeroDocumento,
          despesa.tipoConta,
          despesa.tipoDocumento,
          despesa.dataEmissao,
          despesa.dataVencimento,
          despesa.valorTotalDocumento,
          despesa.complemento,
          despesa.observacoesAprovacao,
          criadoPor,
        ],
      );

      linkedExpenseIds.add(despesaId);
      vinculadas += 1;
    }

    for (const receita of receitas) {
      const receitaId = Number(receita.id);
      if (linkedRevenueIds.has(receitaId)) continue;

      const texto = `${receita.complemento || ""} ${receita.observacoesAprovacao || ""}`;
      const matches = Array.from(texto.matchAll(/o\s*(\d+)/gi));
      const pedidoEncontrado = matches
        .map((match) => pedidosPorNumero.get(match[1]))
        .find(Boolean);

      if (!pedidoEncontrado) {
        semPedido += 1;
        continue;
      }

      const [existingLinks] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT id FROM pedido_obra_receitas WHERE despesaTabelaGeralId = ? LIMIT 1 FOR UPDATE",
        [receitaId],
      );

      if (existingLinks.length > 0) {
        jaVinculadas += 1;
        continue;
      }

      const dataReferencia = receita.dataVencimento || receita.dataEmissao || "";
      await connection.query(
        `
          INSERT INTO pedido_obra_receitas (
            pedidoObraId,
            pedidoNum,
            despesaTabelaGeralId,
            codigoFornecedorCliente,
            fornecedorCliente,
            numeroDocumento,
            status,
            tipoReceitaOutros,
            tipoConta,
            tipoDocumento,
            dataEmissao,
            dataVencimento,
            valorTotalDocumento,
            \`data\`,
            valor,
            descricao,
            criadoPor
          ) VALUES (?, ?, ?, ?, ?, ?, 'Outros', 'Receber', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          pedidoEncontrado.id,
          pedidoEncontrado.pedido,
          receitaId,
          receita.codigoFornecedorCliente,
          receita.fornecedorCliente,
          receita.numeroDocumento,
          receita.tipoConta,
          receita.tipoDocumento,
          receita.dataEmissao,
          receita.dataVencimento,
          receita.valorTotalDocumento,
          dataReferencia,
          receita.valorTotalDocumento,
          receita.complemento || receita.observacoesAprovacao || "",
          criadoPor,
        ],
      );

      linkedRevenueIds.add(receitaId);
      receitasVinculadas += 1;
      vinculadas += 1;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    success: true,
    despesasProcessadas,
    receitasProcessadas,
    vinculadas,
    despesasVinculadas: vinculadas - receitasVinculadas,
    receitasVinculadas,
    semPedido,
    jaVinculadas,
  };
}

export async function listContatosByPedido(pedidoId: number) {
  const db = await getDb();
  if (!db) return shouldUseDemoData() ? demoContatos.filter((contato) => contato.pedidoId === pedidoId) : [];

  return db.select().from(contatos)
    .where(eq(contatos.pedidoId, pedidoId))
    .orderBy(desc(contatos.dataContato));
}

export async function createContato(data: any) {
  const db = await getDb();
  if (!db) {
    if (!shouldUseDemoData()) throw new Error("Database not available");
    demoContatos.unshift({
      id: demoContatos.length + 1,
      pedidoId: data.pedidoId,
      pedidoNum: data.pedidoNum,
      tipo: data.tipo || "Ligação",
      descricao: data.descricao,
      usuario: data.usuario || "Sistema",
      dataContato: new Date(),
    });
    if (data.novoStatus) {
      await updatePedido(data.pedidoId, { status: data.novoStatus }, data.usuario || "Sistema");
    }
    return { insertId: demoContatos.length };
  }

  const result = await db.insert(contatos).values({
    pedidoId: data.pedidoId,
    pedidoNum: data.pedidoNum,
    tipo: data.tipo || "Ligação",
    descricao: data.descricao,
    usuario: data.usuario || "Sistema",
  });

  if (data.novoStatus) {
    await updatePedido(data.pedidoId, { status: data.novoStatus }, data.usuario || "Sistema");
  }

  return result;
}

// ─────────────────────────────────────────────
// HISTÓRICO
// ─────────────────────────────────────────────

export async function listHistoricoByPedido(pedidoId: number) {
  const db = await getDb();
  if (!db) {
    return shouldUseDemoData()
      ? demoHistorico
        .filter((item) => item.pedidoId === pedidoId)
        .sort((a, b) => Number(new Date(b.dataHora)) - Number(new Date(a.dataHora)))
      : [];
  }

  return db.select().from(historico)
    .where(eq(historico.pedidoId, pedidoId))
    .orderBy(desc(historico.dataHora));
}

// ─────────────────────────────────────────────
// INDICADORES
// ─────────────────────────────────────────────

export async function getIndicadores() {
  const db = await getDb();
  if (!db) {
    const allPedidos = shouldUseDemoData() ? demoPedidos : [];
    return {
      total: allPedidos.length,
      pendente: allPedidos.filter(p => p.status === "PENDENTE").length,
      saidaOk: allPedidos.filter(p => normalizeStatus(p.status) === STATUS_SAIDA_OK).length,
      cancelado: allPedidos.filter(p => p.status === "CANCELADO").length,
      prioridade: allPedidos.filter(p => p.prioridade === "PRIORIDADE").length,
      totalValor: allPedidos.reduce((sum, p) => sum + Number(p.totalPedido || 0), 0),
      totalSaldo: allPedidos.reduce((sum, p) => sum + Number(p.saldo || 0), 0),
    };
  }

  const allPedidos: any[] = await db.select().from(pedidos);

  return {
    total: allPedidos.length,
    pendente: allPedidos.filter(p => p.status === "PENDENTE").length,
    saidaOk: allPedidos.filter(p => normalizeStatus(p.status) === STATUS_SAIDA_OK).length,
    cancelado: allPedidos.filter(p => p.status === "CANCELADO").length,
    prioridade: allPedidos.filter(p => p.prioridade === "PRIORIDADE").length,
    totalValor: allPedidos.reduce((sum, p) => sum + Number(p.totalPedido || 0), 0),
    totalSaldo: allPedidos.reduce((sum, p) => sum + Number(p.saldo || 0), 0),
  };
}

// ─────────────────────────────────────────────
// SINCRONIZAÇÃO CRTI
// ─────────────────────────────────────────────

export async function createSincronizacao(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(sincronizacaoCrti).values({
    pedidoId: data.pedidoId || null,
    pedidoNum: data.pedidoNum,
    tipoPedido: data.tipoPedido,
    statusCrti: data.statusCrti,
    statusLocal: data.statusLocal,
  });
}

export async function getSincronizacaoByPedido(pedidoNum: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(sincronizacaoCrti)
    .where(eq(sincronizacaoCrti.pedidoNum, pedidoNum))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function registrarExecucaoSincronizacao() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [registro] = await db.select({ id: sincronizacaoCrti.id })
    .from(sincronizacaoCrti)
    .orderBy(desc(sincronizacaoCrti.dataImportacao), desc(sincronizacaoCrti.id))
    .limit(1);

  if (!registro) return null;

  const data = new Date();
  await db.update(sincronizacaoCrti)
    .set({ dataUltimaSincronizacao: data })
    .where(eq(sincronizacaoCrti.id, registro.id));

  return data;
}

export async function getUltimaSincronizacao() {
  const db = await getDb();
  if (!db) return null;

  const [ultimaExecucao] = await db.select({
    data: sincronizacaoCrti.dataUltimaSincronizacao,
  })
    .from(sincronizacaoCrti)
    .where(isNotNull(sincronizacaoCrti.dataUltimaSincronizacao))
    .orderBy(desc(sincronizacaoCrti.dataUltimaSincronizacao))
    .limit(1);

  const [ultimaImportacao] = await db.select({
    data: sincronizacaoCrti.dataImportacao,
  })
    .from(sincronizacaoCrti)
    .orderBy(desc(sincronizacaoCrti.dataImportacao))
    .limit(1);

  const datas = [ultimaExecucao?.data, ultimaImportacao?.data]
    .filter((data): data is Date => data instanceof Date);

  if (datas.length === 0) return null;
  return new Date(Math.max(...datas.map((data) => data.getTime())));
}

// ESTOQUE
export async function listEstoqueMovimentacoes() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(estoqueMovimentacoes).orderBy(
    asc(estoqueMovimentacoes.dataMovimentacao),
    asc(estoqueMovimentacoes.criadoEm),
    asc(estoqueMovimentacoes.id),
  );
}

export async function createEstoqueMovimentacao(data: {
  dataMovimentacao: string;
  estoqueInicial: number;
  producaoSacos: number;
  saidaSacos: number;
  entradaGranelTon: number;
  saidaGranelTon: number;
  ocorrencias?: string;
  usuario: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(estoqueMovimentacoes).values({
    dataMovimentacao: data.dataMovimentacao,
    estoqueInicial: String(data.estoqueInicial),
    producaoSacos: String(data.producaoSacos),
    saidaSacos: String(data.saidaSacos),
    entradaGranelTon: String(data.entradaGranelTon),
    saidaGranelTon: String(data.saidaGranelTon),
    ocorrencias: data.ocorrencias || "",
    criadoPor: data.usuario,
    atualizadoPor: data.usuario,
  });
}

async function ensureMysqlPool() {
  await getDb();
  if (!_pool) throw new Error("Database pool not available");
  return _pool;
}

export async function ensureLicitacaoPregaoAlertSchema(pool: mysql.Pool) {
  if (!_licitacaoPregaoAlertSchemaPromise) {
    _licitacaoPregaoAlertSchemaPromise = (async () => {
      const [columns] = await pool.query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM licitacoes LIKE 'alertaPregao'",
      );
      if (!Array.isArray(columns) || columns.length === 0) {
        await pool.query(
          "ALTER TABLE licitacoes ADD COLUMN alertaPregao boolean NOT NULL DEFAULT true AFTER horaInicioDisputa",
        );
      }
      const [observacoesColumns] = await pool.query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM licitacoes LIKE 'observacoesGerais'",
      );
      if (!Array.isArray(observacoesColumns) || observacoesColumns.length === 0) {
        await pool.query(
          "ALTER TABLE licitacoes ADD COLUMN observacoesGerais text NULL AFTER alertaPregao",
        );
      }
    })().catch((error) => {
      _licitacaoPregaoAlertSchemaPromise = null;
      throw error;
    });
  }
  await _licitacaoPregaoAlertSchemaPromise;
}

export async function ensureLicitacaoAdesoesSchema(pool: mysql.Pool) {
  if (!_licitacaoAdesoesSchemaPromise) {
    _licitacaoAdesoesSchemaPromise = (async () => {
      await pool.query(`
      CREATE TABLE IF NOT EXISTS licitacao_adesoes (
        id int AUTO_INCREMENT NOT NULL,
        licitacaoId int NOT NULL,
        orgaoAderente varchar(255) NOT NULL,
        dataAdesao varchar(10) NULL,
        quantidade decimal(18,3) DEFAULT '0',
        entregue boolean DEFAULT false,
        dataEntrega varchar(10) NULL,
        pedidoCrti varchar(50) NULL,
        clienteCrti varchar(255) NULL,
        dataPedidoCrti varchar(10) NULL,
        statusPedidoCrti varchar(80) NULL,
        quantidadePedidoCrti decimal(18,3) DEFAULT '0',
        valorTotalPedidoCrti decimal(18,2) DEFAULT '0',
        observacoes text DEFAULT (''),
        criadoPor varchar(100) DEFAULT 'Sistema',
        criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX licitacao_adesoes_licitacao_idx (licitacaoId),
        INDEX licitacao_adesoes_pedido_idx (pedidoCrti)
      )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS licitacao_adesao_pedidos_crti (
          id int AUTO_INCREMENT NOT NULL,
          adesaoId int NOT NULL,
          licitacaoId int NOT NULL,
          pedidoCrti varchar(50) NOT NULL,
          cliente varchar(255) NULL,
          dataPedido varchar(10) NULL,
          statusPedido varchar(80) NULL,
          quantidade decimal(18,3) DEFAULT '0',
          valorTotal decimal(18,2) DEFAULT '0',
          criadoPor varchar(100) DEFAULT 'Sistema',
          criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
          atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY licitacao_adesao_pedidos_pedido_unique (pedidoCrti),
          INDEX licitacao_adesao_pedidos_adesao_idx (adesaoId),
          INDEX licitacao_adesao_pedidos_licitacao_idx (licitacaoId)
        )
      `);
      const [alertaColumns] = await pool.query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM licitacao_atas LIKE 'alertaVencimento'",
      );
      if (!Array.isArray(alertaColumns) || alertaColumns.length === 0) {
        await pool.query(
          "ALTER TABLE licitacao_atas ADD COLUMN alertaVencimento boolean NOT NULL DEFAULT true AFTER observacoes",
        );
      }
      const [pedidoOrigemColumns] = await pool.query<mysql.RowDataPacket[]>(
        "SHOW COLUMNS FROM licitacao_pedidos_crti LIKE 'origem'",
      );
      if (!Array.isArray(pedidoOrigemColumns) || pedidoOrigemColumns.length === 0) {
        await pool.query(
          "ALTER TABLE licitacao_pedidos_crti ADD COLUMN origem varchar(20) NOT NULL DEFAULT 'CRTI' AFTER pedidoCrti",
        );
      }
    })().catch((error) => {
      _licitacaoAdesoesSchemaPromise = null;
      throw error;
    });
  }
  await _licitacaoAdesoesSchemaPromise;
}

function getLicitacaoPotencial(kmDistancia: unknown) {
  const km = Number(kmDistancia) || 0;
  if (km <= 0) return "";
  if (km <= 200) return "Cliente potencial";
  if (km <= 300) return "Médio potencial";
  return "Cliente distante / fraco potencial";
}

function normalizeLicitacaoStatus(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "Pendente";
  if (["adjucado", "adjudicado"].includes(text.toLowerCase())) return "Adjucado";
  return text;
}

function normalizeMoney(value: unknown) {
  return Number(value) || 0;
}

export async function listLicitacaoOpcoes() {
  const pool = await ensureMysqlPool();
  const [status] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_status ORDER BY nome");
  const [plataformas] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_plataformas ORDER BY nome");
  const [vendedores] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_vendedores ORDER BY nome");
  return { status, plataformas, vendedores };
}

export async function listLicitacaoStatus() {
  const pool = await ensureMysqlPool();
  const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_status ORDER BY nome");
  return rows;
}

export async function createLicitacaoStatus(data: { nome: string }) {
  const pool = await ensureMysqlPool();
  const nome = data.nome.trim();
  await pool.query("INSERT IGNORE INTO licitacao_status (nome) VALUES (?)", [nome]);
  return listLicitacaoStatus();
}

export async function updateLicitacaoStatus(id: number, data: { nome: string }) {
  const pool = await ensureMysqlPool();
  await pool.query("UPDATE licitacao_status SET nome = ? WHERE id = ?", [data.nome.trim(), id]);
  return listLicitacaoStatus();
}

export async function deleteLicitacaoStatus(id: number) {
  const pool = await ensureMysqlPool();
  await pool.query("DELETE FROM licitacao_status WHERE id = ?", [id]);
  return listLicitacaoStatus();
}

export async function listLicitacaoPlataformas() {
  const pool = await ensureMysqlPool();
  const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_plataformas ORDER BY nome");
  return rows;
}

export async function createLicitacaoPlataforma(data: { nome: string; link?: string }) {
  const pool = await ensureMysqlPool();
  await pool.query("INSERT INTO licitacao_plataformas (nome, link) VALUES (?, ?)", [data.nome.trim(), data.link || ""]);
  return listLicitacaoPlataformas();
}

export async function updateLicitacaoPlataforma(id: number, data: { nome: string; link?: string }) {
  const pool = await ensureMysqlPool();
  await pool.query("UPDATE licitacao_plataformas SET nome = ?, link = ? WHERE id = ?", [data.nome.trim(), data.link || "", id]);
  return listLicitacaoPlataformas();
}

export async function deleteLicitacaoPlataforma(id: number) {
  const pool = await ensureMysqlPool();
  await pool.query("DELETE FROM licitacao_plataformas WHERE id = ?", [id]);
  return listLicitacaoPlataformas();
}

export async function listLicitacaoVendedores() {
  const pool = await ensureMysqlPool();
  const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_vendedores ORDER BY nome");
  return rows;
}

export async function createLicitacaoVendedor(data: { nome: string }) {
  const pool = await ensureMysqlPool();
  await pool.query("INSERT IGNORE INTO licitacao_vendedores (nome) VALUES (?)", [data.nome.trim()]);
  return listLicitacaoVendedores();
}

export async function updateLicitacaoVendedor(id: number, data: { nome: string }) {
  const pool = await ensureMysqlPool();
  await pool.query("UPDATE licitacao_vendedores SET nome = ? WHERE id = ?", [data.nome.trim(), id]);
  return listLicitacaoVendedores();
}

export async function deleteLicitacaoVendedor(id: number) {
  const pool = await ensureMysqlPool();
  await pool.query("DELETE FROM licitacao_vendedores WHERE id = ?", [id]);
  return listLicitacaoVendedores();
}

export type LicitacaoInput = {
  data?: string;
  orgao: string;
  cidade?: string;
  status?: string;
  plataformaId?: number | null;
  horaInicioDisputa?: string;
  alertaPregao?: boolean;
  observacoesGerais?: string;
  item?: string;
  tipo?: string;
  qtdeSc?: number;
  valorUnit?: number;
  lanceLimite?: number;
  valorAdjudicado?: number;
  qtdeTn?: number;
  valorInicialContrato?: number;
  kmDistancia?: number;
  regiao?: string;
  statusContrato?: string;
  ataVendedorId?: number | null;
  ataVendedorNome?: string;
};

export async function listLicitacoes(filters?: { search?: string; adjudicadas?: boolean }) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoPregaoAlertSchema(pool);
  const where: string[] = [];
  const params: unknown[] = [];
  const adjucadoCondition = "(LOWER(l.status) LIKE 'adjucado%' OR LOWER(l.status) LIKE 'adjudicado%')";
  if (filters?.adjudicadas) {
    where.push(adjucadoCondition);
  } else if (filters?.adjudicadas === false) {
    where.push(`NOT ${adjucadoCondition}`);
  }
  if (filters?.search?.trim()) {
    const likeValue = `%${filters.search.trim()}%`;
    where.push("(l.orgao LIKE ? OR l.cidade LIKE ? OR l.status LIKE ? OR l.item LIKE ? OR l.tipo LIKE ? OR l.regiao LIKE ? OR pl.nome LIKE ? OR pl.link LIKE ?)");
    params.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue);
  }
  const sql = `
    SELECT
      l.*,
      pl.nome AS plataformaNome,
      pl.link AS plataformaLink,
      COALESCE(SUM(p.quantidade), 0) AS quantidadeVinculada,
      (l.qtdeSc - COALESCE(SUM(p.quantidade), 0)) AS saldoEntrega
    FROM licitacoes l
    LEFT JOIN licitacao_pedidos_crti p ON p.licitacaoId = l.id
    LEFT JOIN licitacao_plataformas pl ON pl.id = l.plataformaId
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY l.id
    ORDER BY l.data DESC, l.id DESC
  `;
  const [rows] = await pool.query<mysql.RowDataPacket[]>(sql, params);
  return rows.map((row): mysql.RowDataPacket => ({
    ...row,
    alertaPregao: Boolean(row.alertaPregao),
  }) as mysql.RowDataPacket);
}

export async function getLicitacao(id: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoPregaoAlertSchema(pool);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`
    SELECT
      l.*,
      pl.nome AS plataformaNome,
      pl.link AS plataformaLink
    FROM licitacoes l
    LEFT JOIN licitacao_plataformas pl ON pl.id = l.plataformaId
    WHERE l.id = ?
    LIMIT 1
  `, [id]);
  if (!rows.length) return null;
  return {
    ...rows[0],
    alertaPregao: Boolean(rows[0].alertaPregao),
    observacoesGerais: String(rows[0].observacoesGerais || ""),
  };
}

export async function listLicitacaoAlertasPregao() {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoPregaoAlertSchema(pool);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`
    SELECT id, data, horaInicioDisputa, orgao, cidade, item, plataformaId
    FROM licitacoes
    WHERE alertaPregao = true
      AND COALESCE(data, '') <> ''
      AND COALESCE(horaInicioDisputa, '') <> ''
    ORDER BY data ASC, horaInicioDisputa ASC, id ASC
  `);
  return rows;
}

export type LicitacaoReportType = "status" | "cidade" | "vendedor" | "adesoes_vendedor" | "entregas";

export async function listLicitacaoReport(
  type: LicitacaoReportType,
  filters: { inicio?: string; fim?: string } = {},
) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const licitacaoDate = "STR_TO_DATE(l.data, IF(l.data LIKE '%/%', '%d/%m/%Y', '%Y-%m-%d'))";
  if (filters.inicio) {
    conditions.push(`${licitacaoDate} >= ?`);
    params.push(filters.inicio);
  }
  if (filters.fim) {
    conditions.push(`${licitacaoDate} <= ?`);
    params.push(filters.fim);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const queries: Record<LicitacaoReportType, string> = {
    status: `
      SELECT COALESCE(NULLIF(TRIM(l.status), ''), 'NÃO INFORMADO') nome,
        COUNT(*) quantidade, COALESCE(SUM(l.qtdeSc), 0) volume,
        COALESCE(SUM(l.valorInicialContrato), 0) valor
      FROM licitacoes l ${where}
      GROUP BY nome ORDER BY quantidade DESC, nome ASC`,
    cidade: `
      SELECT CONCAT(COALESCE(NULLIF(TRIM(l.cidade), ''), 'NÃO INFORMADA'), ' - ', l.orgao) nome,
        COUNT(*) quantidade, COALESCE(SUM(l.qtdeSc), 0) volume,
        COALESCE(SUM(l.valorInicialContrato), 0) valor
      FROM licitacoes l ${where}
      GROUP BY nome ORDER BY quantidade DESC, nome ASC`,
    vendedor: `
      SELECT COALESCE(NULLIF(TRIM(a.vendedorNome), ''), NULLIF(TRIM(l.ataVendedorNome), ''), 'NÃO VINCULADO') nome,
        COUNT(DISTINCT l.id) quantidade, COALESCE(SUM(l.qtdeSc), 0) volume,
        COALESCE(SUM(l.valorInicialContrato), 0) valor
      FROM licitacoes l LEFT JOIN licitacao_atas a ON a.licitacaoId = l.id ${where}
      GROUP BY nome ORDER BY quantidade DESC, nome ASC`,
    adesoes_vendedor: `
      SELECT COALESCE(NULLIF(TRIM(a.vendedorNome), ''), NULLIF(TRIM(l.ataVendedorNome), ''), 'NÃO VINCULADO') nome,
        COUNT(ad.id) quantidade, COALESCE(SUM(ad.quantidade), 0) volume,
        COALESCE(SUM(CASE WHEN ad.entregue = true THEN ad.quantidade ELSE 0 END), 0) valor
      FROM licitacoes l
      LEFT JOIN licitacao_atas a ON a.licitacaoId = l.id
      LEFT JOIN licitacao_adesoes ad ON ad.licitacaoId = l.id
      ${where}
      GROUP BY nome ORDER BY quantidade DESC, nome ASC`,
    entregas: `
      SELECT CASE WHEN ad.entregue = true THEN 'ENTREGUE' ELSE 'PENDENTE' END nome,
        COUNT(ad.id) quantidade, COALESCE(SUM(ad.quantidade), 0) volume,
        COALESCE(SUM(ap.quantidade), 0) valor
      FROM licitacoes l
      INNER JOIN licitacao_adesoes ad ON ad.licitacaoId = l.id
      LEFT JOIN (
        SELECT adesaoId, SUM(quantidade) quantidade
        FROM licitacao_adesao_pedidos_crti GROUP BY adesaoId
      ) ap ON ap.adesaoId = ad.id
      ${where}
      GROUP BY nome ORDER BY nome ASC`,
  };
  const [rows] = await pool.query<mysql.RowDataPacket[]>(queries[type], params);
  return rows.map((row) => ({
    nome: String(row.nome || "NÃO INFORMADO"),
    quantidade: Number(row.quantidade || 0),
    volume: Number(row.volume || 0),
    valor: Number(row.valor || 0),
  }));
}

export async function listLicitacaoAdesaoReportDetails(filters: { inicio?: string; fim?: string } = {}) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const licitacaoDate = "STR_TO_DATE(l.data, IF(l.data LIKE '%/%', '%d/%m/%Y', '%Y-%m-%d'))";
  if (filters.inicio) {
    conditions.push(`${licitacaoDate} >= ?`);
    params.push(filters.inicio);
  }
  if (filters.fim) {
    conditions.push(`${licitacaoDate} <= ?`);
    params.push(filters.fim);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`
    SELECT
      COALESCE(NULLIF(TRIM(a.vendedorNome), ''), NULLIF(TRIM(l.ataVendedorNome), ''), 'NÃO VINCULADO') vendedor,
      l.orgao, l.cidade, ad.orgaoAderente, ad.dataAdesao,
      ad.quantidade, CASE WHEN ad.entregue = true THEN 'SIM' ELSE 'NÃO' END entregue,
      ad.dataEntrega, COALESCE(ap.pedidos, 0) pedidos,
      COALESCE(ap.quantidadeAtendida, 0) quantidadeAtendida,
      GREATEST(ad.quantidade - COALESCE(ap.quantidadeAtendida, 0), 0) saldo
    FROM licitacoes l
    LEFT JOIN licitacao_atas a ON a.licitacaoId = l.id
    INNER JOIN licitacao_adesoes ad ON ad.licitacaoId = l.id
    LEFT JOIN (
      SELECT adesaoId, COUNT(*) pedidos, SUM(quantidade) quantidadeAtendida
      FROM licitacao_adesao_pedidos_crti GROUP BY adesaoId
    ) ap ON ap.adesaoId = ad.id
    ${where}
    ORDER BY vendedor ASC,
      STR_TO_DATE(ad.dataAdesao, IF(ad.dataAdesao LIKE '%/%', '%d/%m/%Y', '%Y-%m-%d')) DESC,
      ad.id DESC
  `, params);
  return rows.map((row) => ({
    vendedor: String(row.vendedor || "NÃO VINCULADO"),
    licitacao: `${String(row.orgao || "")}${row.cidade ? ` - ${row.cidade}` : ""}`,
    orgaoAderente: String(row.orgaoAderente || ""),
    dataAdesao: String(row.dataAdesao || ""),
    quantidade: Number(row.quantidade || 0),
    entregue: String(row.entregue || "NÃO"),
    dataEntrega: String(row.dataEntrega || ""),
    pedidos: Number(row.pedidos || 0),
    quantidadeAtendida: Number(row.quantidadeAtendida || 0),
    saldo: Number(row.saldo || 0),
  }));
}

export async function createLicitacao(data: LicitacaoInput & { criadoPor?: string }) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoPregaoAlertSchema(pool);
  const status = normalizeLicitacaoStatus(data.status);
  const potencial = getLicitacaoPotencial(data.kmDistancia);
  const [result] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO licitacoes (
      data, orgao, cidade, status, plataformaId, horaInicioDisputa, alertaPregao, observacoesGerais, item, tipo, qtdeSc, valorUnit,
      lanceLimite, valorAdjudicado, qtdeTn, valorInicialContrato, kmDistancia,
      potencialCliente, regiao, statusContrato, ataVendedorId, ataVendedorNome, criadoPor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.data || "",
      data.orgao.trim(),
      data.cidade || "",
      status,
      data.plataformaId || null,
      data.horaInicioDisputa || "",
      data.alertaPregao !== false,
      data.observacoesGerais || "",
      data.item || "",
      data.tipo || "",
      normalizeMoney(data.qtdeSc),
      normalizeMoney(data.valorUnit),
      normalizeMoney(data.lanceLimite),
      normalizeMoney(data.valorAdjudicado),
      normalizeMoney(data.qtdeTn),
      normalizeMoney(data.valorInicialContrato),
      normalizeMoney(data.kmDistancia),
      potencial,
      data.regiao || "",
      data.statusContrato || "Pendente",
      data.ataVendedorId || null,
      data.ataVendedorNome || "NA",
      data.criadoPor || "Sistema",
    ],
  );
  return { id: result.insertId };
}

export async function updateLicitacao(id: number, data: LicitacaoInput) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoPregaoAlertSchema(pool);
  const status = normalizeLicitacaoStatus(data.status);
  await pool.query(
    `UPDATE licitacoes SET
      data = ?, orgao = ?, cidade = ?, status = ?, plataformaId = ?, horaInicioDisputa = ?, alertaPregao = ?, observacoesGerais = ?, item = ?, tipo = ?,
      qtdeSc = ?, valorUnit = ?, lanceLimite = ?, valorAdjudicado = ?, qtdeTn = ?,
      valorInicialContrato = ?, kmDistancia = ?, potencialCliente = ?, regiao = ?,
      statusContrato = ?, ataVendedorId = ?, ataVendedorNome = ?
    WHERE id = ?`,
    [
      data.data || "",
      data.orgao.trim(),
      data.cidade || "",
      status,
      data.plataformaId || null,
      data.horaInicioDisputa || "",
      data.alertaPregao !== false,
      data.observacoesGerais || "",
      data.item || "",
      data.tipo || "",
      normalizeMoney(data.qtdeSc),
      normalizeMoney(data.valorUnit),
      normalizeMoney(data.lanceLimite),
      normalizeMoney(data.valorAdjudicado),
      normalizeMoney(data.qtdeTn),
      normalizeMoney(data.valorInicialContrato),
      normalizeMoney(data.kmDistancia),
      getLicitacaoPotencial(data.kmDistancia),
      data.regiao || "",
      data.statusContrato || "Pendente",
      data.ataVendedorId || null,
      data.ataVendedorNome || "NA",
      id,
    ],
  );
  await pool.query(
    "UPDATE licitacao_atas SET vendedorId = ?, vendedorNome = ? WHERE licitacaoId = ?",
    [data.ataVendedorId || null, data.ataVendedorNome || "NA", id],
  );
  const [persistedRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT observacoesGerais FROM licitacoes WHERE id = ? LIMIT 1",
    [id],
  );
  if (!persistedRows.length) {
    throw new Error("A licitação não foi encontrada após a atualização.");
  }
  const observacoesPersistidas = String(persistedRows[0].observacoesGerais || "");
  const observacoesEnviadas = String(data.observacoesGerais || "");
  if (observacoesPersistidas !== observacoesEnviadas) {
    throw new Error("O banco não confirmou a gravação das observações gerais da licitação.");
  }
  return { success: true, observacoesGerais: observacoesPersistidas };
}

export async function deleteLicitacao(id: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM licitacao_adesao_pedidos_crti WHERE licitacaoId = ?", [id]);
    await connection.query("DELETE FROM licitacao_adesoes WHERE licitacaoId = ?", [id]);
    await connection.query("DELETE FROM licitacao_pedidos_crti WHERE licitacaoId = ?", [id]);
    await connection.query("DELETE FROM licitacao_atas WHERE licitacaoId = ?", [id]);
    await connection.query("DELETE FROM licitacoes WHERE id = ?", [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { success: true };
}

export async function getLicitacaoAta(licitacaoId: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM licitacao_atas WHERE licitacaoId = ? LIMIT 1", [licitacaoId]);
  if (rows[0]) return rows[0];

  const [licitacaoRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id AS licitacaoId, ataVendedorId AS vendedorId, ataVendedorNome AS vendedorNome, qtdeSc AS quantidadeOriginal
     FROM licitacoes
     WHERE id = ? AND ataVendedorId IS NOT NULL
     LIMIT 1`,
    [licitacaoId],
  );
  const licitacao = licitacaoRows[0];
  if (!licitacao) return null;

  const quantidadeOriginal = Number(licitacao.quantidadeOriginal) || 0;
  return {
    ...licitacao,
    validadeAta: "",
    quantidadeOriginal,
    limiteIndividual: quantidadeOriginal * 0.5,
    limiteColetivo: quantidadeOriginal * 2,
    observacoes: "",
    alertaVencimento: true,
  };
}

export async function listLicitacaoAtasVencendo() {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      a.licitacaoId,
      l.orgao,
      l.cidade,
      a.validadeAta,
      DATEDIFF(
        COALESCE(STR_TO_DATE(a.validadeAta, '%Y-%m-%d'), STR_TO_DATE(a.validadeAta, '%d/%m/%Y')),
        CURDATE()
      ) AS diasParaVencer
    FROM licitacao_atas a
    INNER JOIN licitacoes l ON l.id = a.licitacaoId
    WHERE a.alertaVencimento = true
      AND COALESCE(STR_TO_DATE(a.validadeAta, '%Y-%m-%d'), STR_TO_DATE(a.validadeAta, '%d/%m/%Y'))
        BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    ORDER BY diasParaVencer ASC, l.orgao ASC`,
  );
  return rows;
}

export async function saveLicitacaoAta(data: {
  licitacaoId: number;
  vendedorId?: number | null;
  vendedorNome?: string;
  validadeAta?: string;
  quantidadeOriginal?: number;
  observacoes?: string;
  alertaVencimento?: boolean;
}) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const quantidadeOriginal = normalizeMoney(data.quantidadeOriginal);
  const limiteIndividual = quantidadeOriginal * 0.5;
  const limiteColetivo = quantidadeOriginal * 2;
  const [adesaoRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      COALESCE(MAX(quantidade), 0) AS maiorQuantidade,
      COALESCE(SUM(quantidade), 0) AS quantidadeTotal
    FROM licitacao_adesoes
    WHERE licitacaoId = ?`,
    [data.licitacaoId],
  );
  const adesaoStats = adesaoRows[0] || {};
  if (limiteIndividual > 0 && Number(adesaoStats.maiorQuantidade) > limiteIndividual) {
    throw new Error("A nova quantidade original deixaria uma adesão acima do limite individual de 50%.");
  }
  if (limiteColetivo > 0 && Number(adesaoStats.quantidadeTotal) > limiteColetivo) {
    throw new Error("A nova quantidade original deixaria as adesões acima do limite coletivo de 200%.");
  }
  const values = [
    data.vendedorId || null,
    data.vendedorNome || "NA",
    data.validadeAta || "",
    quantidadeOriginal,
    limiteIndividual,
    limiteColetivo,
    data.observacoes || "",
    data.alertaVencimento !== false,
  ];
  const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id FROM licitacao_atas WHERE licitacaoId = ? LIMIT 1",
    [data.licitacaoId],
  );
  const existing = existingRows[0];
  if (existing) {
    await pool.query(
      `UPDATE licitacao_atas SET
        vendedorId = ?,
        vendedorNome = ?,
        validadeAta = ?,
        quantidadeOriginal = ?,
        limiteIndividual = ?,
        limiteColetivo = ?,
        observacoes = ?,
        alertaVencimento = ?
      WHERE licitacaoId = ?`,
      [...values, data.licitacaoId],
    );
  } else {
    await pool.query(
      `INSERT INTO licitacao_atas (
        vendedorId, vendedorNome, validadeAta, quantidadeOriginal, limiteIndividual, limiteColetivo, observacoes, alertaVencimento, licitacaoId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, data.licitacaoId],
    );
  }
  return getLicitacaoAta(data.licitacaoId);
}

export async function buscarPedidoCrtiLicitacao(pedidoCrti: string) {
  const pool = await ensureMysqlPool();
  const codigo = String(pedidoCrti || "").trim();
  if (!codigo) return null;

  try {
    const crtiPedido = await withCrtiLicitacaoClient(async (client) => {
      const table = quoteCrtiIdentifierPath(process.env.CRTI_TABLE_APROVADOS || "public.pedidos_venda_material");
      const query = `
        SELECT
          pedidos.numeropedido::text AS pedido,
          MAX(pedidos.nomecliente) AS cliente,
          MIN(pedidos.datapedido) AS "dataPedido",
          MAX(pedidos.situacaopedido) AS status,
          SUM(COALESCE(pedidos.quantidadepedido, 0)) AS qtde,
          SUM(COALESCE(pedidos.valortotalitem, 0)) AS "totalPedido"
        FROM ${table} pedidos
        WHERE TRIM(pedidos.numeropedido::text) = $1
        GROUP BY pedidos.numeropedido
        LIMIT 1
      `;
      const { rows } = await client.query(query, [codigo]);
      return rows[0] || null;
    });

    if (crtiPedido) {
      return crtiPedido;
    }
  } catch (error) {
    console.warn(`[Licitacoes] Falha ao buscar pedido ${codigo} diretamente no CRTI, usando fallback local:`, error);
  }

  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      pedido,
      cliente,
      dataPedido,
      COALESCE(NULLIF(status, ''), NULLIF(situacao, ''), '') AS status,
      qtde,
      totalPedido
    FROM pedidos
    WHERE TRIM(CAST(pedido AS CHAR)) = ?
    LIMIT 1`,
    [codigo],
  );

  return rows[0] || null;
}

function formatLicitacaoDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("pt-BR");
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return text.slice(0, 10);
}

async function hydratePedidoCrtiLicitacao(data: {
  pedidoCrti: string;
  cliente?: string;
  dataPedido?: string;
  statusPedido?: string;
  quantidade?: number;
  valorTotal?: number;
}) {
  const pedido = await buscarPedidoCrtiLicitacao(data.pedidoCrti);
  if (!pedido) {
    throw new Error("Pedido CRTI não encontrado na tabela comercial de pedidos.");
  }

  return {
    ...data,
    pedidoCrti: String(pedido.pedido || data.pedidoCrti || "").trim(),
    cliente: String(pedido.cliente || ""),
    dataPedido: formatLicitacaoDate(pedido.dataPedido),
    statusPedido: String(pedido.status || ""),
    quantidade: normalizeMoney(pedido.qtde),
    valorTotal: normalizeMoney(pedido.totalPedido),
  };
}

async function assertPedidoCrtiDisponivel(pool: mysql.Pool, pedidoCrti: string, currentId?: number, currentAdesaoId?: number) {
  await ensureLicitacaoAdesoesSchema(pool);
  const codigo = String(pedidoCrti || "").trim();
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      vinculo.id,
      vinculo.licitacaoId,
      vinculo.orgao,
      vinculo.cidade
    FROM (
      SELECT lp.id, lp.licitacaoId, l.orgao, l.cidade
      FROM licitacao_pedidos_crti lp
      LEFT JOIN licitacoes l ON l.id = lp.licitacaoId
      WHERE TRIM(CAST(lp.pedidoCrti AS CHAR)) = ?
        AND (? IS NULL OR lp.id <> ?)
      UNION ALL
      SELECT lap.id, lap.licitacaoId, la.orgaoAderente AS orgao, l.cidade
      FROM licitacao_adesao_pedidos_crti lap
      LEFT JOIN licitacao_adesoes la ON la.id = lap.adesaoId
      LEFT JOIN licitacoes l ON l.id = lap.licitacaoId
      WHERE TRIM(CAST(lap.pedidoCrti AS CHAR)) = ?
        AND (? IS NULL OR lap.id <> ?)
    ) vinculo
    LIMIT 1`,
    [codigo, currentId || null, currentId || null, codigo, currentAdesaoId || null, currentAdesaoId || null],
  );

  const existing = rows[0];
  if (!existing) return;

  const orgao = String(existing.orgao || "licitação").trim();
  const cidade = String(existing.cidade || "").trim();
  const destino = cidade ? `${orgao} - ${cidade}` : orgao;
  throw new Error(`Pedido CRTI ${codigo} já está vinculado na licitação ${destino}.`);
}

type LicitacaoAdesaoInput = {
  licitacaoId: number;
  orgaoAderente: string;
  dataAdesao?: string;
  quantidade: number;
  entregue?: boolean;
  dataEntrega?: string;
  pedidoCrti?: string;
  observacoes?: string;
  criadoPor?: string;
};

export async function listLicitacaoAdesoes(licitacaoId: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [ataRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      COALESCE(a.limiteIndividual, l.qtdeSc * 0.5) AS limiteIndividual,
      COALESCE(a.limiteColetivo, l.qtdeSc * 2) AS limiteColetivo
    FROM licitacoes l
    LEFT JOIN licitacao_atas a ON a.licitacaoId = l.id
    WHERE l.id = ?
    LIMIT 1`,
    [licitacaoId],
  );
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      la.*,
      COALESCE(pedidos.quantidadeEntregue, 0) AS quantidadePedidoCrti,
      COALESCE(pedidos.totalPedidos, 0) AS totalPedidos,
      (COALESCE(la.quantidade, 0) - COALESCE(pedidos.quantidadeEntregue, 0)) AS saldoEntrega
    FROM licitacao_adesoes la
    LEFT JOIN (
      SELECT adesaoId, SUM(quantidade) AS quantidadeEntregue, COUNT(*) AS totalPedidos
      FROM licitacao_adesao_pedidos_crti
      GROUP BY adesaoId
    ) pedidos ON pedidos.adesaoId = la.id
    WHERE la.licitacaoId = ?
    ORDER BY la.id DESC`,
    [licitacaoId],
  );
  const ata = ataRows[0] || {};
  const quantidadeUtilizada = rows.reduce((total, item) => total + (Number(item.quantidade) || 0), 0);
  return {
    items: rows,
    adesoesUtilizadas: rows.length,
    limiteIndividual: Number(ata.limiteIndividual) || 0,
    limiteColetivo: Number(ata.limiteColetivo) || 0,
    quantidadeUtilizada,
    saldoColetivo: (Number(ata.limiteColetivo) || 0) - quantidadeUtilizada,
  };
}

async function prepareLicitacaoAdesao(pool: mysql.Pool, data: LicitacaoAdesaoInput, currentId?: number) {
  await ensureLicitacaoAdesoesSchema(pool);
  const [ataRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      COALESCE(a.limiteIndividual, l.qtdeSc * 0.5) AS limiteIndividual,
      COALESCE(a.limiteColetivo, l.qtdeSc * 2) AS limiteColetivo
    FROM licitacoes l
    LEFT JOIN licitacao_atas a ON a.licitacaoId = l.id
    WHERE l.id = ? AND l.ataVendedorId IS NOT NULL
    LIMIT 1`,
    [data.licitacaoId],
  );
  const ata = ataRows[0];
  if (!ata) throw new Error("Vincule um vendedor à licitação antes de cadastrar adesões.");

  const quantidade = normalizeMoney(data.quantidade);
  const limiteIndividual = Number(ata.limiteIndividual) || 0;
  if (limiteIndividual > 0 && quantidade > limiteIndividual) {
    throw new Error(`A quantidade da adesão excede o limite individual de ${limiteIndividual}.`);
  }

  const [totalRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COALESCE(SUM(quantidade), 0) AS quantidade FROM licitacao_adesoes WHERE licitacaoId = ? AND (? IS NULL OR id <> ?)",
    [data.licitacaoId, currentId || null, currentId || null],
  );
  const quantidadeTotal = (Number(totalRows[0]?.quantidade) || 0) + quantidade;
  const limiteColetivo = Number(ata.limiteColetivo) || 0;
  if (limiteColetivo > 0 && quantidadeTotal > limiteColetivo) {
    throw new Error(`A soma das adesões excede o limite coletivo de ${limiteColetivo}.`);
  }

  const entregue = Boolean(data.entregue);
  if (entregue && !data.dataEntrega) {
    throw new Error("Para marcar a entrega como Sim, informe a data de entrega.");
  }
  return { quantidade, entregue };
}

export async function createLicitacaoAdesao(data: LicitacaoAdesaoInput) {
  const pool = await ensureMysqlPool();
  const prepared = await prepareLicitacaoAdesao(pool, data);
  await pool.query(
    `INSERT INTO licitacao_adesoes (
      licitacaoId, orgaoAderente, dataAdesao, quantidade, entregue, dataEntrega, pedidoCrti,
      clienteCrti, dataPedidoCrti, statusPedidoCrti, quantidadePedidoCrti, valorTotalPedidoCrti,
      observacoes, criadoPor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.licitacaoId, data.orgaoAderente.trim(), data.dataAdesao || "", prepared.quantidade,
      prepared.entregue, prepared.entregue ? data.dataEntrega || "" : "", null,
      "", "", "", 0, 0, data.observacoes || "", data.criadoPor || "Sistema",
    ],
  );
  return listLicitacaoAdesoes(data.licitacaoId);
}

export async function updateLicitacaoAdesao(id: number, data: LicitacaoAdesaoInput) {
  const pool = await ensureMysqlPool();
  const prepared = await prepareLicitacaoAdesao(pool, data, id);
  await pool.query(
    `UPDATE licitacao_adesoes SET
      orgaoAderente = ?, dataAdesao = ?, quantidade = ?, entregue = ?, dataEntrega = ?, pedidoCrti = ?,
      clienteCrti = ?, dataPedidoCrti = ?, statusPedidoCrti = ?, quantidadePedidoCrti = ?,
      valorTotalPedidoCrti = ?, observacoes = ?
    WHERE id = ? AND licitacaoId = ?`,
    [
      data.orgaoAderente.trim(), data.dataAdesao || "", prepared.quantidade, prepared.entregue,
      prepared.entregue ? data.dataEntrega || "" : "", null,
      "", "", "", 0, 0, data.observacoes || "", id, data.licitacaoId,
    ],
  );
  return listLicitacaoAdesoes(data.licitacaoId);
}

export async function deleteLicitacaoAdesao(id: number, licitacaoId: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  await pool.query("DELETE FROM licitacao_adesao_pedidos_crti WHERE adesaoId = ? AND licitacaoId = ?", [id, licitacaoId]);
  await pool.query("DELETE FROM licitacao_adesoes WHERE id = ? AND licitacaoId = ?", [id, licitacaoId]);
  return listLicitacaoAdesoes(licitacaoId);
}

export async function listLicitacaoAdesaoPedidosCrti(adesaoId: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [adesaoRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id, licitacaoId, quantidade FROM licitacao_adesoes WHERE id = ? LIMIT 1",
    [adesaoId],
  );
  const adesao = adesaoRows[0];
  if (!adesao) throw new Error("Adesão não encontrada.");
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT * FROM licitacao_adesao_pedidos_crti WHERE adesaoId = ? ORDER BY id DESC",
    [adesaoId],
  );
  const entregue = rows.reduce((total, pedido) => total + (Number(pedido.quantidade) || 0), 0);
  const quantidadeBase = Number(adesao.quantidade) || 0;
  return { items: rows, quantidadeBase, entregue, saldoEntrega: quantidadeBase - entregue };
}

export async function createLicitacaoAdesaoPedidoCrti(data: {
  adesaoId: number;
  licitacaoId: number;
  pedidoCrti: string;
  criadoPor?: string;
}) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [adesaoRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id FROM licitacao_adesoes WHERE id = ? AND licitacaoId = ? LIMIT 1",
    [data.adesaoId, data.licitacaoId],
  );
  if (!adesaoRows[0]) throw new Error("Adesão não encontrada nesta licitação.");

  const pedido = await hydratePedidoCrtiLicitacao({ pedidoCrti: data.pedidoCrti });
  await assertPedidoCrtiDisponivel(pool, pedido.pedidoCrti);
  await pool.query(
    `INSERT INTO licitacao_adesao_pedidos_crti (
      adesaoId, licitacaoId, pedidoCrti, cliente, dataPedido, statusPedido, quantidade, valorTotal, criadoPor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.adesaoId, data.licitacaoId, pedido.pedidoCrti, pedido.cliente || "", pedido.dataPedido || "",
      pedido.statusPedido || "", normalizeMoney(pedido.quantidade), normalizeMoney(pedido.valorTotal), data.criadoPor || "Sistema",
    ],
  );
  return listLicitacaoAdesaoPedidosCrti(data.adesaoId);
}

export async function deleteLicitacaoAdesaoPedidoCrti(id: number, adesaoId: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  await pool.query("DELETE FROM licitacao_adesao_pedidos_crti WHERE id = ? AND adesaoId = ?", [id, adesaoId]);
  return listLicitacaoAdesaoPedidosCrti(adesaoId);
}

export async function listLicitacaoPedidosCrti(licitacaoId: number) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [licitacaoRows] = await pool.query<mysql.RowDataPacket[]>("SELECT qtdeSc FROM licitacoes WHERE id = ? LIMIT 1", [licitacaoId]);
  const quantidadeBase = Number(licitacaoRows[0]?.qtdeSc) || 0;
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
      lp.id,
      lp.licitacaoId,
      lp.pedidoCrti,
      COALESCE(NULLIF(lp.origem, ''), 'CRTI') AS origem,
      COALESCE(NULLIF(lp.cliente, ''), p.cliente, '') AS cliente,
      COALESCE(NULLIF(lp.dataPedido, ''), p.dataPedido, '') AS dataPedido,
      COALESCE(NULLIF(lp.statusPedido, ''), NULLIF(p.status, ''), NULLIF(p.situacao, ''), '') AS statusPedido,
      COALESCE(NULLIF(lp.quantidade, 0), p.qtde, 0) AS quantidade,
      COALESCE(NULLIF(lp.valorTotal, 0), p.totalPedido, 0) AS valorTotal,
      lp.saldoEntrega,
      lp.observacoes,
      lp.criadoPor,
      lp.criadoEm,
      lp.atualizadoEm
    FROM licitacao_pedidos_crti lp
    LEFT JOIN pedidos p
      ON TRIM(CAST(p.pedido AS CHAR)) = TRIM(CAST(lp.pedidoCrti AS CHAR))
    WHERE lp.licitacaoId = ?
    ORDER BY lp.id DESC`,
    [licitacaoId],
  );
  const entregue = rows.reduce((acc, row) => acc + (Number(row.quantidade) || 0), 0);
  return {
    items: rows,
    quantidadeBase,
    entregue,
    saldoEntrega: quantidadeBase - entregue,
  };
}

export async function createLicitacaoPedidoCrti(data: {
  licitacaoId: number;
  pedidoCrti: string;
  cliente?: string;
  dataPedido?: string;
  statusPedido?: string;
  quantidade?: number;
  valorTotal?: number;
  observacoes?: string;
  criadoPor?: string;
}) {
  const pool = await ensureMysqlPool();
  const enriched = await hydratePedidoCrtiLicitacao(data);
  await assertPedidoCrtiDisponivel(pool, enriched.pedidoCrti);
  await pool.query(
    `INSERT INTO licitacao_pedidos_crti (
      licitacaoId, pedidoCrti, cliente, dataPedido, statusPedido, quantidade, valorTotal, saldoEntrega, observacoes, criadoPor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      data.licitacaoId,
      enriched.pedidoCrti,
      enriched.cliente || "",
      enriched.dataPedido || "",
      enriched.statusPedido || "",
      normalizeMoney(enriched.quantidade),
      normalizeMoney(enriched.valorTotal),
      data.observacoes || "",
      data.criadoPor || "Sistema",
    ],
  );
  return listLicitacaoPedidosCrti(data.licitacaoId);
}

type LicitacaoPedidoManualInput = {
  licitacaoId: number;
  pedidoCrti: string;
  cliente: string;
  dataPedido?: string;
  statusPedido?: string;
  quantidade: number;
  valorTotal?: number;
  observacoes?: string;
  criadoPor?: string;
};

export async function createLicitacaoPedidoManual(data: LicitacaoPedidoManualInput) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const codigo = String(data.pedidoCrti || "").trim();
  await assertPedidoCrtiDisponivel(pool, codigo);
  await pool.query(
    `INSERT INTO licitacao_pedidos_crti (
      licitacaoId, pedidoCrti, origem, cliente, dataPedido, statusPedido,
      quantidade, valorTotal, saldoEntrega, observacoes, criadoPor
    ) VALUES (?, ?, 'MANUAL', ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      data.licitacaoId,
      codigo,
      String(data.cliente || "").trim(),
      data.dataPedido || "",
      String(data.statusPedido || "PEDIDO MANUAL").trim(),
      normalizeMoney(data.quantidade),
      normalizeMoney(data.valorTotal),
      data.observacoes || "",
      data.criadoPor || "Sistema",
    ],
  );
  return listLicitacaoPedidosCrti(data.licitacaoId);
}

export async function updateLicitacaoPedidoManual(id: number, data: LicitacaoPedidoManualInput) {
  const pool = await ensureMysqlPool();
  await ensureLicitacaoAdesoesSchema(pool);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id, origem FROM licitacao_pedidos_crti WHERE id = ? AND licitacaoId = ? LIMIT 1",
    [id, data.licitacaoId],
  );
  if (!rows[0]) throw new Error("Pedido manual não encontrado nesta licitação.");
  if (String(rows[0].origem || "CRTI").toUpperCase() !== "MANUAL") {
    throw new Error("Pedidos integrados ao CRTI não podem ser alterados manualmente.");
  }
  const codigo = String(data.pedidoCrti || "").trim();
  await assertPedidoCrtiDisponivel(pool, codigo, id);
  await pool.query(
    `UPDATE licitacao_pedidos_crti SET
      pedidoCrti = ?, cliente = ?, dataPedido = ?, statusPedido = ?, quantidade = ?,
      valorTotal = ?, observacoes = ?
    WHERE id = ? AND licitacaoId = ? AND origem = 'MANUAL'`,
    [
      codigo,
      String(data.cliente || "").trim(),
      data.dataPedido || "",
      String(data.statusPedido || "PEDIDO MANUAL").trim(),
      normalizeMoney(data.quantidade),
      normalizeMoney(data.valorTotal),
      data.observacoes || "",
      id,
      data.licitacaoId,
    ],
  );
  return listLicitacaoPedidosCrti(data.licitacaoId);
}

export async function updateLicitacaoPedidoCrti(id: number, data: {
  licitacaoId: number;
  pedidoCrti: string;
  cliente?: string;
  dataPedido?: string;
  statusPedido?: string;
  quantidade?: number;
  valorTotal?: number;
  observacoes?: string;
}) {
  const pool = await ensureMysqlPool();
  const enriched = await hydratePedidoCrtiLicitacao(data);
  await assertPedidoCrtiDisponivel(pool, enriched.pedidoCrti, id);
  await pool.query(
    `UPDATE licitacao_pedidos_crti SET
      pedidoCrti = ?, cliente = ?, dataPedido = ?, statusPedido = ?, quantidade = ?, valorTotal = ?, observacoes = ?
    WHERE id = ?`,
    [
      enriched.pedidoCrti,
      enriched.cliente || "",
      enriched.dataPedido || "",
      enriched.statusPedido || "",
      normalizeMoney(enriched.quantidade),
      normalizeMoney(enriched.valorTotal),
      data.observacoes || "",
      id,
    ],
  );
  return listLicitacaoPedidosCrti(data.licitacaoId);
}

export async function deleteLicitacaoPedidoCrti(id: number, licitacaoId: number) {
  const pool = await ensureMysqlPool();
  await pool.query("DELETE FROM licitacao_pedidos_crti WHERE id = ?", [id]);
  return listLicitacaoPedidosCrti(licitacaoId);
}

export async function updateEstoqueMovimentacao(
  id: number,
  data: {
    dataMovimentacao?: string;
    estoqueInicial?: number;
    producaoSacos?: number;
    saidaSacos?: number;
    entradaGranelTon?: number;
    saidaGranelTon?: number;
    ocorrencias?: string;
  },
  usuario: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values: Record<string, unknown> = {
    atualizadoPor: usuario,
    atualizadoEm: new Date(),
  };
  if (data.dataMovimentacao !== undefined) values.dataMovimentacao = data.dataMovimentacao;
  if (data.estoqueInicial !== undefined) values.estoqueInicial = String(data.estoqueInicial);
  if (data.producaoSacos !== undefined) values.producaoSacos = String(data.producaoSacos);
  if (data.saidaSacos !== undefined) values.saidaSacos = String(data.saidaSacos);
  if (data.entradaGranelTon !== undefined) values.entradaGranelTon = String(data.entradaGranelTon);
  if (data.saidaGranelTon !== undefined) values.saidaGranelTon = String(data.saidaGranelTon);
  if (data.ocorrencias !== undefined) values.ocorrencias = data.ocorrencias;

  return db.update(estoqueMovimentacoes).set(values).where(eq(estoqueMovimentacoes.id, id));
}

export async function deleteEstoqueMovimentacao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.id, id));
}
