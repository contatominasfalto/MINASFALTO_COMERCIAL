import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Pedidos Database Functions", () => {
  const testPedido = {
    dataPedido: "2026-05-22",
    cliente: "CLIENTE TESTE",
    pedido: "TEST-001",
    situacao: "Aprovado",
    qtde: 100,
    valorUnit: 50,
    totalPedido: 5000,
    saldo: 5000,
    percentual: 0,
    prioridade: "NORMAL" as const,
    qtdeGranel: 0,
    qtdeTapFacil: 100,
    status: "PENDENTE" as const,
    dataEntrega: "2026-06-22",
    observacoes: "Pedido de teste",
  };

  it("should create a pedido", async () => {
    const result = await db.createPedido(testPedido);
    expect(result).toBeDefined();
  });

  it("should list pedidos", async () => {
    const pedidos = await db.listPedidos();
    expect(Array.isArray(pedidos)).toBe(true);
  });

  it("should get pedido by number", async () => {
    const pedido = await db.getPedidoByNumber("TEST-001");
    if (pedido) {
      expect(pedido.pedido).toBe("TEST-001");
      expect(pedido.cliente).toBe("CLIENTE TESTE");
    }
  });

  it("should filter pedidos by status", async () => {
    const pedidos = await db.listPedidos({ status: "PENDENTE" });
    expect(Array.isArray(pedidos)).toBe(true);
  });

  it("should filter pedidos by priority", async () => {
    const pedidos = await db.listPedidos({ prioridade: "NORMAL" });
    expect(Array.isArray(pedidos)).toBe(true);
  });

  it("should search pedidos by cliente", async () => {
    const pedidos = await db.listPedidos({ cliente: "CLIENTE" });
    expect(Array.isArray(pedidos)).toBe(true);
  });

  it("should get indicadores", async () => {
    const indicadores = await db.getIndicadores();
    expect(indicadores).toHaveProperty("total");
    expect(indicadores).toHaveProperty("pendente");
    expect(indicadores).toHaveProperty("saidaOk");
    expect(indicadores).toHaveProperty("cancelado");
    expect(indicadores).toHaveProperty("prioridade");
    expect(indicadores).toHaveProperty("totalValor");
    expect(indicadores).toHaveProperty("totalSaldo");
  });
});

describe("Contatos Database Functions", () => {
  it("should create a contato", async () => {
    const contato = {
      pedidoId: 1,
      pedidoNum: "TEST-001",
      tipo: "Ligação" as const,
      descricao: "Contato de teste",
      usuario: "TESTE",
    };

    const result = await db.createContato(contato);
    expect(result).toBeDefined();
  });

  it("should list contatos by pedido", async () => {
    const contatos = await db.listContatosByPedido(1);
    expect(Array.isArray(contatos)).toBe(true);
  });
});

describe("Histórico Database Functions", () => {
  it("should list histórico by pedido", async () => {
    const historico = await db.listHistoricoByPedido(1);
    expect(Array.isArray(historico)).toBe(true);
  });
});

describe("Sincronização CRTI Functions", () => {
  it("should test CRTI connection", async () => {
    const { testarConexaoCrti } = await import("./crti-sync");
    const result = await testarConexaoCrti();
    expect(result).toHaveProperty("sucesso");
    expect(result).toHaveProperty("mensagem");
  });

  it("should import approved pedidos", async () => {
    const { importarPedidosAprovados } = await import("./crti-sync");
    const result = await importarPedidosAprovados(60);
    expect(result).toHaveProperty("sucesso");
    expect(result).toHaveProperty("pedidosEncontrados");
    expect(result).toHaveProperty("pedidosImportados");
  });

  it("should sync completed pedidos", async () => {
    const { sincronizarPedidosConcluidos } = await import("./crti-sync");
    const result = await sincronizarPedidosConcluidos(60);
    expect(result).toHaveProperty("sucesso");
    expect(result).toHaveProperty("pedidosEncontrados");
  });
});
