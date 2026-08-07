import * as alimentacao from "./alimentacao";
import type { Filtros } from "./alimentacao";
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
  type PdfPage,
} from "./medicao-pdf";

export type TipoRelatorioAlimentacao =
  | "funcionario"
  | "fornecedor"
  | "mensal"
  | "setor"
  | "tipo";

const configs = {
  funcionario: {
    titulo: "ALIMENTACOES POR FUNCIONARIO",
    rotulo: "FUNCIONARIO",
    key: (r: any) => r.funcionario,
    mode: "quantidade",
  },
  fornecedor: {
    titulo: "CUSTO POR FORNECEDOR",
    rotulo: "FORNECEDOR",
    key: (r: any) => r.fornecedor,
    mode: "total",
  },
  mensal: {
    titulo: "CUSTO MENSAL COM ALIMENTACAO",
    rotulo: "MES",
    key: (r: any) => String(r.dataRefeicao).slice(0, 7),
    mode: "total",
  },
  setor: {
    titulo: "CUSTO POR SETOR",
    rotulo: "SETOR",
    key: (r: any) => r.setor,
    mode: "total",
  },
  tipo: {
    titulo: "CUSTO POR TIPO DE ALIMENTACAO",
    rotulo: "TIPO",
    key: (r: any) => r.tipo,
    mode: "total",
  },
} as const;

export function aggregateAlimentacaoPdfRows(
  rows: any[],
  type: TipoRelatorioAlimentacao
) {
  const config = configs[type];
  const groups = new Map<
    string,
    { nome: string; quantidade: number; total: number }
  >();
  for (const row of rows) {
    const name = config.key(row) || "NAO INFORMADO";
    const current = groups.get(name) || { nome: name, quantidade: 0, total: 0 };
    current.quantidade += Number(row.quantidade || 0);
    current.total += Number(row.valorTotal || 0);
    groups.set(name, current);
  }
  return Array.from(groups.values()).sort(
    (a, b) => b[config.mode] - a[config.mode]
  );
}

export async function buildAlimentacaoPdf(
  filters: Filtros,
  type: TipoRelatorioAlimentacao
) {
  const [rows, masters] = await Promise.all([
    alimentacao.relatorio(filters),
    alimentacao.cadastros(),
  ]);
  const data = aggregateAlimentacaoPdfRows(rows, type);
  const config = configs[type];
  const totalQuantity = data.reduce((sum, item) => sum + item.quantidade, 0);
  const totalValue = data.reduce((sum, item) => sum + item.total, 0);
  const supplier =
    (masters.fornecedores as any[]).find(
      item => item.id === filters.fornecedorId
    )?.nome || "TODOS";
  const employee =
    (masters.funcionarios as any[]).find(
      item => item.id === filters.funcionarioId
    )?.nome || "TODOS";
  const period = `${filters.inicio ? dateBR(filters.inicio) : "INICIO"} A ${filters.fim ? dateBR(filters.fim) : "HOJE"}`;
  const filterLineA = `FORNECEDOR: ${supplier} | FUNCIONARIO: ${employee}`;
  const filterLineB = `SETOR: ${filters.setor || "TODOS"} | TIPO: ${filters.tipo || "TODOS"}`;
  const timbrado = await loadJpeg(
    "client/src/assets/papel-timbrado-minasfalto.jpeg"
  );
  const assinatura = await loadJpeg("client/src/assets/assinatura-diretor.jpg");
  const logo = await loadJpeg("client/src/assets/minasfalto-logo.jpg");
  const pages: PdfPage[] = [];

  const header = (subtitle: string = config.titulo) => {
    let content = drawPageBackground(timbrado);
    content += "q 92 0 0 92 42 750 cm /LOGO Do Q\n";
    content += drawCenteredText(
      "RELATORIO DE ALIMENTACAO",
      790,
      17,
      true,
      "0 0.10 0.20"
    );
    content += drawCenteredText(subtitle, 770, 10, true, "0.20 0.28 0.36");
    content += drawCenteredText(
      `PERIODO ${period}`,
      754,
      8,
      false,
      "0.20 0.28 0.36"
    );
    content += "0.95 0.65 0.10 RG 50 740 m 545 740 l S\n";
    return content;
  };
  const globalMax = Math.max(...data.map(item => Number(item[config.mode])), 1);
  const landscapeWidth = PDF_PAGE_HEIGHT;
  const landscapeHeight = PDF_PAGE_WIDTH;
  let chartContent = drawPageBackground(
    timbrado,
    landscapeWidth,
    landscapeHeight
  );
  chartContent += "q 72 0 0 72 38 505 cm /LOGO Do Q\n";
  chartContent += drawCenteredText(
    "RELATORIO DE ALIMENTACAO",
    550,
    16,
    true,
    "0 0.10 0.20",
    landscapeWidth / 2
  );
  chartContent += drawCenteredText(
    config.titulo,
    530,
    9,
    true,
    "0.20 0.28 0.36",
    landscapeWidth / 2
  );
  chartContent += drawCenteredText(
    `PERIODO ${period}`,
    515,
    7,
    false,
    "0.20 0.28 0.36",
    landscapeWidth / 2
  );
  chartContent += "0.95 0.65 0.10 RG 40 500 m 802 500 l S\n";
  const landscapeCard = (label: string, value: unknown, x: number) =>
    drawRect(x, 452, 244, 36, "1 1 1") +
    drawText(label, x + 7, 475, 6, true, "0.38 0.45 0.54") +
    drawText(value, x + 7, 460, 10, true, "0 0.10 0.20");
  chartContent += landscapeCard(
    "TOTAL DE ALIMENTACOES",
    totalQuantity.toLocaleString("pt-BR"),
    40
  );
  chartContent += landscapeCard("VALOR TOTAL", money(totalValue), 299);
  chartContent += landscapeCard(`${config.rotulo}S LISTADOS`, data.length, 558);
  chartContent += drawText(filterLineA, 40, 438, 6, false, "0.30 0.38 0.47");
  chartContent += drawText(filterLineB, 40, 429, 6, false, "0.30 0.38 0.47");
  chartContent += drawRect(40, 70, 762, 345, "1 1 1");
  chartContent += drawText(
    "GRAFICO DO RELATORIO SELECIONADO",
    48,
    398,
    8,
    true,
    "0 0.10 0.20"
  );
  if (!data.length) {
    chartContent += drawCenteredText(
      "SEM DADOS PARA O PERIODO SELECIONADO",
      250,
      10,
      false,
      "0.38 0.45 0.54",
      landscapeWidth / 2
    );
  } else {
    const plotX = 52;
    const plotY = 105;
    const plotWidth = 738;
    const plotHeight = 245;
    const slot = plotWidth / data.length;
    const gap = Math.min(5, slot * 0.22);
    const labelSize = Math.max(2.8, Math.min(5, slot / 4.2));
    const labelLength = Math.max(4, Math.floor(slot / (labelSize * 0.53)));
    data.forEach((item, index) => {
      const value = Number(item[config.mode]);
      const barHeight = Math.max(1, (value / globalMax) * plotHeight);
      const x = plotX + index * slot + gap / 2;
      const width = Math.max(2, slot - gap);
      chartContent += drawRect(
        x,
        plotY,
        width,
        barHeight,
        "0.88 0.61 0.00",
        "0.88 0.61 0.00"
      );
      chartContent += drawText(
        config.mode === "total" ? money(value) : value.toLocaleString("pt-BR"),
        x,
        plotY + barHeight + 4,
        labelSize,
        true,
        "0 0.10 0.20"
      );
      chartContent += drawText(
        String(item.nome).slice(0, labelLength),
        x,
        plotY - 12,
        labelSize,
        false,
        "0.20 0.28 0.36"
      );
    });
  }
  pages.push({
    content: chartContent,
    width: landscapeWidth,
    height: landscapeHeight,
  });

  const rowsPerPage = 24;
  const tableChunks = data.length
    ? Array.from({ length: Math.ceil(data.length / rowsPerPage) }, (_, index) =>
        data.slice(index * rowsPerPage, index * rowsPerPage + rowsPerPage)
      )
    : [[]];
  tableChunks.forEach((chunk, pageIndex) => {
    let content = header(`DADOS - ${config.titulo}`);
    content += drawRect(50, 700, 495, 20, "0.86 0.90 0.94");
    content += drawText(config.rotulo, 56, 707, 7, true, "0 0.10 0.20");
    content += drawText("QTD.", 392, 707, 7, true, "0 0.10 0.20");
    content += drawText("TOTAL", 465, 707, 7, true, "0 0.10 0.20");
    let y = 680;
    chunk.forEach((item, index) => {
      content += drawRect(
        50,
        y,
        495,
        20,
        index % 2 ? "0.97 0.98 0.99" : "1 1 1",
        "0.86 0.90 0.94"
      );
      content += drawText(String(item.nome).slice(0, 58), 56, y + 7, 7);
      content += drawText(
        item.quantidade.toLocaleString("pt-BR"),
        392,
        y + 7,
        7
      );
      content += drawText(money(item.total), 465, y + 7, 7);
      y -= 20;
    });
    if (!pageIndex) {
      content += drawText(filterLineA, 50, 730, 6, false, "0.30 0.38 0.47");
      content += drawText(filterLineB, 50, 721, 6, false, "0.30 0.38 0.47");
    }
    content += drawText(
      `EMITIDO EM ${dateTimeBR(new Date())}`,
      50,
      165,
      6,
      false,
      "0.38 0.45 0.54"
    );
    content += `q 190 0 0 25 203 108 cm /SIG Do Q\n0 0 0 RG 190 100 m 405 100 l S\n`;
    content += drawCenteredText(
      "MINASFALTO INDUSTRIA E COMERCIO LTDA",
      85,
      8,
      false,
      "0 0 0"
    );
    content += drawCenteredText(
      "Marco Aurelio Barreto Modesto",
      71,
      8,
      false,
      "0 0 0"
    );
    pages.push({ content });
  });

  return {
    filename: `relatorio-alimentacao-${type}-${new Date().toISOString().slice(0, 10)}.pdf`,
    buffer: createPdf(pages, timbrado, assinatura, logo),
  };
}
