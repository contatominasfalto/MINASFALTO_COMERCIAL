import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as crtiSync from "./crti-sync";
import * as csvImport from "./csv-import";
import * as alimentacao from "./alimentacao";
import { TIPOS_REFEICAO } from "./alimentacao-rules";
import { buildAlimentacaoPdf } from "./alimentacao-pdf";
import { buildLicitacaoPdf } from "./licitacao-pdf";
import { TRPCError } from "@trpc/server";
import { ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import { sdk, LOCAL_LOGIN_OPEN_ID_PREFIX } from "./_core/sdk";
import * as accessDb from "./access-control-db";
import { ACCESS_CATALOG, ACCESS_EFFECTS, USER_STATUSES } from "../shared/access-control";
import { verifyPassword } from "./password-security";
import { isLegacyEnvironmentUser } from "./local-login-users";

const STATUS_SAIDA_OK = "SA\u00cdDA OK";
const pedidoAtividadeDescricaoSchema = z.string().trim().min(1, "Informe a atividade.").max(2000, "A atividade deve ter no máximo 2.000 caracteres.");

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
  return Boolean(ENV.databaseUrl) || Object.values(getLocalLoginCredentials()).some(Boolean);
}

function isOAuthEnabled() {
  return Boolean(ENV.appId && ENV.oAuthServerUrl && process.env.VITE_OAUTH_PORTAL_URL);
}

const HIDDEN_COST_PROFILES = new Set(["comercial", "subcomercial", "semicomercial"]);
let costPanelLoginAutomationRunning = false;

function normalizeUserKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function canAccessCostPanel(value: unknown) {
  const key = normalizeUserKey(value);
  return Boolean(key) && !HIDDEN_COST_PROFILES.has(key);
}

const costAccessProcedure = protectedProcedure;

const alimentacaoAccessProcedure = costAccessProcedure;
const dataIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const alimentacaoFiltrosSchema = z.object({
  inicio: dataIsoSchema.optional(), fim: dataIsoSchema.optional(),
  fornecedorId: z.number().int().positive().optional(), funcionarioId: z.number().int().positive().optional(),
  setor: z.string().max(120).optional(), tipo: z.enum(TIPOS_REFEICAO).optional(),
});

function triggerCostPanelLoginAutomation(username: string) {
  if (!canAccessCostPanel(username)) return;
  if (costPanelLoginAutomationRunning) {
    console.log(`[CustoObras] Automacao pos-login ignorada para ${username}: execucao em andamento`);
    return;
  }

  costPanelLoginAutomationRunning = true;
  void (async () => {
    try {
      console.log(`[CustoObras] Automacao pos-login iniciada por ${username}`);
      const sync = await crtiSync.sincronizacaoCustosObras();
      console.log(
        `[CustoObras] CRTI pos-login: obras=${sync.obras.pedidosImportados}/${sync.obras.pedidosAtualizados}, despesas=${sync.despesas.pedidosAtualizados}, custos=${sync.custos.pedidosAtualizados}`,
      );
      const vinculos = await db.vincularSaidasAutomaticasObras(username);
      console.log(
        `[CustoObras] Vinculo automatico pos-login: ${vinculos.vinculadas} vinculada(s), ${vinculos.semPedido} sem pedido`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CustoObras] Erro na automacao pos-login: ${message}`);
    } finally {
      costPanelLoginAutomationRunning = false;
    }
  })();
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
  novoStatus: z.preprocess(normalizeStatus, z.enum(["PENDENTE", STATUS_SAIDA_OK, "CANCELADO"])).optional(),
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

const pedidoObraCategoriaSchema = z.enum(["Custo", "Despesa", "Outros"]);

const pedidoObraFinanceiroSchema = z.object({
  pedidoObraId: z.number().int().positive(),
  pedidoNum: z.string().min(1),
  nfes: z.coerce.number().nonnegative(),
  faturamentoDireto: z.coerce.number().nonnegative(),
  valorTotalImposto: z.coerce.number().nonnegative(),
  porcentagemImposto: z.coerce.number().min(0).max(100),
});

const pedidoObraDespesaBaseSchema = z.object({
  pedidoObraId: z.number().int().positive(),
  pedidoNum: z.string().min(1),
  categoria: pedidoObraCategoriaSchema,
  justificativaOutros: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.categoria === "Outros" && !data.justificativaOutros?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["justificativaOutros"],
      message: "Justificativa obrigatoria para Outros",
    });
  }
});

const pedidoObraDespesaFieldsSchema = z.object({
  codigoFornecedorCliente: z.string().max(50).optional(),
  fornecedorCliente: z.string().max(255).optional(),
  numeroDocumento: z.string().max(80).optional(),
  tipoConta: z.string().max(50).optional(),
  tipoDocumento: z.string().max(100).optional(),
  dataEmissao: z.string().max(10).optional(),
  dataVencimento: z.string().max(10).optional(),
  valorTotalDocumento: z.coerce.number().nonnegative(),
  complemento: z.string().max(5000).optional(),
  observacoesAprovacao: z.string().max(5000).optional(),
});

const pedidoObraDespesaUpdateSchema = z.object({
  id: z.number().int().positive(),
  pedidoObraId: z.number().int().positive(),
  categoria: pedidoObraCategoriaSchema,
  justificativaOutros: z.string().max(1000).optional(),
}).and(pedidoObraDespesaFieldsSchema).superRefine((data, ctx) => {
  if (data.categoria === "Outros" && !data.justificativaOutros?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["justificativaOutros"],
      message: "Justificativa obrigatoria para Outros",
    });
  }
});

const pedidoObraReceitaSchema = z.object({
  pedidoObraId: z.number().int().positive(),
  pedidoNum: z.string().min(1),
  codigoFornecedorCliente: z.string().max(50).optional(),
  fornecedorCliente: z.string().max(255).optional(),
  numeroDocumento: z.string().max(80).optional(),
  status: z.enum(["Nfe", "Faturamento Direto", "Outros"]),
  tipoReceitaOutros: z.string().max(1000).optional(),
  tipoConta: z.string().max(50).optional(),
  tipoDocumento: z.string().max(100).optional(),
  dataEmissao: z.string().max(10).optional(),
  dataVencimento: z.string().max(10).optional(),
  valorTotalDocumento: z.coerce.number().nonnegative(),
  data: z.string().max(10).optional(),
  valor: z.coerce.number().nonnegative().optional(),
  descricao: z.string().max(5000).optional(),
}).superRefine((data, ctx) => {
  if (data.status === "Outros" && !data.tipoReceitaOutros?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tipoReceitaOutros"],
      message: "Tipo de receita obrigatorio para Outros",
    });
  }
});

const pedidoObraReceitaUpdateSchema = z.object({
  id: z.number().int().positive(),
  pedidoObraId: z.number().int().positive(),
  codigoFornecedorCliente: z.string().max(50).optional(),
  fornecedorCliente: z.string().max(255).optional(),
  numeroDocumento: z.string().max(80).optional(),
  status: z.enum(["Nfe", "Faturamento Direto", "Outros"]),
  tipoReceitaOutros: z.string().max(1000).optional(),
  tipoConta: z.string().max(50).optional(),
  tipoDocumento: z.string().max(100).optional(),
  dataEmissao: z.string().max(10).optional(),
  dataVencimento: z.string().max(10).optional(),
  valorTotalDocumento: z.coerce.number().nonnegative(),
  data: z.string().max(10).optional(),
  valor: z.coerce.number().nonnegative().optional(),
  descricao: z.string().max(5000).optional(),
}).superRefine((data, ctx) => {
  if (data.status === "Outros" && !data.tipoReceitaOutros?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tipoReceitaOutros"],
      message: "Tipo de receita obrigatorio para Outros",
    });
  }
});

const pedidoObraResultadoAlocacoesSchema = z.object({
  pedidoObraId: z.number().int().positive(),
  pedidoNum: z.string().min(1),
  alocacoes: z.array(z.object({
    itemTipo: z.enum(["receita", "despesa", "custo"]),
    itemId: z.number().int().positive(),
    mesReferencia: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
    dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).min(1),
});

const licitacaoStatusSchema = z.object({
  nome: z.string().min(1).max(120),
});

const licitacaoPlataformaSchema = z.object({
  nome: z.string().min(1).max(180),
  link: z.string().max(1000).optional(),
});

const licitacaoVendedorSchema = z.object({
  nome: z.string().min(1).max(180),
});

const licitacaoSchema = z.object({
  data: z.string().max(10).optional(),
  orgao: z.string().min(1).max(255),
  cidade: z.string().max(120).optional(),
  status: z.string().max(120).optional(),
  plataformaId: z.number().int().positive().nullable().optional(),
  horaInicioDisputa: z.string().max(8).optional(),
  alertaPregao: z.boolean().optional(),
  item: z.string().max(120).optional(),
  tipo: z.string().max(120).optional(),
  qtdeSc: z.coerce.number().nonnegative().optional(),
  valorUnit: z.coerce.number().nonnegative().optional(),
  lanceLimite: z.coerce.number().nonnegative().optional(),
  valorAdjudicado: z.coerce.number().nonnegative().optional(),
  qtdeTn: z.coerce.number().nonnegative().optional(),
  valorInicialContrato: z.coerce.number().nonnegative().optional(),
  kmDistancia: z.coerce.number().nonnegative().optional(),
  regiao: z.string().max(120).optional(),
  statusContrato: z.string().max(80).optional(),
  ataVendedorId: z.number().int().positive().nullable().optional(),
  ataVendedorNome: z.string().max(180).optional(),
});

const licitacaoAtaSchema = z.object({
  licitacaoId: z.number().int().positive(),
  vendedorId: z.number().int().positive().nullable().optional(),
  vendedorNome: z.string().max(180).optional(),
  validadeAta: z.string().max(10).optional(),
  quantidadeOriginal: z.coerce.number().nonnegative().optional(),
  observacoes: z.string().max(5000).optional(),
  alertaVencimento: z.boolean().optional(),
});

const licitacaoAdesaoSchema = z.object({
  licitacaoId: z.number().int().positive(),
  orgaoAderente: z.string().trim().min(1).max(255),
  dataAdesao: z.string().max(10).optional(),
  quantidade: z.coerce.number().positive(),
  entregue: z.boolean().optional(),
  dataEntrega: z.string().max(10).optional(),
  observacoes: z.string().max(5000).optional(),
});

const licitacaoPedidoCrtiSchema = z.object({
  licitacaoId: z.number().int().positive(),
  pedidoCrti: z.string().min(1).max(50),
  cliente: z.string().max(255).optional(),
  dataPedido: z.string().max(10).optional(),
  statusPedido: z.string().max(80).optional(),
  quantidade: z.coerce.number().nonnegative().optional(),
  valorTotal: z.coerce.number().nonnegative().optional(),
  observacoes: z.string().max(5000).optional(),
});

const licitacaoPedidoManualSchema = z.object({
  licitacaoId: z.number().int().positive(),
  pedidoCrti: z.string().trim().min(1).max(50),
  cliente: z.string().trim().min(1).max(255),
  dataPedido: z.string().max(10).optional(),
  statusPedido: z.string().trim().max(80).optional(),
  quantidade: z.coerce.number().positive(),
  valorTotal: z.coerce.number().nonnegative().optional(),
  observacoes: z.string().max(5000).optional(),
});

const managedProfileSchema = z.enum(["comercial", "subcomercial", "gerencia", "diretoria"]);
const managedUserSchema = z.object({
  username: z.string().trim().min(3, "Informe um login com ao menos 3 caracteres.").max(64).regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado."),
  name: z.string().trim().min(2, "Informe o nome do usuário.").max(180),
  email: z.string().trim().email("E-mail inválido.").max(320).nullable().optional().or(z.literal("")),
  profile: managedProfileSchema,
  status: z.enum(USER_STATUSES),
});
const managedPasswordSchema = z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(128, "A senha deve ter no máximo 128 caracteres.");
const createManagedUserSchema = managedUserSchema.extend({ password: managedPasswordSchema });
const updateManagedUserSchema = managedUserSchema.extend({ password: managedPasswordSchema.optional() });

const permissionEntrySchema = z.object({
  resourceKey: z.string().trim().min(1).max(80),
  actionKey: z.string().trim().min(1).max(40),
  effect: z.enum(ACCESS_EFFECTS).nullable(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _passwordHash, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
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
        const persistedUser = await db.getUserByUsername(username)
          ?? await db.getUserByOpenId(`${LOCAL_LOGIN_OPEN_ID_PREFIX}${username}`);
        const validCredentials = Boolean(persistedUser) && (isLegacyEnvironmentUser(persistedUser)
          ? Boolean(expectedPassword) && input.password === expectedPassword
          : Boolean(persistedUser.passwordHash) && await verifyPassword(input.password, persistedUser.passwordHash));

        if (!validCredentials) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }

        if (persistedUser && persistedUser.status !== "active") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário desativado. Procure o administrador do sistema." });
        }

        const sessionToken = await sdk.createSessionToken(
          persistedUser?.openId || `${LOCAL_LOGIN_OPEN_ID_PREFIX}${username}`,
          {
            name: username,
            expiresInMs: ONE_YEAR_MS,
          },
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        triggerCostPanelLoginAutomation(username);

        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return {
        success: true,
      } as const;
    }),
    permissions: protectedProcedure.query(async ({ ctx }) => {
      const rows = await Promise.all(ACCESS_CATALOG.flatMap((resource) => resource.actions.map(async (action) => ({
        resourceKey: resource.key,
        actionKey: action.key,
        effect: await accessDb.getEffectivePermission(ctx.user, resource.key, action.key),
      }))));
      return { catalog: ACCESS_CATALOG, permissions: rows };
    }),
  }),

  userManagement: router({
    list: protectedProcedure.query(() => accessDb.listManagedUsers()),
    getById: protectedProcedure.input(z.number().int().positive()).query(({ input }) => accessDb.getManagedUser(input)),
    create: protectedProcedure.input(createManagedUserSchema).mutation(({ input, ctx }) => accessDb.createManagedUser({ ...input, email: input.email || null }, ctx.user!.id)),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), data: updateManagedUserSchema })).mutation(({ input, ctx }) => accessDb.updateManagedUser(input.id, { ...input.data, email: input.data.email || null }, ctx.user!.id)),
    setStatusOrDeactivate: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(USER_STATUSES), reason: z.string().trim().min(3).max(500) })).mutation(({ input, ctx }) => accessDb.setManagedUserStatus(input.id, input.status, ctx.user!.id, input.reason)),
    deleteOrArchive: protectedProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(3).max(500) })).mutation(({ input }) => accessDb.deleteManagedUser(input.id)),
    getPermissionCatalog: protectedProcedure.query(() => ACCESS_CATALOG),
    getUserPermissions: protectedProcedure.input(z.number().int().positive()).query(({ input }) => accessDb.getUserPermissionRows(input)),
    replaceUserPermissions: protectedProcedure.input(z.object({ userId: z.number().int().positive(), permissions: z.array(permissionEntrySchema).max(500) })).mutation(({ input, ctx }) => accessDb.replaceUserPermissionRows(input.userId, input.permissions, ctx.user!.id)),
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

    atividades: router({
      list: protectedProcedure
        .query(() => db.listPedidoAtividades()),

      create: protectedProcedure
        .input(z.object({ descricao: pedidoAtividadeDescricaoSchema }))
        .mutation(({ input, ctx }) => db.createPedidoAtividade({
          ...input,
          criadoPor: ctx.user?.name || "Sistema",
        })),

      update: protectedProcedure
        .input(z.object({
          id: z.number().int().positive(),
          descricao: pedidoAtividadeDescricaoSchema,
        }))
        .mutation(({ input }) => db.updatePedidoAtividade(input)),

      delete: protectedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(({ input }) => db.deletePedidoAtividade(input.id)),
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

    modal: protectedProcedure
      .input(z.object({ pedidoObraId: z.number().int().positive() }))
      .query(({ input }) => db.getPedidoObraModalData(input.pedidoObraId)),

    saveFinanceiro: protectedProcedure
      .input(pedidoObraFinanceiroSchema)
      .mutation(({ input }) => db.savePedidoObraFinanceiro(input)),

    clearFinanceiro: protectedProcedure
      .input(z.object({
        pedidoObraId: z.number().int().positive(),
        pedidoNum: z.string().min(1),
      }))
      .mutation(({ input }) => db.clearPedidoObraFinanceiro(input.pedidoObraId, input.pedidoNum)),

    createReceita: protectedProcedure
      .input(pedidoObraReceitaSchema)
      .mutation(({ input, ctx }) => db.createPedidoObraReceita({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),

    updateReceita: protectedProcedure
      .input(pedidoObraReceitaUpdateSchema)
      .mutation(({ input }) => db.updatePedidoObraReceita(input)),

    deleteReceita: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        pedidoObraId: z.number().int().positive(),
      }))
      .mutation(({ input }) => db.deletePedidoObraReceita(input.id, input.pedidoObraId)),

    saveResultadoAlocacoes: protectedProcedure
      .input(pedidoObraResultadoAlocacoesSchema)
      .mutation(({ input, ctx }) => db.savePedidoObraResultadoAlocacoes({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),

    resetResultadoAlocacoes: protectedProcedure
      .input(z.object({
        pedidoObraId: z.number().int().positive(),
      }))
      .mutation(({ input }) => db.resetPedidoObraResultadoAlocacoes(input.pedidoObraId)),

    createDespesaManual: protectedProcedure
      .input(pedidoObraDespesaBaseSchema.and(pedidoObraDespesaFieldsSchema))
      .mutation(({ input, ctx }) => db.createPedidoObraDespesaManual({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),

    updateDespesa: protectedProcedure
      .input(pedidoObraDespesaUpdateSchema)
      .mutation(({ input }) => db.updatePedidoObraDespesa(input)),

    deleteDespesa: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        pedidoObraId: z.number().int().positive(),
      }))
      .mutation(({ input }) => db.deletePedidoObraDespesa(input.id, input.pedidoObraId)),

    despesasDisponiveis: protectedProcedure
      .input(z.object({
        pedidoObraId: z.number().int().positive(),
        tipoConta: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().min(10).max(100).optional(),
      }))
      .query(({ input }) => db.listDespesasTabelaGeralDisponiveis(input)),

    vincularDespesa: protectedProcedure
      .input(pedidoObraDespesaBaseSchema.and(z.object({
        despesaTabelaGeralId: z.number().int().positive(),
      })))
      .mutation(({ input, ctx }) => db.vincularDespesaTabelaGeralAoPedidoObra({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),

    vincularSaidasAutomaticas: protectedProcedure
      .mutation(({ ctx }) => db.vincularSaidasAutomaticasObras(ctx.user?.name || "Sistema")),
  }),

  despesasTabelaGeral: router({
    list: protectedProcedure
      .input(z.object({
        tipoConta: z.string().optional(),
        search: z.string().optional(),
        somenteNaoVinculados: z.boolean().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().min(10).max(200).optional(),
        sortBy: z.enum([
          "id",
          "codigoFornecedorCliente",
          "fornecedorCliente",
          "numeroDocumento",
          "tipoConta",
          "tipoDocumento",
          "dataEmissao",
          "dataVencimento",
          "valorTotalDocumento",
          "complemento",
          "observacoesAprovacao",
          "vinculado",
        ]).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      }).optional())
      .query(({ input }) => db.listDespesasTabelaGeral(input)),

    exportExcel: protectedProcedure
      .input(z.object({
        despesas: z.object({
          tipoConta: z.string().optional(),
          search: z.string().optional(),
          somenteNaoVinculados: z.boolean().optional(),
        }).optional(),
        pedidos: z.object({
          status: z.string().optional(),
          search: z.string().optional(),
        }).optional(),
      }).optional())
      .mutation(async ({ input }) => {
        const [despesas, pedidos] = await Promise.all([
          db.exportDespesasTabelaGeral(input?.despesas),
          db.exportPedidosObras(input?.pedidos),
        ]);

        return { despesas, pedidos };
      }),
  }),

  // ─────────────────────────────────────────────
  licitacoes: router({
    opcoes: costAccessProcedure.query(() => db.listLicitacaoOpcoes()),
    list: costAccessProcedure
      .input(z.object({
        search: z.string().optional(),
        adjudicadas: z.boolean().optional(),
      }).optional())
      .query(({ input }) => db.listLicitacoes(input)),
    alertasPregao: costAccessProcedure.query(() => db.listLicitacaoAlertasPregao()),
    exportarPdf: costAccessProcedure
      .input(z.object({
        tipoRelatorio: z.enum(["status", "cidade", "vendedor", "adesoes_vendedor", "entregas"]),
        filtros: z.object({ inicio: z.string().max(10).optional(), fim: z.string().max(10).optional() }),
      }))
      .mutation(async ({ input }) => {
        const pdf = await buildLicitacaoPdf(input.tipoRelatorio, input.filtros);
        return { filename: pdf.filename, base64: pdf.buffer.toString("base64") };
      }),
    create: costAccessProcedure
      .input(licitacaoSchema)
      .mutation(({ input, ctx }) => db.createLicitacao({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),
    update: costAccessProcedure
      .input(z.object({ id: z.number().int().positive(), data: licitacaoSchema }))
      .mutation(({ input }) => db.updateLicitacao(input.id, input.data)),
    delete: costAccessProcedure
      .input(z.number().int().positive())
      .mutation(({ input }) => db.deleteLicitacao(input)),
    status: router({
      list: costAccessProcedure.query(() => db.listLicitacaoStatus()),
      create: costAccessProcedure.input(licitacaoStatusSchema).mutation(({ input }) => db.createLicitacaoStatus(input)),
      update: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), data: licitacaoStatusSchema }))
        .mutation(({ input }) => db.updateLicitacaoStatus(input.id, input.data)),
      delete: costAccessProcedure.input(z.number().int().positive()).mutation(({ input }) => db.deleteLicitacaoStatus(input)),
    }),
    plataformas: router({
      list: costAccessProcedure.query(() => db.listLicitacaoPlataformas()),
      create: costAccessProcedure.input(licitacaoPlataformaSchema).mutation(({ input }) => db.createLicitacaoPlataforma(input)),
      update: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), data: licitacaoPlataformaSchema }))
        .mutation(({ input }) => db.updateLicitacaoPlataforma(input.id, input.data)),
      delete: costAccessProcedure.input(z.number().int().positive()).mutation(({ input }) => db.deleteLicitacaoPlataforma(input)),
    }),
    vendedores: router({
      list: costAccessProcedure.query(() => db.listLicitacaoVendedores()),
      create: costAccessProcedure.input(licitacaoVendedorSchema).mutation(({ input }) => db.createLicitacaoVendedor(input)),
      update: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), data: licitacaoVendedorSchema }))
        .mutation(({ input }) => db.updateLicitacaoVendedor(input.id, input.data)),
      delete: costAccessProcedure.input(z.number().int().positive()).mutation(({ input }) => db.deleteLicitacaoVendedor(input)),
    }),
    ata: router({
      alertasVencimento: costAccessProcedure.query(() => db.listLicitacaoAtasVencendo()),
      get: costAccessProcedure
        .input(z.object({ licitacaoId: z.number().int().positive() }))
        .query(({ input }) => db.getLicitacaoAta(input.licitacaoId)),
      save: costAccessProcedure.input(licitacaoAtaSchema).mutation(({ input }) => db.saveLicitacaoAta(input)),
    }),
    adesoes: router({
      list: costAccessProcedure
        .input(z.object({ licitacaoId: z.number().int().positive() }))
        .query(({ input }) => db.listLicitacaoAdesoes(input.licitacaoId)),
      create: costAccessProcedure
        .input(licitacaoAdesaoSchema)
        .mutation(({ input, ctx }) => db.createLicitacaoAdesao({
          ...input,
          criadoPor: ctx.user?.name || "Sistema",
        })),
      update: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), data: licitacaoAdesaoSchema }))
        .mutation(({ input }) => db.updateLicitacaoAdesao(input.id, input.data)),
      delete: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), licitacaoId: z.number().int().positive() }))
        .mutation(({ input }) => db.deleteLicitacaoAdesao(input.id, input.licitacaoId)),
      pedidosCrti: router({
        list: costAccessProcedure
          .input(z.object({ adesaoId: z.number().int().positive() }))
          .query(({ input }) => db.listLicitacaoAdesaoPedidosCrti(input.adesaoId)),
        create: costAccessProcedure
          .input(z.object({
            adesaoId: z.number().int().positive(),
            licitacaoId: z.number().int().positive(),
            pedidoCrti: z.string().trim().min(1).max(50),
          }))
          .mutation(({ input, ctx }) => db.createLicitacaoAdesaoPedidoCrti({
            ...input,
            criadoPor: ctx.user?.name || "Sistema",
          })),
        delete: costAccessProcedure
          .input(z.object({ id: z.number().int().positive(), adesaoId: z.number().int().positive() }))
          .mutation(({ input }) => db.deleteLicitacaoAdesaoPedidoCrti(input.id, input.adesaoId)),
      }),
    }),
    pedidosCrti: router({
      buscar: costAccessProcedure
        .input(z.object({ pedidoCrti: z.string().min(1).max(50) }))
        .mutation(({ input }) => db.buscarPedidoCrtiLicitacao(input.pedidoCrti)),
      list: costAccessProcedure
        .input(z.object({ licitacaoId: z.number().int().positive() }))
        .query(({ input }) => db.listLicitacaoPedidosCrti(input.licitacaoId)),
      create: costAccessProcedure.input(licitacaoPedidoCrtiSchema).mutation(({ input, ctx }) => db.createLicitacaoPedidoCrti({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),
      createManual: costAccessProcedure.input(licitacaoPedidoManualSchema).mutation(({ input, ctx }) => db.createLicitacaoPedidoManual({
        ...input,
        criadoPor: ctx.user?.name || "Sistema",
      })),
      updateManual: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), data: licitacaoPedidoManualSchema }))
        .mutation(({ input }) => db.updateLicitacaoPedidoManual(input.id, input.data)),
      update: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), data: licitacaoPedidoCrtiSchema }))
        .mutation(({ input }) => db.updateLicitacaoPedidoCrti(input.id, input.data)),
      delete: costAccessProcedure
        .input(z.object({ id: z.number().int().positive(), licitacaoId: z.number().int().positive() }))
        .mutation(({ input }) => db.deleteLicitacaoPedidoCrti(input.id, input.licitacaoId)),
    }),
  }),

  alimentacao: router({
    cadastros: alimentacaoAccessProcedure.query(() => alimentacao.cadastros()),
    painel: alimentacaoAccessProcedure.query(() => alimentacao.painel()),
    relatorio: alimentacaoAccessProcedure.input(alimentacaoFiltrosSchema.optional()).query(({ input }) => alimentacao.relatorio(input)),
    exportarPdf: alimentacaoAccessProcedure.input(z.object({ filtros: alimentacaoFiltrosSchema, tipoRelatorio: z.enum(["funcionario", "fornecedor", "mensal", "setor", "tipo"]) })).mutation(async ({ input }) => {
      const pdf = await buildAlimentacaoPdf(input.filtros, input.tipoRelatorio);
      return { filename: pdf.filename, base64: pdf.buffer.toString("base64") };
    }),
    salvarFuncionario: alimentacaoAccessProcedure.input(z.object({ id:z.number().int().positive().optional(),nome:z.string().trim().min(2).max(180),setor:z.string().trim().min(2).max(120),ativo:z.boolean() })).mutation(({input})=>alimentacao.salvarFuncionario(input)),
    excluirFuncionario: alimentacaoAccessProcedure.input(z.object({ id:z.number().int().positive(),motivo:z.string().trim().min(3).max(500) })).mutation(({input,ctx})=>alimentacao.excluirFuncionario(input.id,input.motivo,ctx.user.name||"Sistema")),
    salvarFornecedor: alimentacaoAccessProcedure.input(z.object({ id:z.number().int().positive().optional(),nome:z.string().trim().min(2).max(180),valorRefeicao:z.number().nonnegative().max(9999999999),ativo:z.boolean() })).mutation(({input})=>alimentacao.salvarFornecedor(input)),
    excluirFornecedor: alimentacaoAccessProcedure.input(z.object({ id:z.number().int().positive(),motivo:z.string().trim().min(3).max(500) })).mutation(({input,ctx})=>alimentacao.excluirFornecedor(input.id,input.motivo,ctx.user.name||"Sistema")),
    salvarCusto: alimentacaoAccessProcedure.input(z.object({ id:z.number().int().positive().optional(),descricao:z.string().trim().min(2).max(220),categoria:z.string().trim().min(2).max(100),valor:z.number().positive(),dataCusto:dataIsoSchema })).mutation(({input,ctx})=>alimentacao.salvarCusto(input,ctx.user.name||"Sistema")),
    excluirCusto: alimentacaoAccessProcedure.input(z.object({ id:z.number().int().positive(),motivo:z.string().trim().min(3).max(500) })).mutation(({input,ctx})=>alimentacao.excluirCusto(input.id,input.motivo,ctx.user.name||"Sistema")),
    criarLancamento: alimentacaoAccessProcedure.input(z.object({ fornecedorId:z.number().int().positive(),numeroNota:z.string().trim().max(80).optional(),tipo:z.enum(TIPOS_REFEICAO),dataRefeicao:dataIsoSchema,valorExtra:z.number().nonnegative(),observacao:z.string().max(5000).optional(),token:z.string().uuid(),itens:z.array(z.object({funcionarioId:z.number().int().positive(),quantidade:z.number().int().positive(),valorUnitario:z.number().nonnegative()})).min(1).max(100) })).mutation(({input,ctx})=>alimentacao.criarLancamento(input,ctx.user.name||"Sistema")),
    obterLancamento: alimentacaoAccessProcedure.input(z.object({id:z.number().int().positive()})).query(({input})=>alimentacao.obterLancamento(input.id)),
    atualizarLancamento: alimentacaoAccessProcedure.input(z.object({id:z.number().int().positive(),data:z.object({fornecedorId:z.number().int().positive(),numeroNota:z.string().trim().max(80).optional(),tipo:z.enum(TIPOS_REFEICAO),dataRefeicao:dataIsoSchema,valorExtra:z.number().nonnegative(),observacao:z.string().max(5000).optional(),itens:z.array(z.object({funcionarioId:z.number().int().positive(),quantidade:z.number().int().positive(),valorUnitario:z.number().nonnegative()})).min(1).max(100)})})).mutation(({input,ctx})=>alimentacao.atualizarLancamento(input.id,input.data,ctx.user.name||"Sistema")),
    excluirLancamento: alimentacaoAccessProcedure.input(z.object({id:z.number().int().positive(),motivo:z.string().trim().min(3).max(500)})).mutation(({input,ctx})=>alimentacao.excluirLancamento(input.id,input.motivo,ctx.user.name||"Sistema")),
  }),

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

