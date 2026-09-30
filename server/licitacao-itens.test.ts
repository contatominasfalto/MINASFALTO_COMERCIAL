import { describe, expect, it } from "vitest";
import { lerLicitacaoItens, licitacaoItensSchema, novoLicitacaoItem, resumirLicitacaoItens, valorTotalItem } from "../shared/licitacao-itens";

describe("itens de licitação", () => {
  it("calcula quantidade de sacos × preço com arredondamento decimal", () => {
    expect(valorTotalItem({ qtdeSc: 1500, valorUnit: 30.87 })).toBe(46305);
    expect(valorTotalItem({ qtdeSc: 0.5, valorUnit: 0.01 })).toBe(0.01);
    expect(valorTotalItem({ qtdeSc: 1.005, valorUnit: 1 })).toBe(1.01);
    expect(valorTotalItem({ qtdeSc: 0, valorUnit: 30.87 })).toBe(0);
  });

  it("soma totais arredondados por item e quantidades sem misturar preços", () => {
    const resumo = resumirLicitacaoItens([
      { ...novoLicitacaoItem(1), tipo: "SACO 25 KG", qtdeSc: 1500, qtdeTn: 37.5, valorUnit: 30.87 },
      { ...novoLicitacaoItem(2), tipo: "SACO 50 KG", qtdeSc: 200, qtdeTn: 10, valorUnit: 60 },
    ]);
    expect(resumo).toMatchObject({ qtdeSc: 1700, qtdeTn: 47.5, valorInicialContrato: 58305, valorUnit: null });
    expect(lerLicitacaoItens(resumo)).toHaveLength(2);
  });

  it("aceita de um a cinco itens e rejeita repetição, valores negativos e precisão excessiva", () => {
    expect(licitacaoItensSchema.safeParse([novoLicitacaoItem(1)]).success).toBe(true);
    expect(licitacaoItensSchema.safeParse(Array.from({ length: 5 }, (_, i) => novoLicitacaoItem(i + 1))).success).toBe(true);
    for (const itens of [[], Array.from({ length: 6 }, (_, i) => novoLicitacaoItem(i + 1)),
      [novoLicitacaoItem(1), novoLicitacaoItem(1)], [{ ...novoLicitacaoItem(1), qtdeSc: -1 }],
      [{ ...novoLicitacaoItem(1), valorUnit: 1.111 }], [{ ...novoLicitacaoItem(1), qtdeSc: Infinity }],
      [{ ...novoLicitacaoItem(1), qtdeSc: 1e308 }],
      [{ ...novoLicitacaoItem(1), qtdeSc: 999999999, valorUnit: 999999999 }]]) {
      expect(licitacaoItensSchema.safeParse(itens).success).toBe(false);
    }
  });

  it("apresenta registro antigo sem modificar o objeto, o rótulo ou o valor histórico", () => {
    const registro = { item: "ÚNICO", tipo: "SACO DE 25 KG", qtdeSc: "1500.000", valorUnit: "30.87",
      lanceLimite: "29.00", valorAdjudicado: "28.00", qtdeTn: "37.500", valorInicialContrato: "0.00", itensJson: null };
    const original = JSON.stringify(registro);
    expect(lerLicitacaoItens(registro)[0]).toMatchObject({ numero: 1, qtdeSc: 1500, valorUnit: 30.87 });
    expect(JSON.stringify(registro)).toBe(original);
  });

  it("bloqueia JSON inválido e não sobrescreve com um item vazio", () => {
    expect(() => lerLicitacaoItens({ itensJson: "invalid" })).toThrow();
    expect(() => lerLicitacaoItens({ itensJson: "[]" })).toThrow();
  });
});
