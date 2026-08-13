import { beforeEach, describe, expect, it, vi } from "vitest";

const { listLicitacaoReport } = vi.hoisted(() => ({
  listLicitacaoReport: vi.fn(),
}));

vi.mock("./db", () => ({ listLicitacaoReport }));

import { buildLicitacaoPdf } from "./licitacao-pdf";
import { PDF_PAGE_HEIGHT, PDF_PAGE_WIDTH } from "./medicao-pdf";

describe("PDF de relatórios de licitações", () => {
  beforeEach(() => {
    listLicitacaoReport.mockResolvedValue([
      { nome: "VENDEDOR A", quantidade: 4, volume: 1200, valor: 700 },
      { nome: "VENDEDOR B", quantidade: 2, volume: 500, valor: 100 },
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
    expect(result.filename).toContain("relatorio-licitacoes-adesoes_vendedor");
    expect(pdf).toContain(`/MediaBox [0 0 ${PDF_PAGE_HEIGHT} ${PDF_PAGE_WIDTH}]`);
    expect(pdf).toContain(`/MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}]`);
  });
});
