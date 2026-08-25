import { beforeEach, describe, expect, it, vi } from "vitest";

const { listLicitacaoReport, listLicitacaoAdesaoReportDetails, listLicitacaoReportDetails } = vi.hoisted(() => ({
  listLicitacaoReport: vi.fn(),
  listLicitacaoAdesaoReportDetails: vi.fn(),
  listLicitacaoReportDetails: vi.fn(),
}));

vi.mock("./db", () => ({ listLicitacaoReport, listLicitacaoAdesaoReportDetails, listLicitacaoReportDetails }));

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
    listLicitacaoReportDetails.mockResolvedValue([
      {
        id: 1, data: "2026-08-13", horaInicioDisputa: "09:00", orgao: "PREFEITURA",
        cidade: "CIDADE", status: "ADJUDICADO", vendedor: "VENDEDOR A", item: "ÚNICO",
        tipo: "SACO DE 25KG", qtdeSc: 500, valorInicialContrato: 12000,
        totalAdesoes: 2, quantidadeAderida: 250,
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
    expect(pdf).not.toContain("/SIG");
    expect(pdf).not.toContain("MAXWELL");
    expect(pdf).toContain("MARCO AURELIO BARRETO MODESTO");
  });

  it("inclui detalhamento individual nos relatórios de status, cidade e vendedor", async () => {
    for (const type of ["status", "cidade", "vendedor"] as const) {
      const result = await buildLicitacaoPdf(type, {});
      expect(result.buffer.toString("binary")).toContain(`/MediaBox [0 0 ${PDF_PAGE_HEIGHT} ${PDF_PAGE_WIDTH}]`);
    }
    expect(listLicitacaoReportDetails).toHaveBeenCalledTimes(3);
  });

  it("inclui os dados de cada adesão no relatório de entregas", async () => {
    const result = await buildLicitacaoPdf("entregas", {});
    expect(listLicitacaoAdesaoReportDetails).toHaveBeenCalledWith({});
    expect(result.buffer.toString("binary")).toContain(`/MediaBox [0 0 ${PDF_PAGE_HEIGHT} ${PDF_PAGE_WIDTH}]`);
  });
});
