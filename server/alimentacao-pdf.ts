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
  const pages: string[] = [];

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
  const card = (label: string, value: unknown, x: number, width: number) =>
    drawRect(x, 688, width, 40, "1 1 1") +
    drawText(label, x + 7, 713, 6, true, "0.38 0.45 0.54") +
    drawText(value, x + 7, 696, 10, true, "0 0.10 0.20");

  const chartChunks = data.length
    ? Array.from({ length: Math.ceil(data.length / 12) }, (_, index) =>
        data.slice(index * 12, index * 12 + 12)
      )
    : [[]];
  const globalMax = Math.max(...data.map(item => Number(item[config.mode])), 1);
  chartChunks.forEach((chunk, pageIndex) => {
    let content = header(
      pageIndex ? `${config.titulo} - CONTINUACAO` : config.titulo
    );
    if (!pageIndex) {
      content += card(
        "TOTAL DE ALIMENTACOES",
        totalQuantity.toLocaleString("pt-BR"),
        50,
        150
      );
      content += card("VALOR TOTAL", money(totalValue), 210, 165);
      content += card(`${config.rotulo}S LISTADOS`, data.length, 385, 160);
    }
    const top = pageIndex ? 690 : 650;
    content += drawText(filterLineA, 50, top + 17, 6, false, "0.30 0.38 0.47");
    content += drawText(filterLineB, 50, top + 8, 6, false, "0.30 0.38 0.47");
    content += drawRect(50, top - 250, 495, 250, "1 1 1");
    content += drawText(
      "GRAFICO DO RELATORIO SELECIONADO",
      56,
      top - 16,
      8,
      true,
      "0 0.10 0.20"
    );
    if (!chunk.length)
      content += drawCenteredText(
        "SEM DADOS PARA O PERIODO SELECIONADO",
        top - 130,
        10,
        false,
        "0.38 0.45 0.54"
      );
    const plotX = 65,
      plotY = top - 210,
      plotWidth = 465,
      plotHeight = 160;
    const slot = plotWidth / Math.max(chunk.length, 1);
    chunk.forEach((item, index) => {
      const value = Number(item[config.mode]);
      const height = Math.max(1, (value / globalMax) * plotHeight);
      const x = plotX + index * slot + 4;
      const width = Math.max(8, slot - 8);
      content += drawRect(
        x,
        plotY,
        width,
        height,
        "0.88 0.61 0.00",
        "0.88 0.61 0.00"
      );
      content += drawText(
        config.mode === "total" ? money(value) : value.toLocaleString("pt-BR"),
        x,
        plotY + height + 5,
        5,
        true,
        "0 0.10 0.20"
      );
      content += drawText(
        String(item.nome).slice(0, 12),
        x,
        plotY - 12,
        5,
        false,
        "0.20 0.28 0.36"
      );
    });
    content += drawText(
      `PAGINA DO GRAFICO ${pageIndex + 1}/${chartChunks.length}`,
      50,
      top - 270,
      6,
      false,
      "0.38 0.45 0.54"
    );
    pages.push(content);
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
    pages.push(content);
  });

  return {
    filename: `relatorio-alimentacao-${type}-${new Date().toISOString().slice(0, 10)}.pdf`,
    buffer: createPdf(pages, timbrado, assinatura, logo),
  };
}
