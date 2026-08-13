import { listLicitacaoReport, type LicitacaoReportType } from "./db";
import {
  createPdf,
  dateBR,
  dateTimeBR,
  drawCenteredText,
  drawPageBackground,
  drawRect,
  drawRotatedText,
  drawText,
  loadJpeg,
  money,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  type PdfPage,
} from "./medicao-pdf";

const REPORTS: Record<LicitacaoReportType, { title: string; group: string; lastColumn: string; lastIsMoney: boolean }> = {
  status: { title: "LICITAÇÕES POR STATUS", group: "STATUS", lastColumn: "VALOR INICIAL", lastIsMoney: true },
  cidade: { title: "LICITAÇÕES POR CIDADE E ÓRGÃO", group: "CIDADE / ÓRGÃO", lastColumn: "VALOR INICIAL", lastIsMoney: true },
  vendedor: { title: "LICITAÇÕES POR VENDEDOR", group: "VENDEDOR", lastColumn: "VALOR INICIAL", lastIsMoney: true },
  adesoes_vendedor: { title: "ADESÕES POR VENDEDOR", group: "VENDEDOR", lastColumn: "QTD. ENTREGUE", lastIsMoney: false },
  entregas: { title: "SITUAÇÃO DAS ENTREGAS DE ADESÕES", group: "SITUAÇÃO", lastColumn: "QTD. PEDIDOS", lastIsMoney: false },
};

function decimal(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export async function buildLicitacaoPdf(
  type: LicitacaoReportType,
  filters: { inicio?: string; fim?: string },
) {
  const rows = await listLicitacaoReport(type, filters);
  const config = REPORTS[type];
  const timbrado = await loadJpeg("client/src/assets/papel-timbrado-minasfalto.jpeg");
  const assinatura = await loadJpeg("client/src/assets/assinatura-maxwell-relatorio.jpg");
  const logo = await loadJpeg("client/src/assets/minasfalto-logo.jpg");
  const period = `${filters.inicio ? dateBR(filters.inicio) : "INÍCIO"} A ${filters.fim ? dateBR(filters.fim) : "HOJE"}`;
  const pages: PdfPage[] = [];
  const landscapeWidth = PDF_PAGE_HEIGHT;
  const landscapeHeight = PDF_PAGE_WIDTH;
  const totalRecords = rows.reduce((sum, row) => sum + row.quantidade, 0);
  const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
  const maxValue = Math.max(...rows.map((row) => row.quantidade), 1);

  let chart = drawPageBackground(timbrado, landscapeWidth, landscapeHeight);
  chart += "q 72 0 0 72 38 505 cm /LOGO Do Q\n";
  chart += drawCenteredText("RELATÓRIO DE LICITAÇÕES", 550, 16, true, "0 0.10 0.20", landscapeWidth / 2);
  chart += drawCenteredText(config.title, 530, 9, true, "0.20 0.28 0.36", landscapeWidth / 2);
  chart += drawCenteredText(`PERÍODO ${period}`, 515, 7, false, "0.20 0.28 0.36", landscapeWidth / 2);
  chart += "0.95 0.65 0.10 RG 40 500 m 802 500 l S\n";
  const card = (label: string, value: string, x: number) =>
    drawRect(x, 452, 244, 36) + drawText(label, x + 7, 475, 6, true, "0.38 0.45 0.54") + drawText(value, x + 7, 460, 10, true, "0 0.10 0.20");
  chart += card("TOTAL DE REGISTROS", totalRecords.toLocaleString("pt-BR"), 40);
  chart += card("QUANTIDADE TOTAL", decimal(totalVolume), 299);
  chart += card("GRUPOS LISTADOS", rows.length.toLocaleString("pt-BR"), 558);
  chart += drawRect(40, 70, 762, 365);
  chart += drawText("GRÁFICO DO RELATÓRIO SELECIONADO", 48, 416, 8, true, "0 0.10 0.20");
  if (!rows.length) {
    chart += drawCenteredText("SEM DADOS PARA O PERÍODO SELECIONADO", 250, 10, false, "0.38 0.45 0.54", landscapeWidth / 2);
  } else {
    const plotX = 52;
    const plotY = 145;
    const plotWidth = 738;
    const plotHeight = 220;
    const slot = plotWidth / rows.length;
    const gap = Math.min(6, slot * 0.22);
    const fontSize = Math.max(3.2, Math.min(5.5, slot / 3.8));
    rows.forEach((row, index) => {
      const height = Math.max(1, (row.quantidade / maxValue) * plotHeight);
      const x = plotX + index * slot + gap / 2;
      chart += drawRect(x, plotY, Math.max(2, slot - gap), height, "0.88 0.61 0.00", "0.88 0.61 0.00");
      chart += drawText(row.quantidade.toLocaleString("pt-BR"), x, plotY + height + 4, fontSize, true, "0 0.10 0.20");
      chart += drawRotatedText(row.nome, x + 1, 82, 58, fontSize, false, "0.20 0.28 0.36");
    });
  }
  pages.push({ content: chart, width: landscapeWidth, height: landscapeHeight });

  const chunks = rows.length
    ? Array.from({ length: Math.ceil(rows.length / 24) }, (_, index) => rows.slice(index * 24, index * 24 + 24))
    : [[]];
  chunks.forEach((chunk, pageIndex) => {
    let content = drawPageBackground(timbrado);
    content += "q 62 0 0 62 50 752 cm /LOGO Do Q\n";
    content += drawCenteredText("RELATÓRIO DE LICITAÇÕES", 790, 15, true, "0 0.10 0.20");
    content += drawCenteredText(config.title, 770, 9, true, "0.20 0.28 0.36");
    content += drawCenteredText(`PERÍODO ${period}`, 755, 7, false, "0.20 0.28 0.36");
    content += "0.95 0.65 0.10 RG 50 740 m 545 740 l S\n";
    content += drawRect(50, 700, 495, 20, "0.86 0.90 0.94");
    content += drawText(config.group, 56, 707, 7, true, "0 0.10 0.20");
    content += drawText("REGISTROS", 350, 707, 7, true, "0 0.10 0.20");
    content += drawText("QUANTIDADE", 415, 707, 7, true, "0 0.10 0.20");
    content += drawText(config.lastColumn, 485, 707, 6, true, "0 0.10 0.20");
    let y = 680;
    chunk.forEach((row, index) => {
      content += drawRect(50, y, 495, 20, index % 2 ? "0.97 0.98 0.99" : "1 1 1", "0.86 0.90 0.94");
      content += drawText(row.nome.slice(0, 47), 56, y + 7, 6.5);
      content += drawText(row.quantidade.toLocaleString("pt-BR"), 350, y + 7, 7);
      content += drawText(decimal(row.volume), 415, y + 7, 7);
      content += drawText(config.lastIsMoney ? money(row.valor) : decimal(row.valor), 485, y + 7, 6.5);
      y -= 20;
    });
    content += drawText(`EMITIDO EM ${dateTimeBR(new Date())}`, 50, 180, 6, false, "0.38 0.45 0.54");
    const scale = Math.min(160 / assinatura.width, 52 / assinatura.height);
    const width = assinatura.width * scale;
    const height = assinatura.height * scale;
    content += `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${((PDF_PAGE_WIDTH - width) / 2).toFixed(2)} 146 cm /SIG Do Q\n0 0 0 RG 190 147 m 405 147 l S\n`;
    content += drawCenteredText("Maxwell Viana", 133, 8, false);
    content += drawCenteredText("Técnico de Planejamento", 119, 8, false);
    if (pageIndex > 0) content += drawText(`CONTINUAÇÃO ${pageIndex + 1}`, 470, 730, 6, true, "0.38 0.45 0.54");
    pages.push({ content });
  });

  return {
    filename: `relatorio-licitacoes-${type}-${new Date().toISOString().slice(0, 10)}.pdf`,
    buffer: createPdf(pages, timbrado, assinatura, logo),
  };
}
