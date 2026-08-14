import { 
  int, 
  mysqlEnum, 
  mysqlTable, 
  text, 
  timestamp, 
  varchar,
  decimal,
  index,
  uniqueIndex,
  date,
  boolean,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Tabela de usuários com suporte a múltiplos perfis
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Perfil específico do Minasfalto
  profile: mysqlEnum("profile", ["admfull", "comercial", "subcomercial", "gerencia", "diretoria"]).default("comercial"),
  username: varchar("username", { length: 64 }).unique(),
  status: mysqlEnum("status", ["active", "inactive", "archived"]).default("active").notNull(),
  isProtected: boolean("isProtected").default(false).notNull(),
  updatedByUserId: int("updatedByUserId"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userPermissions = mysqlTable("user_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  resourceKey: varchar("resourceKey", { length: 80 }).notNull(),
  actionKey: varchar("actionKey", { length: 40 }).notNull(),
  effect: mysqlEnum("effect", ["allow", "deny", "view"]).notNull(),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userPermissionUnique: uniqueIndex("user_permission_unique").on(table.userId, table.resourceKey, table.actionKey),
  userPermissionUserIndex: index("user_permission_user_idx").on(table.userId),
}));

export const profilePermissions = mysqlTable("profile_permissions", {
  id: int("id").autoincrement().primaryKey(),
  profileKey: varchar("profileKey", { length: 40 }).notNull(),
  resourceKey: varchar("resourceKey", { length: 80 }).notNull(),
  actionKey: varchar("actionKey", { length: 40 }).notNull(),
  effect: mysqlEnum("effect", ["allow", "deny", "view"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  profilePermissionUnique: uniqueIndex("profile_permission_unique").on(table.profileKey, table.resourceKey, table.actionKey),
}));

export const permissionAuditLog = mysqlTable("permission_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  targetUserId: int("targetUserId"),
  action: varchar("action", { length: 80 }).notNull(),
  previousValue: text("previousValue"),
  newValue: text("newValue"),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  permissionAuditTargetIndex: index("permission_audit_target_idx").on(table.targetUserId),
}));

export type UserPermission = typeof userPermissions.$inferSelect;
export type ProfilePermission = typeof profilePermissions.$inferSelect;

/**
 * Tabela de pedidos de vendas
 */
export const pedidos = mysqlTable("pedidos", {
  id: int("id").autoincrement().primaryKey(),
  dataPedido: varchar("dataPedido", { length: 10 }), // DD/MM/YYYY
  cliente: varchar("cliente", { length: 255 }).notNull(),
  pedido: varchar("pedido", { length: 50 }).notNull().unique(),
  situacao: varchar("situacao", { length: 50 }).default("Aprovado"), // Aprovado, Pendente, etc
  qtde: decimal("qtde", { precision: 18, scale: 3 }).default("0"),
  valorUnit: decimal("valorUnit", { precision: 18, scale: 2 }).default("0"),
  totalPedido: decimal("totalPedido", { precision: 18, scale: 2 }).default("0"),
  saldo: decimal("saldo", { precision: 18, scale: 2 }).default("0"),
  percentual: decimal("percentual", { precision: 5, scale: 2 }).default("0"),
  prioridade: mysqlEnum("prioridade", ["NORMAL", "PRIORIDADE"]).default("NORMAL"),
  qtdeGranel: decimal("qtdeGranel", { precision: 18, scale: 3 }).default("0"),
  qtdeTapFacil: decimal("qtdeTapFacil", { precision: 18, scale: 3 }).default("0"),
  status: varchar("status", { length: 20 }).default("PENDENTE"),
  dataEntrega: varchar("dataEntrega", { length: 10 }), // DD/MM/YYYY
  observacoes: text("observacoes").default(""),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  pedidoIdx: index("pedido_idx").on(table.pedido),
  clienteIdx: index("cliente_idx").on(table.cliente),
  statusIdx: index("status_idx").on(table.status),
  prioridadeIdx: index("prioridade_idx").on(table.prioridade),
}));

export type Pedido = typeof pedidos.$inferSelect;
export type InsertPedido = typeof pedidos.$inferInsert;

export const pedidoAtividades = mysqlTable("pedido_atividades", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId"),
  pedidoNum: varchar("pedidoNum", { length: 50 }),
  cliente: varchar("cliente", { length: 255 }),
  descricao: text("descricao").notNull(),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  pedidoIdx: index("pedido_atividades_pedido_idx").on(table.pedidoId),
  dataIdx: index("pedido_atividades_data_idx").on(table.criadoEm),
}));

export type PedidoAtividade = typeof pedidoAtividades.$inferSelect;
export type InsertPedidoAtividade = typeof pedidoAtividades.$inferInsert;

/**
 * Pedidos de material para obras proprias importados do CRTI.
 * Observacoes sao campos locais e nao devem ser sobrescritas pela sincronizacao.
 */
export const pedidosObras = mysqlTable("pedidos_obras", {
  id: int("id").autoincrement().primaryKey(),
  dataPedido: varchar("dataPedido", { length: 10 }),
  cliente: varchar("cliente", { length: 255 }).notNull(),
  pedido: varchar("pedido", { length: 50 }).notNull().unique(),
  situacao: varchar("situacao", { length: 50 }).default("Aprovado"),
  qtde: decimal("qtde", { precision: 18, scale: 3 }).default("0"),
  qtdeTapFacil: decimal("qtdeTapFacil", { precision: 18, scale: 3 }).default("0"),
  qtdeGranel: decimal("qtdeGranel", { precision: 18, scale: 3 }).default("0"),
  valorUnit: decimal("valorUnit", { precision: 18, scale: 2 }).default("0"),
  totalPedido: decimal("totalPedido", { precision: 18, scale: 2 }).default("0"),
  saldo: decimal("saldo", { precision: 18, scale: 2 }).default("0"),
  prioridade: mysqlEnum("prioridade", ["NORMAL", "PRIORIDADE"]).default("NORMAL"),
  status: varchar("status", { length: 20 }).default("Aprovado"),
  observacoesPagamento: text("observacoesPagamento").default(""),
  observacoes: text("observacoes").default(""),
  observacoesOperador: text("observacoesOperador").default(""),
  condicaoPagamento: text("condicaoPagamento").default(""),
  materiais: text("materiais").default(""),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  pedidoIdx: index("pedidos_obras_pedido_idx").on(table.pedido),
  clienteIdx: index("pedidos_obras_cliente_idx").on(table.cliente),
  statusIdx: index("pedidos_obras_status_idx").on(table.status),
  prioridadeIdx: index("pedidos_obras_prioridade_idx").on(table.prioridade),
}));

export type PedidoObra = typeof pedidosObras.$inferSelect;
export type InsertPedidoObra = typeof pedidosObras.$inferInsert;

export const despesasTabelaGeral = mysqlTable("despesas_tabela_geral", {
  id: int("id").autoincrement().primaryKey(),
  sourceKey: varchar("sourceKey", { length: 191 }).notNull().unique(),
  codigoFornecedorCliente: varchar("codigoFornecedorCliente", { length: 50 }),
  fornecedorCliente: varchar("fornecedorCliente", { length: 255 }),
  numeroDocumento: varchar("numeroDocumento", { length: 80 }),
  tipoConta: varchar("tipoConta", { length: 50 }),
  tipoDocumento: varchar("tipoDocumento", { length: 100 }),
  dataEmissao: varchar("dataEmissao", { length: 10 }),
  dataVencimento: varchar("dataVencimento", { length: 10 }),
  valorTotalDocumento: decimal("valorTotalDocumento", { precision: 18, scale: 2 }).default("0"),
  complemento: text("complemento").default(""),
  observacoesAprovacao: text("observacoesAprovacao").default(""),
  situacao: varchar("situacao", { length: 80 }),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  sourceKeyIdx: index("despesas_sourceKey_idx").on(table.sourceKey),
  fornecedorIdx: index("despesas_fornecedor_idx").on(table.fornecedorCliente),
  documentoIdx: index("despesas_documento_idx").on(table.numeroDocumento),
  vencimentoIdx: index("despesas_vencimento_idx").on(table.dataVencimento),
}));

export type DespesaTabelaGeral = typeof despesasTabelaGeral.$inferSelect;
export type InsertDespesaTabelaGeral = typeof despesasTabelaGeral.$inferInsert;

export const pedidoObraFinanceiro = mysqlTable("pedido_obra_financeiro", {
  id: int("id").autoincrement().primaryKey(),
  pedidoObraId: int("pedidoObraId").notNull().unique(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  nfes: decimal("nfes", { precision: 18, scale: 2 }).default("0"),
  faturamentoDireto: decimal("faturamentoDireto", { precision: 18, scale: 2 }).default("0"),
  valorTotalImposto: decimal("valorTotalImposto", { precision: 18, scale: 2 }).default("0"),
  porcentagemImposto: decimal("porcentagemImposto", { precision: 5, scale: 2 }).default("17.00"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  pedidoObraIdIdx: index("pedido_obra_financeiro_pedidoObraId_idx").on(table.pedidoObraId),
  pedidoNumIdx: index("pedido_obra_financeiro_pedidoNum_idx").on(table.pedidoNum),
}));

export type PedidoObraFinanceiro = typeof pedidoObraFinanceiro.$inferSelect;
export type InsertPedidoObraFinanceiro = typeof pedidoObraFinanceiro.$inferInsert;

export const pedidoObraDespesas = mysqlTable("pedido_obra_despesas", {
  id: int("id").autoincrement().primaryKey(),
  pedidoObraId: int("pedidoObraId").notNull(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  despesaTabelaGeralId: int("despesaTabelaGeralId").unique(),
  origem: mysqlEnum("origem", ["manual", "vinculada"]).default("manual").notNull(),
  categoria: mysqlEnum("categoria", ["Custo", "Despesa", "Outros"]).default("Despesa").notNull(),
  justificativaOutros: text("justificativaOutros").default(""),
  codigoFornecedorCliente: varchar("codigoFornecedorCliente", { length: 50 }),
  fornecedorCliente: varchar("fornecedorCliente", { length: 255 }),
  numeroDocumento: varchar("numeroDocumento", { length: 80 }),
  tipoConta: varchar("tipoConta", { length: 50 }),
  tipoDocumento: varchar("tipoDocumento", { length: 100 }),
  dataEmissao: varchar("dataEmissao", { length: 10 }),
  dataVencimento: varchar("dataVencimento", { length: 10 }),
  valorTotalDocumento: decimal("valorTotalDocumento", { precision: 18, scale: 2 }).default("0"),
  complemento: text("complemento").default(""),
  observacoesAprovacao: text("observacoesAprovacao").default(""),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  pedidoObraIdIdx: index("pedido_obra_despesas_pedidoObraId_idx").on(table.pedidoObraId),
  pedidoNumIdx: index("pedido_obra_despesas_pedidoNum_idx").on(table.pedidoNum),
  despesaTabelaGeralIdIdx: index("pedido_obra_despesas_despesaTabelaGeralId_idx").on(table.despesaTabelaGeralId),
}));

export type PedidoObraDespesa = typeof pedidoObraDespesas.$inferSelect;
export type InsertPedidoObraDespesa = typeof pedidoObraDespesas.$inferInsert;

export const pedidoObraReceitas = mysqlTable("pedido_obra_receitas", {
  id: int("id").autoincrement().primaryKey(),
  pedidoObraId: int("pedidoObraId").notNull(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  despesaTabelaGeralId: int("despesaTabelaGeralId"),
  codigoFornecedorCliente: varchar("codigoFornecedorCliente", { length: 50 }),
  fornecedorCliente: varchar("fornecedorCliente", { length: 255 }),
  numeroDocumento: varchar("numeroDocumento", { length: 80 }),
  status: mysqlEnum("status", ["Nfe", "Faturamento Direto", "Outros"]).default("Nfe").notNull(),
  tipoReceitaOutros: text("tipoReceitaOutros").default(""),
  tipoConta: varchar("tipoConta", { length: 50 }),
  tipoDocumento: varchar("tipoDocumento", { length: 100 }),
  dataEmissao: varchar("dataEmissao", { length: 10 }),
  dataVencimento: varchar("dataVencimento", { length: 10 }),
  valorTotalDocumento: decimal("valorTotalDocumento", { precision: 18, scale: 2 }).default("0"),
  data: varchar("data", { length: 10 }),
  valor: decimal("valor", { precision: 18, scale: 2 }).default("0"),
  descricao: text("descricao").default(""),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  pedidoObraIdIdx: index("pedido_obra_receitas_pedidoObraId_idx").on(table.pedidoObraId),
  pedidoNumIdx: index("pedido_obra_receitas_pedidoNum_idx").on(table.pedidoNum),
  despesaTabelaGeralIdIdx: index("pedido_obra_receitas_despesaTabelaGeralId_idx").on(table.despesaTabelaGeralId),
}));

export type PedidoObraReceita = typeof pedidoObraReceitas.$inferSelect;
export type InsertPedidoObraReceita = typeof pedidoObraReceitas.$inferInsert;

export const pedidoObraCustos = mysqlTable("pedido_obra_custos", {
  id: int("id").autoincrement().primaryKey(),
  sourceKey: varchar("sourceKey", { length: 191 }).notNull().unique(),
  pedidoObraId: int("pedidoObraId").notNull(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  numeroDocumento: varchar("numeroDocumento", { length: 80 }),
  dataEmissao: varchar("dataEmissao", { length: 10 }),
  valorTotal: decimal("valorTotal", { precision: 18, scale: 2 }).default("0"),
  situacao: varchar("situacao", { length: 80 }).default("Retirado"),
  complemento: text("complemento").default(""),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  sourceKeyIdx: index("pedido_obra_custos_sourceKey_idx").on(table.sourceKey),
  pedidoObraIdIdx: index("pedido_obra_custos_pedidoObraId_idx").on(table.pedidoObraId),
  pedidoNumIdx: index("pedido_obra_custos_pedidoNum_idx").on(table.pedidoNum),
}));

export type PedidoObraCusto = typeof pedidoObraCustos.$inferSelect;
export type InsertPedidoObraCusto = typeof pedidoObraCustos.$inferInsert;

export const pedidoObraResultadoAlocacoes = mysqlTable("pedido_obra_resultado_alocacoes", {
  id: int("id").autoincrement().primaryKey(),
  pedidoObraId: int("pedidoObraId").notNull(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  itemTipo: mysqlEnum("itemTipo", ["receita", "despesa", "custo"]).notNull(),
  itemId: int("itemId").notNull(),
  mesReferencia: varchar("mesReferencia", { length: 7 }).notNull(),
  dataReferencia: varchar("dataReferencia", { length: 10 }),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  uniqueItemIdx: uniqueIndex("pedido_obra_resultado_alocacoes_item_unique").on(table.pedidoObraId, table.itemTipo, table.itemId),
  pedidoObraIdIdx: index("pedido_obra_resultado_alocacoes_pedidoObraId_idx").on(table.pedidoObraId),
  pedidoNumIdx: index("pedido_obra_resultado_alocacoes_pedidoNum_idx").on(table.pedidoNum),
}));

export type PedidoObraResultadoAlocacao = typeof pedidoObraResultadoAlocacoes.$inferSelect;
export type InsertPedidoObraResultadoAlocacao = typeof pedidoObraResultadoAlocacoes.$inferInsert;

export const licitacaoStatus = mysqlTable("licitacao_status", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull().unique(),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  nomeIdx: index("licitacao_status_nome_idx").on(table.nome),
}));

export type LicitacaoStatus = typeof licitacaoStatus.$inferSelect;
export type InsertLicitacaoStatus = typeof licitacaoStatus.$inferInsert;

export const licitacaoPlataformas = mysqlTable("licitacao_plataformas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 180 }).notNull(),
  link: text("link").default(""),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  nomeIdx: index("licitacao_plataformas_nome_idx").on(table.nome),
}));

export type LicitacaoPlataforma = typeof licitacaoPlataformas.$inferSelect;
export type InsertLicitacaoPlataforma = typeof licitacaoPlataformas.$inferInsert;

export const licitacaoVendedores = mysqlTable("licitacao_vendedores", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 180 }).notNull().unique(),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  nomeIdx: index("licitacao_vendedores_nome_idx").on(table.nome),
}));

export type LicitacaoVendedor = typeof licitacaoVendedores.$inferSelect;
export type InsertLicitacaoVendedor = typeof licitacaoVendedores.$inferInsert;

export const licitacoes = mysqlTable("licitacoes", {
  id: int("id").autoincrement().primaryKey(),
  data: varchar("data", { length: 10 }),
  orgao: varchar("orgao", { length: 255 }).notNull(),
  cidade: varchar("cidade", { length: 120 }),
  status: varchar("status", { length: 120 }).default("Pendente"),
  plataformaId: int("plataformaId"),
  horaInicioDisputa: varchar("horaInicioDisputa", { length: 8 }),
  alertaPregao: boolean("alertaPregao").default(true),
  item: varchar("item", { length: 120 }),
  tipo: varchar("tipo", { length: 120 }),
  qtdeSc: decimal("qtdeSc", { precision: 18, scale: 3 }).default("0"),
  valorUnit: decimal("valorUnit", { precision: 18, scale: 2 }).default("0"),
  lanceLimite: decimal("lanceLimite", { precision: 18, scale: 2 }).default("0"),
  valorAdjudicado: decimal("valorAdjudicado", { precision: 18, scale: 2 }).default("0"),
  qtdeTn: decimal("qtdeTn", { precision: 18, scale: 3 }).default("0"),
  valorInicialContrato: decimal("valorInicialContrato", { precision: 18, scale: 2 }).default("0"),
  kmDistancia: decimal("kmDistancia", { precision: 18, scale: 2 }).default("0"),
  potencialCliente: varchar("potencialCliente", { length: 80 }),
  regiao: varchar("regiao", { length: 120 }),
  statusContrato: varchar("statusContrato", { length: 80 }).default("Pendente"),
  ataVendedorId: int("ataVendedorId"),
  ataVendedorNome: varchar("ataVendedorNome", { length: 180 }).default("NA"),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  dataIdx: index("licitacoes_data_idx").on(table.data),
  orgaoIdx: index("licitacoes_orgao_idx").on(table.orgao),
  statusIdx: index("licitacoes_status_idx").on(table.status),
}));

export type Licitacao = typeof licitacoes.$inferSelect;
export type InsertLicitacao = typeof licitacoes.$inferInsert;

export const licitacaoAtas = mysqlTable("licitacao_atas", {
  id: int("id").autoincrement().primaryKey(),
  licitacaoId: int("licitacaoId").notNull(),
  vendedorId: int("vendedorId"),
  vendedorNome: varchar("vendedorNome", { length: 180 }).default("NA"),
  validadeAta: varchar("validadeAta", { length: 10 }),
  quantidadeOriginal: decimal("quantidadeOriginal", { precision: 18, scale: 3 }).default("0"),
  limiteIndividual: decimal("limiteIndividual", { precision: 18, scale: 3 }).default("0"),
  limiteColetivo: decimal("limiteColetivo", { precision: 18, scale: 3 }).default("0"),
  observacoes: text("observacoes").default(""),
  alertaVencimento: boolean("alertaVencimento").default(true),
  quantidadeMaximaAdesoes: int("quantidadeMaximaAdesoes").default(0),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  licitacaoIdx: index("licitacao_atas_licitacao_idx").on(table.licitacaoId),
  vendedorIdx: index("licitacao_atas_vendedor_idx").on(table.vendedorId),
}));

export type LicitacaoAta = typeof licitacaoAtas.$inferSelect;
export type InsertLicitacaoAta = typeof licitacaoAtas.$inferInsert;

export const licitacaoAdesoes = mysqlTable("licitacao_adesoes", {
  id: int("id").autoincrement().primaryKey(),
  licitacaoId: int("licitacaoId").notNull(),
  orgaoAderente: varchar("orgaoAderente", { length: 255 }).notNull(),
  dataAdesao: varchar("dataAdesao", { length: 10 }),
  quantidade: decimal("quantidade", { precision: 18, scale: 3 }).default("0"),
  entregue: boolean("entregue").default(false),
  dataEntrega: varchar("dataEntrega", { length: 10 }),
  pedidoCrti: varchar("pedidoCrti", { length: 50 }),
  clienteCrti: varchar("clienteCrti", { length: 255 }),
  dataPedidoCrti: varchar("dataPedidoCrti", { length: 10 }),
  statusPedidoCrti: varchar("statusPedidoCrti", { length: 80 }),
  quantidadePedidoCrti: decimal("quantidadePedidoCrti", { precision: 18, scale: 3 }).default("0"),
  valorTotalPedidoCrti: decimal("valorTotalPedidoCrti", { precision: 18, scale: 2 }).default("0"),
  observacoes: text("observacoes").default(""),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  licitacaoIdx: index("licitacao_adesoes_licitacao_idx").on(table.licitacaoId),
  pedidoIdx: index("licitacao_adesoes_pedido_idx").on(table.pedidoCrti),
}));

export type LicitacaoAdesao = typeof licitacaoAdesoes.$inferSelect;
export type InsertLicitacaoAdesao = typeof licitacaoAdesoes.$inferInsert;

export const licitacaoAdesaoPedidosCrti = mysqlTable("licitacao_adesao_pedidos_crti", {
  id: int("id").autoincrement().primaryKey(),
  adesaoId: int("adesaoId").notNull(),
  licitacaoId: int("licitacaoId").notNull(),
  pedidoCrti: varchar("pedidoCrti", { length: 50 }).notNull().unique(),
  cliente: varchar("cliente", { length: 255 }),
  dataPedido: varchar("dataPedido", { length: 10 }),
  statusPedido: varchar("statusPedido", { length: 80 }),
  quantidade: decimal("quantidade", { precision: 18, scale: 3 }).default("0"),
  valorTotal: decimal("valorTotal", { precision: 18, scale: 2 }).default("0"),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  adesaoIdx: index("licitacao_adesao_pedidos_adesao_idx").on(table.adesaoId),
  licitacaoIdx: index("licitacao_adesao_pedidos_licitacao_idx").on(table.licitacaoId),
}));

export const licitacaoPedidosCrti = mysqlTable("licitacao_pedidos_crti", {
  id: int("id").autoincrement().primaryKey(),
  licitacaoId: int("licitacaoId").notNull(),
  pedidoCrti: varchar("pedidoCrti", { length: 50 }).notNull(),
  origem: varchar("origem", { length: 20 }).notNull().default("CRTI"),
  cliente: varchar("cliente", { length: 255 }),
  dataPedido: varchar("dataPedido", { length: 10 }),
  statusPedido: varchar("statusPedido", { length: 80 }),
  quantidade: decimal("quantidade", { precision: 18, scale: 3 }).default("0"),
  valorTotal: decimal("valorTotal", { precision: 18, scale: 2 }).default("0"),
  saldoEntrega: decimal("saldoEntrega", { precision: 18, scale: 3 }).default("0"),
  observacoes: text("observacoes").default(""),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  licitacaoIdx: index("licitacao_pedidos_crti_licitacao_idx").on(table.licitacaoId),
  pedidoIdx: index("licitacao_pedidos_crti_pedido_idx").on(table.pedidoCrti),
}));

export type LicitacaoPedidoCrti = typeof licitacaoPedidosCrti.$inferSelect;
export type InsertLicitacaoPedidoCrti = typeof licitacaoPedidosCrti.$inferInsert;

/**
 * Tabela de histórico de alterações
 */
export const historico = mysqlTable("historico", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId").notNull(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  campo: varchar("campo", { length: 100 }).notNull(),
  valorAnterior: text("valorAnterior"),
  valorNovo: text("valorNovo"),
  usuario: varchar("usuario", { length: 100 }).default("Sistema"),
  dataHora: timestamp("dataHora").defaultNow(),
}, (table) => ({
  pedidoIdIdx: index("historico_pedidoId_idx").on(table.pedidoId),
  pedidoNumIdx: index("historico_pedidoNum_idx").on(table.pedidoNum),
}));

export type Historico = typeof historico.$inferSelect;
export type InsertHistorico = typeof historico.$inferInsert;

/**
 * Tabela de contatos/ligações
 */
export const contatos = mysqlTable("contatos", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId").notNull(),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  tipo: varchar("tipo", { length: 30 }).default("Ligação"),
  descricao: text("descricao"),
  dataContato: timestamp("dataContato").defaultNow(),
  usuario: varchar("usuario", { length: 100 }).default("Sistema"),
}, (table) => ({
  pedidoIdIdx: index("contatos_pedidoId_idx").on(table.pedidoId),
  pedidoNumIdx: index("contatos_pedidoNum_idx").on(table.pedidoNum),
}));

export type Contato = typeof contatos.$inferSelect;
export type InsertContato = typeof contatos.$inferInsert;

/**
 * Tabela de sincronização com CRTI
 */
export const sincronizacaoCrti = mysqlTable("sincronizacaoCrti", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId"),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  tipoPedido: varchar("tipoPedido", { length: 100 }), // ASFALTO TAPFÁCIL SC ou ASFALTO TAPFÁCIL GRANEL
  statusCrti: varchar("statusCrti", { length: 50 }), // Aprovado, Concluído, etc
  statusLocal: varchar("statusLocal", { length: 20 }),
  dataImportacao: timestamp("dataImportacao").defaultNow(),
  dataUltimaSincronizacao: timestamp("dataUltimaSincronizacao"),
}, (table) => ({
  pedidoNumIdx: index("sincronizacao_pedidoNum_idx").on(table.pedidoNum),
}));

export type SincronizacaoCrti = typeof sincronizacaoCrti.$inferSelect;
export type InsertSincronizacaoCrti = typeof sincronizacaoCrti.$inferInsert;

export const sincronizacaoCrtiObras = mysqlTable("sincronizacaoCrtiObras", {
  id: int("id").autoincrement().primaryKey(),
  pedidoObraId: int("pedidoObraId"),
  pedidoNum: varchar("pedidoNum", { length: 50 }).notNull(),
  tipoPedido: varchar("tipoPedido", { length: 100 }),
  statusCrti: varchar("statusCrti", { length: 50 }),
  dataImportacao: timestamp("dataImportacao").defaultNow(),
  dataUltimaSincronizacao: timestamp("dataUltimaSincronizacao"),
}, (table) => ({
  pedidoNumIdx: index("sincronizacao_obras_pedidoNum_idx").on(table.pedidoNum),
}));

export type SincronizacaoCrtiObras = typeof sincronizacaoCrtiObras.$inferSelect;
export type InsertSincronizacaoCrtiObras = typeof sincronizacaoCrtiObras.$inferInsert;

/**
 * Eventos que compõem o saldo sequencial do estoque.
 * Saldos finais são derivados em ordem cronológica e não duplicados no banco.
 */
export const estoqueMovimentacoes = mysqlTable("estoque_movimentacoes", {
  id: int("id").autoincrement().primaryKey(),
  dataMovimentacao: date("data_movimentacao", { mode: "string" }).notNull(),
  estoqueInicial: decimal("estoque_inicial", { precision: 18, scale: 2 }).default("0").notNull(),
  producaoSacos: decimal("producao_sacos", { precision: 18, scale: 2 }).default("0").notNull(),
  saidaSacos: decimal("saida_sacos", { precision: 18, scale: 2 }).default("0").notNull(),
  entradaGranelTon: decimal("entrada_granel_ton", { precision: 18, scale: 3 }).default("0").notNull(),
  saidaGranelTon: decimal("saida_granel_ton", { precision: 18, scale: 3 }).default("0").notNull(),
  ocorrencias: text("ocorrencias"),
  criadoPor: varchar("criado_por", { length: 100 }).default("Sistema").notNull(),
  atualizadoPor: varchar("atualizado_por", { length: 100 }).default("Sistema").notNull(),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  dataMovimentacaoIdx: index("estoque_data_movimentacao_idx").on(table.dataMovimentacao),
}));

export type EstoqueMovimentacao = typeof estoqueMovimentacoes.$inferSelect;
export type InsertEstoqueMovimentacao = typeof estoqueMovimentacoes.$inferInsert;


export const alimentacaoFuncionarios = mysqlTable("alimentacao_funcionarios", {
  id: int("id").autoincrement().primaryKey(), nome: varchar("nome", { length: 180 }).notNull(),
  setor: varchar("setor", { length: 120 }).notNull(), ativo: boolean("ativo").default(true).notNull(),
  origemSistema: varchar("origem_sistema", { length: 40 }), origemId: varchar("origem_id", { length: 80 }),
  criadoEm: timestamp("criado_em").defaultNow().notNull(), atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, t => ({ nomeIdx: index("alimentacao_func_nome_idx").on(t.nome), origemUq: uniqueIndex("alimentacao_func_origem_uq").on(t.origemSistema, t.origemId) }));

export const alimentacaoFornecedores = mysqlTable("alimentacao_fornecedores", {
  id: int("id").autoincrement().primaryKey(), nome: varchar("nome", { length: 180 }).notNull(),
  valorRefeicao: decimal("valor_refeicao", { precision: 12, scale: 2 }).default("0").notNull(), ativo: boolean("ativo").default(true).notNull(),
  origemSistema: varchar("origem_sistema", { length: 40 }), origemId: varchar("origem_id", { length: 80 }),
  criadoEm: timestamp("criado_em").defaultNow().notNull(), atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, t => ({ nomeIdx: index("alimentacao_forn_nome_idx").on(t.nome), origemUq: uniqueIndex("alimentacao_forn_origem_uq").on(t.origemSistema, t.origemId) }));

export const alimentacaoLancamentos = mysqlTable("alimentacao_lancamentos", {
  id: int("id").autoincrement().primaryKey(), fornecedorId: int("fornecedor_id").notNull(), numeroNota: varchar("numero_nota", { length: 80 }),
  tipo: varchar("tipo", { length: 30 }).notNull(), dataRefeicao: date("data_refeicao", { mode: "string" }).notNull(),
  valorExtra: decimal("valor_extra", { precision: 12, scale: 2 }).default("0").notNull(), observacao: text("observacao"),
  tokenIdempotencia: varchar("token_idempotencia", { length: 80 }).notNull(), criadoPor: varchar("criado_por", { length: 120 }).notNull(),
  atualizadoPor: varchar("atualizado_por", { length: 120 }).notNull(), excluidoEm: timestamp("excluido_em"), excluidoPor: varchar("excluido_por", { length: 120 }),
  motivoExclusao: varchar("motivo_exclusao", { length: 500 }), origemSistema: varchar("origem_sistema", { length: 40 }), origemId: varchar("origem_id", { length: 120 }),
  criadoEm: timestamp("criado_em").defaultNow().notNull(), atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, t => ({ tokenUq: uniqueIndex("alimentacao_lanc_token_uq").on(t.tokenIdempotencia), dataIdx: index("alimentacao_lanc_data_idx").on(t.dataRefeicao) }));

export const alimentacaoLancamentoItens = mysqlTable("alimentacao_lancamento_itens", {
  id: int("id").autoincrement().primaryKey(), lancamentoId: int("lancamento_id").notNull(), funcionarioId: int("funcionario_id").notNull(),
  quantidade: int("quantidade").notNull(), valorUnitario: decimal("valor_unitario", { precision: 12, scale: 2 }).notNull(),
  valorTotal: decimal("valor_total", { precision: 14, scale: 2 }).notNull(), origemSistema: varchar("origem_sistema", { length: 40 }), origemId: varchar("origem_id", { length: 80 }),
  criadoEm: timestamp("criado_em").defaultNow().notNull(), atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, t => ({ lancFuncUq: uniqueIndex("alimentacao_item_func_uq").on(t.lancamentoId, t.funcionarioId), funcIdx: index("alimentacao_item_func_idx").on(t.funcionarioId) }));

export const alimentacaoCustosExtras = mysqlTable("alimentacao_custos_extras", {
  id: int("id").autoincrement().primaryKey(), descricao: varchar("descricao", { length: 220 }).notNull(), categoria: varchar("categoria", { length: 100 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(), dataCusto: date("data_custo", { mode: "string" }).notNull(), criadoPor: varchar("criado_por", { length: 120 }).notNull(),
  excluidoEm: timestamp("excluido_em"), excluidoPor: varchar("excluido_por", { length: 120 }), motivoExclusao: varchar("motivo_exclusao", { length: 500 }),
  origemSistema: varchar("origem_sistema", { length: 40 }), origemId: varchar("origem_id", { length: 80 }),
  criadoEm: timestamp("criado_em").defaultNow().notNull(), atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
}, t => ({ dataIdx: index("alimentacao_custo_data_idx").on(t.dataCusto) }));

// Relations
export const pedidosRelations = relations(pedidos, ({ many }) => ({
  historico: many(historico),
  contatos: many(contatos),
  sincronizacao: many(sincronizacaoCrti),
}));

export const pedidosObrasRelations = relations(pedidosObras, ({ many }) => ({
  sincronizacao: many(sincronizacaoCrtiObras),
}));

export const historicoRelations = relations(historico, ({ one }) => ({
  pedido: one(pedidos, {
    fields: [historico.pedidoId],
    references: [pedidos.id],
  }),
}));

export const contatosRelations = relations(contatos, ({ one }) => ({
  pedido: one(pedidos, {
    fields: [contatos.pedidoId],
    references: [pedidos.id],
  }),
}));

export const sincronizacaoRelations = relations(sincronizacaoCrti, ({ one }) => ({
  pedido: one(pedidos, {
    fields: [sincronizacaoCrti.pedidoId],
    references: [pedidos.id],
  }),
}));

export const sincronizacaoObrasRelations = relations(sincronizacaoCrtiObras, ({ one }) => ({
  pedido: one(pedidosObras, {
    fields: [sincronizacaoCrtiObras.pedidoObraId],
    references: [pedidosObras.id],
  }),
}));
