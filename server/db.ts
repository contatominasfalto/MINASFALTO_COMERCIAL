import { eq, and, or, like, desc, asc, isNull, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertUser,
  users,
  pedidos,
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

    const textFields = ["name", "email", "loginMethod"] as const;
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
          SUM(COALESCE(valor, 0)) AS totalReceitas,
          SUM(CASE WHEN status = 'Nfe' THEN COALESCE(valor, 0) ELSE 0 END) AS totalNfeReceitas
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
      params.push("Concluido", "ConcluÃ­do");
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
          SUM(COALESCE(valor, 0)) AS totalReceitas,
          SUM(CASE WHEN status = 'Nfe' THEN COALESCE(valor, 0) ELSE 0 END) AS totalNfeReceitas
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
}) {
  const page = Math.max(1, Math.trunc(filters?.page || 1));
  const pageSize = Math.min(200, Math.max(10, Math.trunc(filters?.pageSize || 50)));
  const offset = (page - 1) * pageSize;

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
    whereSql.push("NOT EXISTS (SELECT 1 FROM pedido_obra_despesas pod_filter WHERE pod_filter.despesaTabelaGeralId = despesas_tabela_geral.id)");
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
        FROM pedido_obra_despesas
        WHERE despesaTabelaGeralId IS NOT NULL
        GROUP BY despesaTabelaGeralId
      ) pod ON pod.despesaTabelaGeralId = despesas_tabela_geral.id
      ${whereClause}
      ORDER BY despesas_tabela_geral.id DESC
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
    whereSql.push("NOT EXISTS (SELECT 1 FROM pedido_obra_despesas pod_filter WHERE pod_filter.despesaTabelaGeralId = despesas_tabela_geral.id)");
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
        FROM pedido_obra_despesas
        WHERE despesaTabelaGeralId IS NOT NULL
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
          numeroDocumento,
          status,
          tipoReceitaOutros,
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
          numeroDocumento,
          status,
          '' AS tipoReceitaOutros,
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
  };
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
  numeroDocumento?: string;
  status: "Nfe" | "Faturamento Direto" | "Outros";
  tipoReceitaOutros?: string;
  data?: string;
  valor: number;
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
        numeroDocumento,
        status,
        tipoReceitaOutros,
        \`data\`,
        valor,
        descricao,
        criadoPor
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.pedidoObraId,
      data.pedidoNum,
      data.numeroDocumento || "",
      data.status,
      data.status === "Outros" ? data.tipoReceitaOutros || "" : "",
      data.data || "",
      data.valor,
      data.descricao || "",
      data.criadoPor || "Sistema",
    ],
  );

  return result;
}

export async function updatePedidoObraReceita(data: {
  id: number;
  pedidoObraId: number;
  numeroDocumento?: string;
  status: "Nfe" | "Faturamento Direto" | "Outros";
  tipoReceitaOutros?: string;
  data?: string;
  valor: number;
  descricao?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!_pool) throw new Error("Database pool not available");

  const [result] = await _pool.query(
    `
      UPDATE pedido_obra_receitas
      SET
        numeroDocumento = ?,
        status = ?,
        tipoReceitaOutros = ?,
        \`data\` = ?,
        valor = ?,
        descricao = ?,
        atualizadoEm = CURRENT_TIMESTAMP
      WHERE id = ? AND pedidoObraId = ?
    `,
    [
      data.numeroDocumento || "",
      data.status,
      data.status === "Outros" ? data.tipoReceitaOutros || "" : "",
      data.data || "",
      data.valor,
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

  const whereSql = ["NOT EXISTS (SELECT 1 FROM pedido_obra_despesas pod WHERE pod.despesaTabelaGeralId = dtg.id)"];
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
        AND (
          COALESCE(dtg.complemento, '') REGEXP '[oO][[:space:]]*[0-9]+'
          OR COALESCE(dtg.observacoesAprovacao, '') REGEXP '[oO][[:space:]]*[0-9]+'
        )
      ORDER BY dtg.id DESC
    `,
  );

  const connection = await _pool.getConnection();
  let vinculadas = 0;
  let semPedido = 0;
  let jaVinculadas = 0;
  const despesasProcessadas = despesas.length;
  const linkedExpenseIds = new Set<number>();

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
    vinculadas,
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
    return { insertId: demoContatos.length };
  }

  return db.insert(contatos).values({
    pedidoId: data.pedidoId,
    pedidoNum: data.pedidoNum,
    tipo: data.tipo || "Ligação",
    descricao: data.descricao,
    usuario: data.usuario || "Sistema",
  });
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
