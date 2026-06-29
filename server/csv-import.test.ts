import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as csvImport from "./csv-import";
import * as db from "./db";

describe("CSV Import", () => {
  beforeAll(async () => {
    // Limpar dados de teste
    const allPedidos = await db.listPedidos({});
    for (const pedido of allPedidos) {
      if (pedido.pedido?.startsWith("TEST-")) {
        await db.deletePedido(pedido.id);
      }
    }
  });

  it("deve importar pedidos válidos do CSV", async () => {
    const csv = `data,cliente,pedido,situacao,qtde,valorUnit,totalPedido,saldo,percentual,prioridade,qtdeGranel,qtdeTapFacil,status,dataEntrega,observacoes
2026-01-15,Cliente A,TEST-001,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-02-15,Observação teste
2026-01-16,Cliente B,TEST-002,Aprovado,200,75.00,15000.00,7500.00,50,PRIORIDADE,100,100,PENDENTE,2026-02-16,Teste 2`;

    const result = await csvImport.importarCSV(csv);

    expect(result.sucesso).toBe(true);
    expect(result.importados).toBe(2);
    expect(result.erros.length).toBe(0);

    // Verificar se os pedidos foram criados
    const pedido1 = await db.getPedidoByNumber("TEST-001");
    expect(pedido1).toBeDefined();
    expect(pedido1?.cliente).toBe("Cliente A");
    expect(pedido1?.prioridade).toBe("NORMAL");

    const pedido2 = await db.getPedidoByNumber("TEST-002");
    expect(pedido2).toBeDefined();
    expect(pedido2?.cliente).toBe("Cliente B");
    expect(pedido2?.prioridade).toBe("PRIORIDADE");
  });

  it("deve rejeitar linhas com dados inválidos", async () => {
    const csv = `data,cliente,pedido,situacao,qtde,valorUnit,totalPedido,saldo,percentual,prioridade,qtdeGranel,qtdeTapFacil,status,dataEntrega,observacoes
2026-01-15,,TEST-003,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-02-15,Cliente faltando
2026-01-16,Cliente C,,Aprovado,200,75.00,15000.00,7500.00,50,PRIORIDADE,100,100,PENDENTE,2026-02-16,Pedido faltando`;

    const result = await csvImport.importarCSV(csv);

    expect(result.sucesso).toBe(false);
    expect(result.importados).toBe(0);
    expect(result.erros.length).toBe(2);
  });

  it("deve rejeitar pedidos duplicados", async () => {
    // Primeiro import
    const csv1 = `data,cliente,pedido,situacao,qtde,valorUnit,totalPedido,saldo,percentual,prioridade,qtdeGranel,qtdeTapFacil,status,dataEntrega,observacoes
2026-01-15,Cliente A,TEST-004,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-02-15,Teste`;

    const result1 = await csvImport.importarCSV(csv1);
    expect(result1.importados).toBe(1);

    // Segundo import com mesmo pedido
    const result2 = await csvImport.importarCSV(csv1);
    expect(result2.importados).toBe(0);
    expect(result2.erros.length).toBe(1);
    expect(result2.erros[0]).toContain("já existe");
  });

  it("deve processar CSV sem header", async () => {
    const csv = `2026-01-15,Cliente D,TEST-005,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-02-15,Teste`;

    const result = await csvImport.importarCSV(csv);

    expect(result.importados).toBe(1);
    const pedido = await db.getPedidoByNumber("TEST-005");
    expect(pedido).toBeDefined();
  });

  it("deve ignorar linhas vazias", async () => {
    const csv = `data,cliente,pedido,situacao,qtde,valorUnit,totalPedido,saldo,percentual,prioridade,qtdeGranel,qtdeTapFacil,status,dataEntrega,observacoes
2026-01-15,Cliente E,TEST-006,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-02-15,Teste

2026-01-16,Cliente F,TEST-007,Aprovado,200,75.00,15000.00,7500.00,50,PRIORIDADE,100,100,PENDENTE,2026-02-16,Teste 2`;

    const result = await csvImport.importarCSV(csv);

    expect(result.importados).toBe(2);
    expect(result.erros.length).toBe(0);
  });

  afterAll(async () => {
    // Limpar dados de teste
    const allPedidos = await db.listPedidos({});
    for (const pedido of allPedidos) {
      if (pedido.pedido?.startsWith("TEST-")) {
        await db.deletePedido(pedido.id);
      }
    }
  });
});
