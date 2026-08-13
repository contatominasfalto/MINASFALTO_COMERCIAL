import { describe, expect, it } from "vitest";
import { aggregateAlimentacaoPdfRows } from "./alimentacao-pdf";
import {
  createPdf,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  type PdfImage,
} from "./medicao-pdf";

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
      { nome: "2026-08", quantidade: 1, total: 25 },
      { nome: "2026-07", quantidade: 3, total: 60 },
    ]);
  });

  it("combina grafico paisagem e dados em formato vertical", () => {
    const image: PdfImage = { data: Buffer.alloc(0), width: 1, height: 1 };
    const pdf = createPdf(
      [
        {
          content: "",
          width: PDF_PAGE_HEIGHT,
          height: PDF_PAGE_WIDTH,
        },
        { content: "" },
      ],
      image,
      image,
      image
    ).toString("binary");

    expect(pdf).toContain(
      `/MediaBox [0 0 ${PDF_PAGE_HEIGHT} ${PDF_PAGE_WIDTH}]`
    );
    expect(pdf).toContain(
      `/MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}]`
    );
  });
});
