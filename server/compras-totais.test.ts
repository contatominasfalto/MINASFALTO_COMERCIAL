import { describe, expect, it } from "vitest";
import { calcularTotaisOrcamento } from "./compras";

const criarItem = (
  incluidoCalculo: boolean,
  quantidade: number,
  valores: number[]
) => ({
  incluidoCalculo,
  descricao: "ITEM DE TESTE",
  quantidade,
  unidade: "UN",
  ofertas: valores.map((valorUnitario, indice) => ({
    fornecedorId: indice + 1,
    valorUnitario,
    selecionada: false,
  })),
});

describe("calcularTotaisOrcamento", () => {
  it("soma apenas os itens marcados e desconta o valor informado", () => {
    const totais = calcularTotaisOrcamento(
      [
        criarItem(true, 2, [10, 8]),
        criarItem(false, 10, [100]),
        criarItem(true, 1.5, [20]),
      ],
      6
    );

    expect(totais).toEqual({ valorCotado: 46, valorFinal: 40 });
  });

  it("impede desconto maior que a soma dos itens marcados", () => {
    expect(() =>
      calcularTotaisOrcamento([criarItem(true, 1, [25])], 30)
    ).toThrow("O valor do desconto nao pode ser maior que o valor cotado.");
  });
});
