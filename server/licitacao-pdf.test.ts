import { beforeEach, describe, expect, it, vi } from "vitest";

const { listLicitacaoReport, listLicitacaoAdesaoReportDetails } = vi.hoisted(() => ({
  listLicitacaoReport: vi.fn(),
  listLicitacaoAdesaoReportDetails: vi.fn(),
}));

vi.mock("./db", () => ({ listLicitacaoReport, listLicitacaoAdesaoReportDetails }));

import { buildLicitacaoPdf } from "./licitacao-pdf";
import { PDF_PAGE_HEIGHT, PDF_PAGE_WIDTH } from "./medicao-pdf";

describe("PDF de relatórios de licitações", () => {
  beforeEach(() => {
    listLicitacaoReport.mockResolvedValue([
      { nome: "VENDEDOR A", quantidade: 4, volume: 1200, valor: 700 },
      { nome: "VENDEDOR B", quantidade: 2, volume: 500, valor: 100 },
    ]);
    listLicitacaoAdesaoReportDetails.mockResolvedValue([
      {
        vendedor: "VENDEDOR A",
        licitacao: "PREFEITURA - CIDADE",
        orgaoAderente: "ÓRGÃO ADERENTE",
        dataAdesao: "2026-08-13",
        quantidade: 500,
        entregue: "NÃO",
        dataEntrega: "",
        pedidos: 2,
        quantidadeAtendida: 125,
        saldo: 375,
      },
    ]);
  });

  it("gera gráfico paisagem e tabela vertical para adesões por vendedor", async () => {
    const result = await buildLicitacaoPdf("adesoes_vendedor", {
      inicio: "2026-01-01",
      fim: "2026-12-31",
    });
    const pdf = result.buffer.toString("binary");

    expect(listLicitacaoReport).toHaveBeenCalledWith("adesoes_vendedor", {
      inicio: "2026-01-01",
      fim: "2026-12-31",
    });
    expect(listLicitacaoAdesaoReportDetails).toHaveBeenCalledWith({
      inicio: "2026-01-01",
      fim: "2026-12-31",
    });
    expect(result.filename).toContain("relatorio-licitacoes-adesoes_vendedor");
    expect(pdf).toContain(`/MediaBox [0 0 ${PDF_PAGE_HEIGHT} ${PDF_PAGE_WIDTH}]`);
    expect(pdf).toContain(`/MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}]`);
  });
});
