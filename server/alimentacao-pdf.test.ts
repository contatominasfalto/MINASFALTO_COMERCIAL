import { describe, expect, it } from "vitest";
import { aggregateAlimentacaoPdfRows } from "./alimentacao-pdf";

const rows = [
  {
    funcionario: "ANA",
    fornecedor: "JOELMA",
    setor: "USINA",
    tipo: "almoco",
    dataRefeicao: "2026-07-01",
    quantidade: 2,
    valorTotal: 40,
  },
  {
    funcionario: "ANA",
    fornecedor: "JOELMA",
    setor: "USINA",
    tipo: "almoco",
    dataRefeicao: "2026-07-02",
    quantidade: 1,
    valorTotal: 20,
  },
  {
    funcionario: "BIA",
    fornecedor: "ROCHA",
    setor: "OBRAS",
    tipo: "jantar",
    dataRefeicao: "2026-08-01",
    quantidade: 1,
    valorTotal: 25,
  },
];

describe("PDF do relatorio de alimentacao", () => {
  it("agrupa por funcionario", () => {
    expect(aggregateAlimentacaoPdfRows(rows, "funcionario")).toEqual([
      { nome: "ANA", quantidade: 3, total: 60 },
      { nome: "BIA", quantidade: 1, total: 25 },
    ]);
  });

  it("agrupa por mes", () => {
    expect(aggregateAlimentacaoPdfRows(rows, "mensal")).toEqual([
      { nome: "2026-07", quantidade: 3, total: 60 },
      { nome: "2026-08", quantidade: 1, total: 25 },
    ]);
  });
});
