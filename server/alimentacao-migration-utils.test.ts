import { describe, expect, it } from "vitest";
// @ts-expect-error utilitário JavaScript executado diretamente pelo importador Node.
import { aggregateLegacyMeals } from "../scripts/alimentacao-migration-utils.mjs";

describe("consolidação da migração de alimentação", () => {
  it("soma refeições repetidas sem duplicar o custo extra", () => {
    const result = aggregateLegacyMeals([
      { id: 1, fornecedor_id: 4, funcionario_id: 9, numero_nota: "10", tipo: "almoco", data_refeicao: new Date(2026, 6, 1), quantidade: 1, valor_unitario: 20, valor_extra: 5 },
      { id: 2, fornecedor_id: 4, funcionario_id: 9, numero_nota: "10", tipo: "almoco", data_refeicao: new Date(2026, 6, 1), quantidade: 1, valor_unitario: 20, valor_extra: 0 },
    ]);
    expect(result.consolidatedRows).toBe(1);
    expect(result.sourceQuantity).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ quantidade: 2, valorBase: 40 });
    expect(result.headers[0].valorExtra).toBe(5);
  });

  it("mantém lançamentos sem nota separados", () => {
    const rows = [1, 2].map(id => ({ id, fornecedor_id: 4, funcionario_id: 9, numero_nota: null, tipo: "almoco", data_refeicao: "2026-07-01", quantidade: 1, valor_unitario: 20, valor_extra: 0 }));
    expect(aggregateLegacyMeals(rows).items).toHaveLength(2);
  });
});
