import { describe, expect, it } from "vitest";
import {
  anoDoOrcamento,
  formatarNumeroOrcamento,
} from "./compras";

describe("numeração automática dos orçamentos de compras", () => {
  it("extrai o ano da data e monta o número crescente", () => {
    expect(anoDoOrcamento("2026-08-24")).toBe(2026);
    expect(formatarNumeroOrcamento(2026, 13)).toBe("COT-2026-13");
  });

  it("rejeita data e sequência inválidas", () => {
    expect(() => anoDoOrcamento("24/08/2026")).toThrow(
      "Data do orcamento invalida."
    );
    expect(() => formatarNumeroOrcamento(2026, 0)).toThrow(
      "Sequencia do orcamento invalida."
    );
  });
});
