import { describe, expect, it } from "vitest";
import { dataIso, dinheiro, totalGrupo, totalItem } from "./alimentacao-rules";
describe("regras de alimentação", () => {
  it("interpreta dinheiro brasileiro sem ponto flutuante acumulado", () =>
    expect(dinheiro("1.234,56")).toBe(1234.56));
  it("calcula quantidade individual", () =>
    expect(totalItem(3, 12.5)).toBe(37.5));
  it("aplica o extra uma única vez no grupo", () =>
    expect(
      totalGrupo(
        [
          { quantidade: 2, valorUnitario: 10 },
          { quantidade: 1, valorUnitario: 10 },
        ],
        5
      )
    ).toBe(35));
  it("recusa quantidade fracionada", () =>
    expect(() => totalItem(1.2, 10)).toThrow());
  it("valida data ISO", () => {
    expect(dataIso("2026-08-06")).toBe("2026-08-06");
    expect(() => dataIso("06/08/2026")).toThrow();
  });
});
