import { 
  int, 
  mysqlEnum, 
  mysqlTable, 
  text, 
  timestamp, 
  varchar,
  decimal,
  index,
  date
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  numeroDocumento: varchar("numeroDocumento", { length: 80 }),
  status: mysqlEnum("status", ["Nfe", "Faturamento Direto", "Outros"]).default("Nfe").notNull(),
  tipoReceitaOutros: text("tipoReceitaOutros").default(""),
  data: varchar("data", { length: 10 }),
  valor: decimal("valor", { precision: 18, scale: 2 }).default("0"),
  descricao: text("descricao").default(""),
  criadoPor: varchar("criadoPor", { length: 100 }).default("Sistema"),
  criadoEm: timestamp("criadoEm").defaultNow(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
}, (table) => ({
  pedidoObraIdIdx: index("pedido_obra_receitas_pedidoObraId_idx").on(table.pedidoObraId),
  pedidoNumIdx: index("pedido_obra_receitas_pedidoNum_idx").on(table.pedidoNum),
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
