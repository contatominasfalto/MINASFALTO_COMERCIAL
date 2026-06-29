import { 
  int, 
  mysqlEnum, 
  mysqlTable, 
  text, 
  timestamp, 
  varchar,
  decimal,
  index
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

// Relations
export const pedidosRelations = relations(pedidos, ({ many }) => ({
  historico: many(historico),
  contatos: many(contatos),
  sincronizacao: many(sincronizacaoCrti),
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
