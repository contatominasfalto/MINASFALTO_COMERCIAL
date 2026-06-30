/**
 * Modulo de sincronizacao com CRTI (PostgreSQL).
 * Sincroniza pedidos ASFALTO TAPFACIL SC e ASFALTO TAPFACIL GRANEL.
 */

import "dotenv/config";
import { Client, type ClientConfig } from "pg";
import * as db from "./db";

const LOCAL_STATUS_SAIDA_OK = "SA\u00cdDA OK";
const DEFAULT_SYNC_DAYS = 120;

const CRTI_CONFIG = {
  host: process.env.CRTI_HOST || "minasfaltocrtierp.postgres.database.azure.com",
  port: Number.parseInt(process.env.CRTI_PORT || "5432", 10),
  database: process.env.CRTI_DATABASE || "postgres",
  user: process.env.CRTI_USER || "minasfaltocrtierpadmin",
  password: process.env.CRTI_PASSWORD || "",
  ssl: envFlag("CRTI_SSL", true),
  sslRejectUnauthorized: envFlag("CRTI_SSL_REJECT_UNAUTHORIZED", false),
  tableAprovados: process.env.CRTI_TABLE_APROVADOS || "public.pedidos_venda_material",
  tableConcluidos: process.env.CRTI_TABLE_CONCLUIDOS || "public.pedidos_venda_material",
  tableSaidas: process.env.CRTI_TABLE_SAIDAS || "public.vendas_saida_material_analitico",
};

export interface SincronizacaoResultado {
  sucesso: boolean;
  mensagem: string;
  pedidosEncontrados: number;
  pedidosImportados: number;
  pedidosDuplicados: number;
  pedidosAtualizados: number;
  erros: number;
  detalhes: any[];
}

type CrtiPedido = {
  numeropedido: string;
  datapedido: Date | string | null;
  nomecliente: string;
  situacaopedido: string | null;
  tipopedido: string;
  quantidade_total: string | number | null;
  valor_unitario: string | number | null;
  valor_total: string | number | null;
  valor_saida: string | number | null;
  saldo_total: string | number | null;
  materiais: string | null;
};

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}

function formatCrtiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  const target = `${CRTI_CONFIG.host}:${CRTI_CONFIG.port}`;

  if (message.toLowerCase().includes("timeout") || code === "ETIMEDOUT") {
    return `Nao foi possivel acessar o CRTI em ${target}. Verifique VPN, firewall do Azure e liberacao do IP desta maquina.`;
  }

  if (code === "ECONNREFUSED") {
    return `O CRTI recusou a conexao em ${target}. Verifique se o servidor PostgreSQL esta ativo e se a porta esta correta.`;
  }

  if (code === "ENOTFOUND") {
    return `O endereco do CRTI nao foi encontrado: ${CRTI_CONFIG.host}. Verifique CRTI_HOST.`;
  }

  if (code === "28P01") {
    return "O CRTI recusou o usuario ou a senha configurados. Verifique CRTI_USER e CRTI_PASSWORD.";
  }

  return message;
}

function getDefaultSyncDays(): number {
  const configured = Number.parseInt(process.env.CRTI_SYNC_DAYS || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SYNC_DAYS;
}

function normalizeSyncDays(dias?: number): number {
  const value = dias ?? getDefaultSyncDays();
  return Math.max(1, Math.trunc(value));
}

function createEmptyResult(): SincronizacaoResultado {
  return {
    sucesso: false,
    mensagem: "",
    pedidosEncontrados: 0,
    pedidosImportados: 0,
    pedidosDuplicados: 0,
    pedidosAtualizados: 0,
    erros: 0,
    detalhes: [],
  };
}

function getCrtiClient(): Client {
  if (!CRTI_CONFIG.password) {
    throw new Error("Credenciais CRTI nao configuradas. Configure CRTI_PASSWORD.");
  }

  if (!Number.isFinite(CRTI_CONFIG.port)) {
    throw new Error("CRTI_PORT invalida.");
  }

  const config: ClientConfig = {
    host: CRTI_CONFIG.host,
    port: CRTI_CONFIG.port,
    database: CRTI_CONFIG.database,
    user: CRTI_CONFIG.user,
    password: CRTI_CONFIG.password,
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
  };

  if (CRTI_CONFIG.ssl) {
    config.ssl = { rejectUnauthorized: CRTI_CONFIG.sslRejectUnauthorized };
  }

  return new Client(config);
}

async function withCrtiClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = getCrtiClient();
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function quoteIdentifierPath(identifierPath: string): string {
  const parts = identifierPath.split(".");
  if (parts.length === 0) throw new Error("Nome de tabela CRTI invalido.");

  return parts
    .map((part) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
        throw new Error(`Nome de tabela CRTI invalido: ${identifierPath}`);
      }
      return `"${part}"`;
    })
    .join(".");
}

function normalizeNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function isGranel(tipoPedido: string): boolean {
  return tipoPedido.toUpperCase().includes("GRANEL");
}

function isTapFacilSc(tipoPedido: string): boolean {
  const upper = tipoPedido.toUpperCase();
  return upper.includes("TAPF") && upper.includes("SC");
}

function calculatePercentual(totalPedido: number, saldo: number): number {
  if (totalPedido <= 0) return saldo <= 0 ? 100 : 0;
  const percentual = (saldo / totalPedido) * 100;
  return Math.max(0, Math.min(100, Number(percentual.toFixed(2))));
}

function calculateRemainingQuantity(quantidade: number, valorTotal: number, saldo: number): number {
  if (quantidade <= 0 || valorTotal <= 0) return quantidade;
  return Number((quantidade * (saldo / valorTotal)).toFixed(3));
}

async function getPedidoIdFromInsertResult(result: unknown, pedidoNum: string): Promise<number | null> {
  const maybeInsertId = (result as any)?.insertId ?? (Array.isArray(result) ? (result[0] as any)?.insertId : undefined);
  if (maybeInsertId) return Number(maybeInsertId);

  const created = await db.getPedidoByNumber(pedidoNum);
  return created?.id ?? null;
}

async function createSincronizacaoIfPossible(data: {
  pedidoId: number | null;
  pedidoNum: string;
  tipoPedido: string;
  statusCrti: string;
  statusLocal: string;
}) {
  if (!data.pedidoId) return;

  try {
    await db.createSincronizacao(data);
  } catch (error) {
    console.warn(`[CRTI] Pedido ${data.pedidoNum} importado, mas falhou ao registrar sincronizacao:`, error);
  }
}

async function buscarPedidosAprovados(client: Client, dias: number): Promise<CrtiPedido[]> {
  const table = quoteIdentifierPath(CRTI_CONFIG.tableAprovados);
  const tableSaidas = quoteIdentifierPath(CRTI_CONFIG.tableSaidas);
  const query = `
    WITH saidas AS (
      SELECT
        numeropedido::text AS numeropedido,
        SUM(valortotalliquido) AS valor_saida
      FROM ${tableSaidas}
      WHERE datahorasaida >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY numeropedido
    )
    SELECT
      pedidos.numeropedido::text AS numeropedido,
      MIN(pedidos.datapedido) AS datapedido,
      MAX(pedidos.nomecliente) AS nomecliente,
      MAX(pedidos.situacaopedido) AS situacaopedido,
      MAX(pedidos.tipopedido) AS tipopedido,
      SUM(pedidos.quantidadepedido) AS quantidade_total,
      CASE
        WHEN SUM(pedidos.quantidadepedido) = 0 THEN 0
        ELSE SUM(pedidos.valortotalitem) / SUM(pedidos.quantidadepedido)
      END AS valor_unitario,
      SUM(pedidos.valortotalitem) AS valor_total,
      COALESCE(MAX(saidas.valor_saida), 0) AS valor_saida,
      GREATEST(SUM(pedidos.valortotalitem) - COALESCE(MAX(saidas.valor_saida), 0), 0) AS saldo_total,
      STRING_AGG(DISTINCT pedidos.descricaomaterial, ' | ') AS materiais
    FROM ${table} pedidos
    LEFT JOIN saidas ON saidas.numeropedido = pedidos.numeropedido::text
    WHERE UPPER(pedidos.tipopedido) LIKE '%TAPF%'
      AND (UPPER(pedidos.tipopedido) LIKE '%SC%' OR UPPER(pedidos.tipopedido) LIKE '%GRANEL%')
      AND pedidos.datapedido >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      AND UPPER(pedidos.situacaopedido) LIKE 'APROV%'
    GROUP BY pedidos.numeropedido
    ORDER BY MIN(pedidos.datapedido) DESC, pedidos.numeropedido DESC
  `;

  const { rows } = await client.query<CrtiPedido>(query, [dias]);
  return rows;
}

async function buscarPedidosConcluidos(client: Client, dias: number): Promise<CrtiPedido[]> {
  const table = quoteIdentifierPath(CRTI_CONFIG.tableConcluidos);
  const tableAprovados = quoteIdentifierPath(CRTI_CONFIG.tableAprovados);
  const query = `
    SELECT
      concluidos.numeropedido::text AS numeropedido,
      MIN(concluidos.datapedido) AS datapedido,
      MAX(concluidos.nomecliente) AS nomecliente,
      MAX(concluidos.situacaopedido) AS situacaopedido,
      MAX(concluidos.tipopedido) AS tipopedido,
      SUM(concluidos.quantidadepedido) AS quantidade_total,
      CASE
        WHEN SUM(concluidos.quantidadepedido) = 0 THEN 0
        ELSE SUM(concluidos.valortotalitem) / SUM(concluidos.quantidadepedido)
      END AS valor_unitario,
      SUM(concluidos.valortotalitem) AS valor_total,
      STRING_AGG(DISTINCT concluidos.descricaomaterial, ' | ') AS materiais
    FROM ${table} concluidos
    WHERE UPPER(concluidos.tipopedido) LIKE '%TAPF%'
      AND (UPPER(concluidos.tipopedido) LIKE '%SC%' OR UPPER(concluidos.tipopedido) LIKE '%GRANEL%')
      AND concluidos.datapedido >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      AND UPPER(concluidos.situacaopedido) LIKE 'CONCLU%'
      AND NOT EXISTS (
        SELECT 1
        FROM ${tableAprovados} aprovados
        WHERE aprovados.numeropedido = concluidos.numeropedido
          AND UPPER(aprovados.tipopedido) LIKE '%TAPF%'
          AND (UPPER(aprovados.tipopedido) LIKE '%SC%' OR UPPER(aprovados.tipopedido) LIKE '%GRANEL%')
          AND aprovados.datapedido >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
          AND UPPER(aprovados.situacaopedido) LIKE 'APROV%'
      )
    GROUP BY concluidos.numeropedido
    ORDER BY MIN(concluidos.datapedido) DESC, concluidos.numeropedido DESC
  `;

  const { rows } = await client.query<CrtiPedido>(query, [dias]);
  return rows;
}

/**
 * Testa conexao com CRTI.
 */
export async function testarConexaoCrti(): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    return await withCrtiClient(async (client) => {
      const result = await client.query<{ now: Date }>("SELECT NOW() AS now");
      const connectedAt = result.rows[0]?.now;

      return {
        sucesso: true,
        mensagem: `Conexao com CRTI estabelecida com sucesso${connectedAt ? ` em ${connectedAt.toISOString()}` : ""}`,
      };
    });
  } catch (error: any) {
    return {
      sucesso: false,
      mensagem: `Erro ao conectar com CRTI: ${formatCrtiError(error)}`,
    };
  }
}

/**
 * Importa pedidos aprovados do CRTI.
 */
export async function importarPedidosAprovados(dias?: number): Promise<SincronizacaoResultado> {
  const resultado = createEmptyResult();
  const periodo = normalizeSyncDays(dias);

  try {
    console.log(`[CRTI] Importando pedidos aprovados dos ultimos ${periodo} dias...`);
    const pedidosCrti = await withCrtiClient((client) => buscarPedidosAprovados(client, periodo));
    resultado.pedidosEncontrados = pedidosCrti.length;

    for (const pedido of pedidosCrti) {
      const pedidoNum = String(pedido.numeropedido);

      try {
        const pedidoExistente = await db.getPedidoByNumber(pedidoNum);

        const quantidade = normalizeNumber(pedido.quantidade_total);
        const valorTotal = normalizeNumber(pedido.valor_total);
        const saldo = normalizeNumber(pedido.saldo_total ?? pedido.valor_total);
        const quantidadePendente = calculateRemainingQuantity(quantidade, valorTotal, saldo);
        const valorUnitario = normalizeNumber(pedido.valor_unitario);
        const qtdeGranel = isGranel(pedido.tipopedido) ? quantidadePendente : 0;
        const qtdeTapFacil = isTapFacilSc(pedido.tipopedido) ? quantidadePendente : 0;
        const statusLocal = saldo > 0 ? "PENDENTE" : LOCAL_STATUS_SAIDA_OK;

        if (pedidoExistente) {
          const totalPedidoAtual = Math.max(
            normalizeNumber((pedidoExistente as any).totalPedido),
            valorTotal,
          );
          const percentual = calculatePercentual(totalPedidoAtual, saldo);

          await db.updatePedido(
            pedidoExistente.id,
            {
              dataPedido: formatDate(pedido.datapedido),
              cliente: pedido.nomecliente,
              situacao: pedido.situacaopedido || "Aprovado",
              qtde: quantidadePendente,
              valorUnit: valorUnitario,
              totalPedido: totalPedidoAtual,
              saldo,
              percentual,
              qtdeGranel,
              qtdeTapFacil,
              status: statusLocal,
              observacoes: `Atualizado pelo CRTI - Tipo: ${pedido.tipopedido}${pedido.materiais ? ` - ${pedido.materiais}` : ""}`,
            },
            "CRTI",
          );

          resultado.pedidosAtualizados++;
          resultado.detalhes.push({
            pedido: pedidoNum,
            status: "ATUALIZADO",
            cliente: pedido.nomecliente,
            saldo,
          });
          continue;
        }

        const result = await db.createPedido({
          dataPedido: formatDate(pedido.datapedido),
          cliente: pedido.nomecliente,
          pedido: pedidoNum,
          situacao: pedido.situacaopedido || "Aprovado",
          qtde: quantidadePendente,
          valorUnit: valorUnitario,
          totalPedido: valorTotal,
          saldo,
          percentual: calculatePercentual(valorTotal, saldo),
          prioridade: "NORMAL",
          qtdeGranel,
          qtdeTapFacil,
          status: statusLocal,
          dataEntrega: "",
          observacoes: `Importado do CRTI - Tipo: ${pedido.tipopedido}${pedido.materiais ? ` - ${pedido.materiais}` : ""}`,
        });

        const pedidoId = await getPedidoIdFromInsertResult(result, pedidoNum);
        await createSincronizacaoIfPossible({
          pedidoId,
          pedidoNum,
          tipoPedido: pedido.tipopedido,
          statusCrti: pedido.situacaopedido || "Aprovado",
          statusLocal,
        });

        resultado.pedidosImportados++;
        resultado.detalhes.push({
          pedido: pedidoNum,
          status: "IMPORTADO",
          cliente: pedido.nomecliente,
          total: valorTotal,
          qtde: quantidadePendente,
          tipo: qtdeGranel > 0 ? "GRANEL (ton)" : "SC (sacos)",
        });

        console.log(`[CRTI] Pedido ${pedidoNum} importado`);
      } catch (error: any) {
        resultado.erros++;
        console.error(`[CRTI] Erro ao importar pedido ${pedidoNum}: ${error.message}`);
        resultado.detalhes.push({
          pedido: pedidoNum,
          status: "ERRO",
          cliente: pedido.nomecliente,
          erro: error.message,
        });
      }
    }

    resultado.sucesso = resultado.erros === 0 || resultado.pedidosImportados > 0 || resultado.pedidosAtualizados > 0 || resultado.pedidosDuplicados > 0;
    resultado.mensagem = `Importacao concluida: ${resultado.pedidosImportados} novos, ${resultado.pedidosAtualizados} atualizados, ${resultado.pedidosDuplicados} duplicados, ${resultado.erros} erros`;
    console.log(`[CRTI] ${resultado.mensagem}`);
    return resultado;
  } catch (error: any) {
    resultado.sucesso = false;
    resultado.mensagem = `Erro na sincronizacao: ${formatCrtiError(error)}`;
    console.error(`[CRTI] Erro: ${formatCrtiError(error)}`);
    return resultado;
  }
}

/**
 * Sincroniza pedidos concluidos do CRTI.
 */
export async function sincronizarPedidosConcluidos(dias?: number): Promise<SincronizacaoResultado> {
  const resultado = createEmptyResult();
  const periodo = normalizeSyncDays(dias);

  try {
    console.log(`[CRTI] Sincronizando pedidos concluidos dos ultimos ${periodo} dias...`);
    const pedidosConcluidos = await withCrtiClient((client) => buscarPedidosConcluidos(client, periodo));
    resultado.pedidosEncontrados = pedidosConcluidos.length;

    for (const pedido of pedidosConcluidos) {
      const pedidoNum = String(pedido.numeropedido);

      try {
        const pedidoExistente = await db.getPedidoByNumber(pedidoNum);
        const quantidade = normalizeNumber(pedido.quantidade_total);
        const valorTotal = normalizeNumber(pedido.valor_total);
        const valorUnitario = normalizeNumber(pedido.valor_unitario);
        const qtdeGranel = isGranel(pedido.tipopedido) ? quantidade : 0;
        const qtdeTapFacil = isTapFacilSc(pedido.tipopedido) ? quantidade : 0;

        if (!pedidoExistente) {
          const result = await db.createPedido({
            dataPedido: formatDate(pedido.datapedido),
            cliente: pedido.nomecliente,
            pedido: pedidoNum,
            situacao: pedido.situacaopedido || "Concluido",
            qtde: quantidade,
            valorUnit: valorUnitario,
            totalPedido: valorTotal,
            saldo: 0,
            percentual: 100,
            prioridade: "NORMAL",
            status: LOCAL_STATUS_SAIDA_OK,
            qtdeGranel,
            qtdeTapFacil,
            dataEntrega: "",
            observacoes: `Importado do CRTI como concluido - Tipo: ${pedido.tipopedido}${pedido.materiais ? ` - ${pedido.materiais}` : ""}`,
          });

          const pedidoId = await getPedidoIdFromInsertResult(result, pedidoNum);
          await createSincronizacaoIfPossible({
            pedidoId,
            pedidoNum,
            tipoPedido: pedido.tipopedido,
            statusCrti: pedido.situacaopedido || "Concluido",
            statusLocal: LOCAL_STATUS_SAIDA_OK,
          });

          resultado.pedidosImportados++;
          console.log(`[CRTI] Pedido ${pedidoNum} inserido como ${LOCAL_STATUS_SAIDA_OK}`);
        } else if (pedidoExistente.status !== LOCAL_STATUS_SAIDA_OK) {
          await db.updatePedido(
            pedidoExistente.id,
            {
              status: LOCAL_STATUS_SAIDA_OK,
              saldo: 0,
              percentual: 100,
            },
            "CRTI",
          );

          resultado.pedidosAtualizados++;
          console.log(`[CRTI] Pedido ${pedidoNum} atualizado para ${LOCAL_STATUS_SAIDA_OK}`);
        } else {
          resultado.pedidosDuplicados++;
        }

        resultado.detalhes.push({
          pedido: pedidoNum,
          status: "SINCRONIZADO",
          cliente: pedido.nomecliente,
        });
      } catch (error: any) {
        resultado.erros++;
        console.error(`[CRTI] Erro ao sincronizar ${pedidoNum}: ${error.message}`);
        resultado.detalhes.push({
          pedido: pedidoNum,
          status: "ERRO",
          cliente: pedido.nomecliente,
          erro: error.message,
        });
      }
    }

    resultado.sucesso = resultado.erros === 0 || resultado.pedidosImportados > 0 || resultado.pedidosAtualizados > 0 || resultado.pedidosDuplicados > 0;
    resultado.mensagem = `Sincronizacao concluida: ${resultado.pedidosImportados} novos, ${resultado.pedidosAtualizados} atualizados, ${resultado.pedidosDuplicados} ja estavam concluidos, ${resultado.erros} erros`;
    console.log(`[CRTI] ${resultado.mensagem}`);
    return resultado;
  } catch (error: any) {
    resultado.sucesso = false;
    resultado.mensagem = `Erro na sincronizacao: ${formatCrtiError(error)}`;
    console.error(`[CRTI] Erro: ${formatCrtiError(error)}`);
    return resultado;
  }
}

/**
 * Executa sincronizacao completa.
 */
export async function sincronizacaoCompleta(dias?: number): Promise<{
  aprovados: SincronizacaoResultado;
  concluidos: SincronizacaoResultado;
}> {
  console.log("[CRTI] Iniciando sincronizacao completa...");

  const aprovados = await importarPedidosAprovados(dias);
  if (!aprovados.sucesso) {
    const concluidos = createEmptyResult();
    concluidos.mensagem = "Sincronizacao de concluidos nao executada devido a falha anterior.";
    console.log("[CRTI] Sincronizacao de concluidos ignorada devido a falha anterior");
    return { aprovados, concluidos };
  }

  const concluidos = await sincronizarPedidosConcluidos(dias);

  if (aprovados.sucesso && concluidos.sucesso) {
    await db.registrarExecucaoSincronizacao();
  }

  console.log("[CRTI] Sincronizacao completa finalizada");

  return { aprovados, concluidos };
}
