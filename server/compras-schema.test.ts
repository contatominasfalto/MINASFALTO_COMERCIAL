import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { permissionTargetForProcedure } from "../shared/access-control";
import { comprasUppercase } from "./compras";

describe("Controle de Compras", () => {
  it("mapeia cada operação para a permissão granular correta", () => {
    expect(permissionTargetForProcedure("compras.painel", "query")).toEqual({ resource: "compras", action: "read" });
    expect(permissionTargetForProcedure("compras.criarOrcamento", "mutation")).toEqual({ resource: "compras", action: "create" });
    expect(permissionTargetForProcedure("compras.atualizarOrcamento", "mutation")).toEqual({ resource: "compras", action: "update" });
    expect(permissionTargetForProcedure("compras.atualizarClassificacaoFornecedor", "mutation")).toEqual({ resource: "compras", action: "update" });
    expect(permissionTargetForProcedure("compras.excluirOrcamento", "mutation")).toEqual({ resource: "compras", action: "delete" });
  });

  it("possui as sete tabelas e relações que preservam o histórico", async () => {
    const sql = await readFile(new URL("../drizzle/0026_controle_compras.sql", import.meta.url), "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g)].map(match => match[1]);

    expect(tables).toEqual([
      "compras_fornecedores",
      "compras_materiais",
      "compras_orcamentos",
      "compras_orcamento_itens",
      "compras_orcamento_ofertas",
      "compras_importacoes",
      "compras_importacao_celulas",
    ]);
    expect(sql).toContain("compras_importacao_hash_uq");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("compras_oferta_fornecedor_fk");
    expect(sql).toContain("`fornecedor_nota` boolean NOT NULL DEFAULT true");
    expect(sql).toContain("`fornecedor_item` boolean NOT NULL DEFAULT false");
    expect(sql).toContain("`prazo_entrega_padrao` varchar(120) NULL");
  });

  it("normaliza o conteúdo textual de compras em caixa alta", () => {
    expect(comprasUppercase("  prazo de 15 dias  ")).toBe("PRAZO DE 15 DIAS");
    expect(comprasUppercase("material e servico")).toBe("MATERIAL E SERVICO");
  });
});
