import { obterOrcamento } from "./compras";
import {
  createPdf,
  dateBR,
  dateTimeBR,
  drawCenteredText,
  drawPageBackground,
  drawRect,
  drawText,
  loadJpeg,
  money,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  wrap,
} from "./medicao-pdf";

const STATUS: Record<string, string> = {
  EM_COTACAO: "EM COTAÇÃO",
  AGUARDANDO_DEFINICAO: "AGUARDANDO DEFINIÇÃO",
  COMPRADO: "COMPRADO",
  CANCELADO: "CANCELADO",
};

export async function buildComprasEspelhoPdf(orcamentoId: number) {
  const detalhe = await obterOrcamento(orcamentoId);
  const orcamento = detalhe.orcamento as any;
  const itens = detalhe.itens as any[];
  const ofertas = detalhe.ofertas as any[];
  const timbrado = await loadJpeg(
    "client/src/assets/papel-timbrado-minasfalto.jpeg"
  );
  const assinatura = await loadJpeg(
    "client/src/assets/assinatura-maxwell-relatorio.jpg"
  );
  const logo = await loadJpeg("client/src/assets/minasfalto-logo.jpg");
  const pages: string[] = [];
  let content = "";
  let y = 0;

  const newPage = (continuacao = false) => {
    if (content) pages.push(content);
    content = drawPageBackground(timbrado);
    content += "q 76 0 0 76 42 756 cm /LOGO Do Q\n";
    content += drawCenteredText(
      "ESPELHO DA COTAÇÃO",
      792,
      17,
      true,
      "0 0.10 0.20"
    );
    content += drawCenteredText(
      `${orcamento.numero}${continuacao ? " - CONTINUAÇÃO" : ""}`,
      772,
      9,
      true,
      "0.20 0.28 0.36"
    );
    content += "0.95 0.65 0.10 RG 50 750 m 545 750 l S\n";
    y = 724;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 125) newPage(true);
  };

  const field = (
    label: string,
    value: unknown,
    x: number,
    width: number,
    height = 38
  ) => {
    content += drawRect(x, y - height, width, height, "1 1 1");
    content += drawText(label, x + 7, y - 13, 6, true, "0.38 0.45 0.54");
    wrap(value || "—", Math.max(12, Math.floor(width / 5.2)), 2).forEach(
      (line, index) => {
        content += drawText(
          line,
          x + 7,
          y - 27 - index * 8,
          8,
          true,
          "0 0.10 0.20"
        );
      }
    );
  };

  newPage();
  field("NÚMERO", orcamento.numero, 50, 155);
  field("DATA", dateBR(orcamento.data_orcamento), 205, 120);
  field("STATUS", STATUS[orcamento.status] || orcamento.status, 325, 220);
  y -= 44;
  field("OBJETO DA COTAÇÃO", orcamento.titulo, 50, 310);
  field(
    "VEÍCULO/EQUIPAMENTO",
    orcamento.veiculo_equipamento_id
      ? orcamento.veiculoEquipamento || orcamento.veiculo_equipamento || "CADASTRADO"
      : "NÃO DEFINIDO",
    360,
    185
  );
  y -= 44;
  field(
    "FORNECEDOR DA NOTA",
    orcamento.fornecedorEscolhido || orcamento.fornecedor_escolhido || "NÃO DEFINIDO",
    50,
    310
  );
  field("PRAZO PADRÃO", orcamento.prazo_entrega_padrao || "—", 360, 185);
  y -= 50;
  field("VALOR COTADO", money(orcamento.valor_cotado), 50, 165);
  field("VALOR DO DESCONTO", money(orcamento.valor_negociado), 215, 165);
  field("VALOR FINAL", money(orcamento.valor_pago), 380, 165);
  y -= 58;

  content += drawText("ITENS E PROPOSTAS DE MARCAS DO PRODUTO", 50, y, 10, true, "0 0.10 0.20");
  y -= 15;

  itens.forEach((item, itemIndex) => {
    const itemOffers = ofertas.filter(oferta => Number(oferta.itemId) === Number(item.id));
    ensureSpace(58 + Math.max(1, itemOffers.length) * 23);
    content += drawRect(50, y - 28, 495, 28, "0.86 0.92 0.96");
    content += drawText(`ITEM ${itemIndex + 1} - ${item.descricao}`, 57, y - 11, 8, true, "0 0.10 0.20");
    content += drawText(
      `QUANTIDADE: ${Number(item.quantidade).toLocaleString("pt-BR")} ${item.unidade || ""}`,
      380,
      y - 11,
      7,
      true,
      "0.20 0.28 0.36"
    );
    y -= 44;
    content += drawText("INCLUIR", 55, y + 5, 6, true);
    content += drawText("MARCA DO PRODUTO", 105, y + 5, 6, true);
    content += drawText("VALOR UNIT.", 330, y + 5, 6, true);
    content += drawText("VALOR TOTAL", 405, y + 5, 6, true);
    content += drawText("PRAZO", 485, y + 5, 6, true);
    y -= 10;
    const rows = itemOffers.length ? itemOffers : [null];
    rows.forEach((oferta, rowIndex) => {
      ensureSpace(23);
      content += drawRect(
        50,
        y - 18,
        495,
        21,
        rowIndex % 2 ? "0.97 0.98 0.99" : "1 1 1"
      );
      if (!oferta) {
        content += drawText("NENHUMA PROPOSTA CADASTRADA", 57, y - 10, 7);
      } else {
        const quantidade = Number(item.quantidade || 0);
        const unitario = Number(oferta.valorUnitario || 0);
        content += drawText(oferta.incluidoCalculo ? "SIM" : "NÃO", 57, y - 10, 7, true,
          oferta.incluidoCalculo ? "0.08 0.42 0.18" : "0.65 0.08 0.08");
        content += drawText(String(oferta.fornecedor).slice(0, 42), 105, y - 10, 7);
        content += drawText(money(unitario), 330, y - 10, 7);
        content += drawText(money(unitario * quantidade), 405, y - 10, 7);
        content += drawText(String(oferta.prazoEntrega || "—").slice(0, 15), 485, y - 10, 7);
      }
      y -= 23;
    });
    y -= 10;
  });

  if (orcamento.observacoes) {
    ensureSpace(62);
    content += drawRect(50, y - 50, 495, 50, "1 1 1");
    content += drawText("OBSERVAÇÕES", 57, y - 13, 6, true, "0.38 0.45 0.54");
    wrap(orcamento.observacoes, 105, 3).forEach((line, index) => {
      content += drawText(line, 57, y - 27 - index * 9, 7);
    });
    y -= 58;
  }
  content += drawText(
    `EMITIDO EM ${dateTimeBR(new Date())} | FORMATO A4 VERTICAL (${PDF_PAGE_WIDTH.toFixed(0)} X ${PDF_PAGE_HEIGHT.toFixed(0)})`,
    50,
    105,
    6,
    false,
    "0.38 0.45 0.54"
  );
  pages.push(content);

  return {
    filename: `espelho-cotacao-${String(orcamento.numero).toLowerCase()}.pdf`,
    buffer: createPdf(pages, timbrado, assinatura, logo),
  };
}
