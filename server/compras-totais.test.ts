import { describe, expect, it } from "vitest";
import { calcularTotaisOrcamento } from "./compras";

const criarItem = (
  quantidade: number,
  ofertas: Array<[number, boolean]>
) => ({
  descricao: "ITEM DE TESTE",
  quantidade,
  unidade: "UN",
  ofertas: ofertas.map(([valorUnitario, incluidoCalculo], indice) => ({
    fornecedorId: indice + 1,
    valorUnitario,
    incluidoCalculo,
    selecionada: false,
  })),
});

describe("calcularTotaisOrcamento", () => {
  it("soma apenas as propostas marcadas e desconta o valor informado", () => {
    const totais = calcularTotaisOrcamento(
      [
        criarItem(2, [[10, true], [8, false]]),
        criarItem(10, [[100, false]]),
        criarItem(1.5, [[20, true], [4, true]]),
      ],
      6
    );

    expect(totais).toEqual({ valorCotado: 56, valorFinal: 50 });
  });

  it("impede desconto maior que a soma dos itens marcados", () => {
    expect(() =>
      calcularTotaisOrcamento([criarItem(1, [[25, true]])], 30)
    ).toThrow("O valor do desconto nao pode ser maior que o valor cotado.");
  });
});
