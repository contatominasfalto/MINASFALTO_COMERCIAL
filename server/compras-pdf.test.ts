import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDF_PAGE_HEIGHT, PDF_PAGE_WIDTH } from "./medicao-pdf";

const { obterOrcamento } = vi.hoisted(() => ({ obterOrcamento: vi.fn() }));
vi.mock("./compras", () => ({ obterOrcamento }));

describe("Espelho PDF da cotação", () => {
  beforeEach(() => {
    obterOrcamento.mockResolvedValue({
      orcamento: {
        numero: "COT-2026-9",
        data_orcamento: "2026-08-25",
        status: "EM_COTACAO",
        titulo: "COMPRA DE DIESEL",
        fornecedorEscolhido: "VR DIESEL",
        veiculoEquipamento: "A-NÃO TEM",
        prazo_entrega_padrao: "15 DIAS",
        valor_cotado: 30927,
        valor_negociado: 927,
        valor_pago: 30000,
        observacoes: "TESTE DO ESPELHO",
      },
      itens: [
        {
          id: 1,
          descricao: "DIESEL S10",
          quantidade: 5070,
          unidade: "UN",
        },
      ],
      ofertas: [
        {
          itemId: 1,
          fornecedor: "FIRESTONE H/T",
          valorUnitario: 6.1,
          prazoEntrega: "15 DIAS",
          incluidoCalculo: true,
        },
        {
          itemId: 1,
          fornecedor: "MÃO DE OBRA",
          valorUnitario: 6.3,
          prazoEntrega: "15 DIAS",
          incluidoCalculo: false,
        },
      ],
    });
  });

  it("gera um PDF A4 vertical fiel aos itens e propostas", async () => {
    const { buildComprasEspelhoPdf } = await import("./compras-pdf");
    const result = await buildComprasEspelhoPdf(9);
    const pdf = result.buffer.toString("binary");

    expect(result.filename).toBe("espelho-cotacao-cot-2026-9.pdf");
    expect(pdf.startsWith("%PDF-1.3")).toBe(true);
    expect(pdf).toContain(`/MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}]`);
    expect(pdf).not.toContain(`/MediaBox [0 0 ${PDF_PAGE_HEIGHT} ${PDF_PAGE_WIDTH}]`);
    expect(pdf).toContain("ESPELHO DA COTA");
    expect(pdf).toContain("FIRESTONE H/T");
    expect(pdf).toContain("MÃO DE OBRA");
  });
});
