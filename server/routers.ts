import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as crtiSync from "./crti-sync";
import * as csvImport from "./csv-import";
import { TRPCError } from "@trpc/server";
import { ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import { sdk, LOCAL_LOGIN_OPEN_ID_PREFIX } from "./_core/sdk";

const STATUS_SAIDA_OK = "SA\u00cdDA OK";

function normalizeStatus(value: unknown) {
  const text = String(value || "").toUpperCase();
  if (text === "CANCELADO") return "CANCELADO";
  if (text.includes("SA") && text.includes("OK")) return STATUS_SAIDA_OK;
  return "PENDENTE";
}

function normalizePrioridade(value: unknown) {
  return value === "PRIORIDADE" ? "PRIORIDADE" : "NORMAL";
}

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "sim", "on"].includes(String(value || "").toLowerCase());
}

function getLocalLoginCredentials() {
  return {
    admfull: ENV.localLoginAdmfull,
    comercial: ENV.localLoginComercial,
    subcomercial: ENV.localLoginSubcomercial,
    gerencia: ENV.localLoginGerencia,
    diretoria: ENV.localLoginDiretoria,
  };
}

function isLocalLoginEnabled() {
  return Object.values(getLocalLoginCredentials()).some(Boolean);
}

function isOAuthEnabled() {
  return Boolean(ENV.appId && ENV.oAuthServerUrl && process.env.VITE_OAUTH_PORTAL_URL);
}

// Schema de validação
const pedidoSchema = z.object({
  dataPedido: z.string().optional(),
  cliente: z.string().min(1, "Cliente é obrigatório"),
  pedido: z.string().min(1, "Número do pedido é obrigatório"),
  situacao: z.string().optional(),
  qtde: z.coerce.number().optional(),
  valorUnit: z.coerce.number().optional(),
  totalPedido: z.coerce.number().optional(),
  saldo: z.coerce.number().optional(),
  percentual: z.coerce.number().optional(),
  prioridade: z.preprocess(normalizePrioridade, z.enum(["NORMAL", "PRIORIDADE"])).optional(),
  qtdeGranel: z.coerce.number().optional(),
  qtdeTapFacil: z.coerce.number().optional(),
  status: z.enum(["PENDENTE", "SAÍDA OK", "CANCELADO"]).optional(),
  dataEntrega: z.string().optional(),
  observacoes: z.string().optional(),
}).extend({
  status: z.preprocess(normalizeStatus, z.enum(["PENDENTE", STATUS_SAIDA_OK, "CANCELADO"])).optional(),
});

const contatoSchema = z.object({
  pedidoId: z.number(),
  pedidoNum: z.string(),
  tipo: z.enum(["Ligação", "E-mail", "WhatsApp", "Visita", "Outro"]),
  descricao: z.string(),
});

const estoqueMovimentacaoSchema = z.object({
  dataMovimentacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  estoqueInicial: z.number().nonnegative(),
  producaoSacos: z.number().nonnegative(),
  saidaSacos: z.number().nonnegative(),
  entradaGranelTon: z.number().nonnegative(),
  saidaGranelTon: z.number().nonnegative(),
  ocorrencias: z.string().max(5000).optional(),
});

const pedidoObraObservacoesSchema = z.object({
  observacoesPagamento: z.string().max(5000).optional(),
  observacoes: z.string().max(5000).optional(),
  observacoesOperador: z.string().max(5000).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    config: publicProcedure.query(() => ({
      mode: ENV.authMode,
      localLoginEnabled: isLocalLoginEnabled(),
      oauthEnabled: isOAuthEnabled(),
      bypassEnabled: isTruthy(process.env.LOCAL_AUTH_BYPASS),
    })),
    localLogin: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!isLocalLoginEnabled()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Login local não configurado" });
        }

        const username = input.username.trim().toLowerCase();
        const credentials = getLocalLoginCredentials();
        const expectedPassword = credentials[username as keyof typeof credentials];
        const validCredentials = Boolean(expectedPassword) && input.password === expectedPassword;

        if (!validCredentials) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }

        const sessionToken = await sdk.createSessionToken(
          `${LOCAL_LOGIN_OPEN_ID_PREFIX}${username}`,
          {
            name: username,
            expiresInMs: ONE_YEAR_MS,
          },
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ─────────────────────────────────────────────
  // PEDIDOS
  // ─────────────────────────────────────────────
  pedidos: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        prioridade: z.string().optional(),
        cliente: z.string().optional(),
        pedido: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.listPedidos(input);
      }),

    getById: protectedProcedure
      .input(z.number())
      .query(async ({ input }) => {
        const pedido = await db.getPedidoById(input);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND" });
        return pedido;
      }),

    create: protectedProcedure
      .input(pedidoSchema)
      .mutation(async ({ input }) => {
        // Verificar se pedido já existe
        const existing = await db.getPedidoByNumber(input.pedido);
        if (existing) {
          throw new TRPCError({ 
            code: "CONFLICT", 
            message: "Número de pedido já existe" 
          });
        }

        const result = await db.createPedido(input);
        
        // Registrar no histórico
        if ((result as any)?.insertId) {
          await db.listHistoricoByPedido((result as any).insertId);
        }

        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: pedidoSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        const usuario = ctx.user?.name || "Sistema";
        return db.updatePedido(input.id, input.data, usuario);
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        return db.deletePedido(input);
      }),

    importCSV: protectedProcedure
      .input(z.object({
        csv: z.string(),
      }))
      .mutation(async ({ input }) => {
        return csvImport.importarCSV(input.csv);
      }),
  }),

  // ─────────────────────────────────────────────
  // CONTATOS
  // ─────────────────────────────────────────────
  contatos: router({
    listByPedido: protectedProcedure
      .input(z.number())
      .query(async ({ input }) => {
        return db.listContatosByPedido(input);
      }),

    create: protectedProcedure
      .input(contatoSchema)
      .mutation(async ({ input, ctx }) => {
        const usuario = ctx.user?.name || "Sistema";
        return db.createContato({
          ...input,
          usuario,
        });
      }),
  }),

  // ─────────────────────────────────────────────
  // HISTÓRICO
  // ─────────────────────────────────────────────
  historico: router({
    listByPedido: protectedProcedure
      .input(z.number())
      .query(async ({ input }) => {
        return db.listHistoricoByPedido(input);
      }),
  }),

  estoque: router({
    list: protectedProcedure.query(() => db.listEstoqueMovimentacoes()),

    create: protectedProcedure
      .input(estoqueMovimentacaoSchema)
      .mutation(({ input, ctx }) => db.createEstoqueMovimentacao({
        ...input,
        usuario: ctx.user?.name || "Sistema",
      })),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        data: estoqueMovimentacaoSchema.partial(),
      }))
      .mutation(({ input, ctx }) => db.updateEstoqueMovimentacao(
        input.id,
        input.data,
        ctx.user?.name || "Sistema",
      )),

    delete: protectedProcedure
      .input(z.number().int().positive())
      .mutation(({ input }) => db.deleteEstoqueMovimentacao(input)),
  }),

  pedidosObras: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        prioridade: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().min(10).max(200).optional(),
      }).optional())
      .query(({ input }) => db.listPedidosObras(input)),

    updateObservacoes: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        data: pedidoObraObservacoesSchema,
      }))
      .mutation(({ input }) => db.updatePedidoObraObservacoes(input.id, input.data)),
  }),

  despesasTabelaGeral: router({
    list: protectedProcedure
      .input(z.object({
        tipoConta: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().min(10).max(200).optional(),
      }).optional())
      .query(({ input }) => db.listDespesasTabelaGeral(input)),
  }),

  // ─────────────────────────────────────────────
  // INDICADORES
  // ─────────────────────────────────────────────
  indicadores: router({
    get: protectedProcedure
      .query(async () => {
        return db.getIndicadores();
      }),
  }),

  // ─────────────────────────────────────────────
  // SINCRONIZAÇÃO CRTI
  // ─────────────────────────────────────────────
  crti: router({
    ultimaAtualizacao: protectedProcedure
      .query(() => db.getUltimaSincronizacao()),

    testarConexao: protectedProcedure
      .query(async () => {
        return crtiSync.testarConexaoCrti();
      }),

    importarAprovados: protectedProcedure
      .input(z.object({ dias: z.number().optional() }).optional())
      .mutation(async ({ input }) => {
        return crtiSync.importarPedidosAprovados(input?.dias);
      }),

    sincronizarConcluidos: protectedProcedure
      .input(z.object({ dias: z.number().optional() }).optional())
      .mutation(async ({ input }) => {
        return crtiSync.sincronizarPedidosConcluidos(input?.dias);
      }),

    sincronizacaoCompleta: protectedProcedure
      .input(z.object({ dias: z.number().optional() }).optional())
      .mutation(async ({ input }) => {
        return crtiSync.sincronizacaoCompleta(input?.dias);
      }),

    ultimaAtualizacaoObras: protectedProcedure
      .query(() => db.getUltimaSincronizacaoObras()),

    sincronizarPedidosObras: protectedProcedure
      .mutation(async () => {
        return crtiSync.sincronizarPedidosObras();
      }),

    sincronizacaoCustosObras: protectedProcedure
      .mutation(async () => {
        return crtiSync.sincronizacaoCustosObras();
      }),
  }),
});

export type AppRouter = typeof appRouter;
