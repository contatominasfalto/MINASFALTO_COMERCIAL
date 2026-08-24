import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { permissionTargetForProcedure } from "../shared/access-control";
import {
  comandoExclusaoCadastro,
  comprasPrazoEntregaPadraoMigration,
  comprasUppercase,
  destinosTransferenciaCompras,
  validarTransferenciaCompras,
} from "./compras";

describe("Controle de Compras", () => {
  it("mapeia cada operação para a permissão granular correta", () => {
    expect(permissionTargetForProcedure("compras.painel", "query")).toEqual({ resource: "compras", action: "read" });
    expect(permissionTargetForProcedure("compras.criarOrcamento", "mutation")).toEqual({ resource: "compras", action: "create" });
    expect(permissionTargetForProcedure("compras.atualizarOrcamento", "mutation")).toEqual({ resource: "compras", action: "update" });
    expect(permissionTargetForProcedure("compras.atualizarClassificacaoFornecedor", "mutation")).toEqual({ resource: "compras", action: "update" });
    expect(permissionTargetForProcedure("compras.transferirCadastro", "mutation")).toEqual({ resource: "compras", action: "update" });
    expect(permissionTargetForProcedure("compras.excluirOrcamento", "mutation")).toEqual({ resource: "compras", action: "delete" });
  });

  it("permite as seis transferencias entre fornecedores e materiais", () => {
    expect(destinosTransferenciaCompras).toEqual({
      FORNECEDOR_NOTA: ["FORNECEDOR_ITEM", "MATERIAL"],
      FORNECEDOR_ITEM: ["FORNECEDOR_NOTA", "MATERIAL"],
      MATERIAL: ["FORNECEDOR_NOTA", "FORNECEDOR_ITEM"],
    });
    for (const [origem, destinos] of Object.entries(destinosTransferenciaCompras)) {
      for (const destino of destinos) {
        expect(() => validarTransferenciaCompras(origem as any, destino)).not.toThrow();
      }
      expect(() => validarTransferenciaCompras(origem as any, origem as any)).toThrow();
    }
  });

  it("possui as nove tabelas e relações que preservam o histórico", async () => {
    const sql = await readFile(new URL("../drizzle/0026_controle_compras.sql", import.meta.url), "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g)].map(match => match[1]);

    expect(tables).toEqual([
      "compras_fornecedores",
      "compras_materiais",
      "compras_objetos_cotacao",
      "compras_veiculos_equipamentos",
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
    expect(sql).toContain("`objeto_cotacao_id` int NULL");
    expect(sql).toContain("`veiculo_equipamento_id` int NULL");
  });

  it("normaliza o conteúdo textual de compras em caixa alta", () => {
    expect(comprasUppercase("  prazo de 15 dias  ")).toBe("PRAZO DE 15 DIAS");
    expect(comprasUppercase("material e servico")).toBe("MATERIAL E SERVICO");
  });

  it("possui migração automática para o prazo padrão de entrega", () => {
    expect(comprasPrazoEntregaPadraoMigration).toContain(
      "ADD COLUMN prazo_entrega_padrao varchar(120) NULL"
    );
  });

  it("exclui fornecedores fisicamente em vez de apenas inativá-los", () => {
    expect(comandoExclusaoCadastro("fornecedor")).toBe(
      "DELETE FROM compras_fornecedores WHERE id=?"
    );
    expect(comandoExclusaoCadastro("material")).toBe(
      "UPDATE compras_materiais SET ativo=FALSE WHERE id=?"
    );
  });
});
