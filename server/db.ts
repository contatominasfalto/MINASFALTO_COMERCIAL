import { eq, and, or, like, desc, asc, isNull, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users, pedidos, historico, contatos, sincronizacaoCrti, estoqueMovimentacoes } from "../drizzle/schema";
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

// ─────────────────────────────────────────────
// CONTATOS
// ─────────────────────────────────────────────

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
