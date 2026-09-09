import * as alimentacao from "./alimentacao";
import type { Filtros } from "./alimentacao";
import {
  agruparCustosExtrasPorData,
  detalharCustosExtrasAlimentacao,
} from "@shared/alimentacao-report";
import {
  createPdf,
  dateBR,
  dateTimeBR,
  drawCenteredText,
  drawPhysicalSignatureBlock,
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

export type TipoRelatorioAlimentacao =
  | "funcionario"
  | "fornecedor"
  | "mensal"
  | "setor"
  | "tipo"
  | "custos_extras";

const configs = {
  funcionario: {
    titulo: "ALIMENTAÇÕES POR FUNCIONÁRIO",
    rotulo: "FUNCIONÁRIO",
    grupos: "FUNCIONÁRIOS",
    key: (r: any) => r.funcionario,
    mode: "quantidade",
  },
  fornecedor: {
    titulo: "CUSTO POR FORNECEDOR",
    rotulo: "FORNECEDOR",
    grupos: "FORNECEDORES",
    key: (r: any) => r.fornecedor,
    mode: "total",
  },
  mensal: {
    titulo: "CUSTO MENSAL COM ALIMENTAÇÃO",
    rotulo: "MÊS",
    grupos: "MESES",
    key: (r: any) => String(r.dataRefeicao).slice(0, 7),
    mode: "total",
  },
  setor: {
    titulo: "CUSTO POR SETOR",
    rotulo: "SETOR",
    grupos: "SETORES",
    key: (r: any) => r.setor,
    mode: "total",
  },
  tipo: {
    titulo: "CUSTO POR TIPO DE ALIMENTAÇÃO",
    rotulo: "TIPO",
    grupos: "TIPOS",
    key: (r: any) => r.tipo,
    mode: "total",
  },
  custos_extras: {
    titulo: "CUSTOS EXTRAS DOS GRUPOS",
    rotulo: "DATA",
    grupos: "GRUPOS COM CUSTO EXTRA",
    key: (r: any) => r.dataRefeicao,
    mode: "total",
  },
} as const;

export function aggregateAlimentacaoPdfRows(
  rows: any[],
  type: TipoRelatorioAlimentacao
) {
  if (type === "custos_extras") {
    return agruparCustosExtrasPorData(detalharCustosExtrasAlimentacao(rows));
  }
  const config = configs[type];
  const groups = new Map<
    string,
    { nome: string; quantidade: number; total: number }
  >();
  for (const row of rows) {
    const name = config.key(row) || "NÃO INFORMADO";
    const current = groups.get(name) || { nome: name, quantidade: 0, total: 0 };
    current.quantidade += Number(row.quantidade || 0);
    current.total += Number(row.valorTotal || 0);
    groups.set(name, current);
  }
  const grouped = Array.from(groups.values());
  return type === "mensal"
    ? grouped.sort((a, b) => b.nome.localeCompare(a.nome))
    : grouped.sort((a, b) => b[config.mode] - a[config.mode]);
}

export async function buildAlimentacaoPdf(
  filters: Filtros,
  type: TipoRelatorioAlimentacao
) {
  const [rows, masters] = await Promise.all([
    alimentacao.relatorio(filters),
    alimentacao.cadastros(),
  ]);
  const extraCosts = detalharCustosExtrasAlimentacao(rows);
  const data = aggregateAlimentacaoPdfRows(rows, type);
  const chartData =
    type === "mensal"
      ? [...data].sort((a, b) => a.nome.localeCompare(b.nome))
      : data;
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
  const filterLineA = `FORNECEDOR: ${supplier} | FUNCIONÁRIO: ${employee}`;
  const filterLineB = `SETOR: ${filters.setor || "TODOS"} | TIPO: ${filters.tipo || "TODOS"}`;
  const timbrado = await loadJpeg(
    "client/src/assets/papel-timbrado-minasfalto.jpeg"
  );
  const logo = await loadJpeg("client/src/assets/minasfalto-logo.jpg");
  const pages: PdfPage[] = [];

  const header = (subtitle: string = config.titulo) => {
    let content = drawPageBackground(timbrado);
    content += "q 92 0 0 92 42 750 cm /LOGO Do Q\n";
    content += drawCenteredText(
      "RELATÓRIO DE ALIMENTAÇÃO",
      790,
      17,
      true,
      "0 0.10 0.20"
    );
    content += drawCenteredText(subtitle, 770, 10, true, "0.20 0.28 0.36");
    content += drawCenteredText(
      `PERÍODO ${period}`,
      754,
      8,
      false,
      "0.20 0.28 0.36"
    );
    content += "0.95 0.65 0.10 RG 50 740 m 545 740 l S\n";
    return content;
  };
  const globalMax = Math.max(
    ...chartData.map(item => Number(item[config.mode])),
    1
  );
  const landscapeWidth = PDF_PAGE_HEIGHT;
  const landscapeHeight = PDF_PAGE_WIDTH;
  let chartContent = drawPageBackground(
    timbrado,
    landscapeWidth,
    landscapeHeight
  );
  chartContent += "q 72 0 0 72 38 505 cm /LOGO Do Q\n";
  chartContent += drawCenteredText(
    "RELATÓRIO DE ALIMENTAÇÃO",
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
    `PERÍODO ${period}`,
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
    "TOTAL DE ALIMENTAÇÕES",
    totalQuantity.toLocaleString("pt-BR"),
    40
  );
  chartContent += landscapeCard("VALOR TOTAL", money(totalValue), 299);
  chartContent += landscapeCard(`${config.grupos} LISTADOS`, data.length, 558);
  chartContent += drawText(filterLineA, 40, 438, 6, false, "0.30 0.38 0.47");
  chartContent += drawText(filterLineB, 40, 429, 6, false, "0.30 0.38 0.47");
  chartContent += drawRect(40, 70, 762, 345, "1 1 1");
  chartContent += drawText(
    "GRÁFICO DO RELATÓRIO SELECIONADO",
    48,
    398,
    8,
    true,
    "0 0.10 0.20"
  );
  if (!chartData.length) {
    chartContent += drawCenteredText(
      "SEM DADOS PARA O PERÍODO SELECIONADO",
      250,
      10,
      false,
      "0.38 0.45 0.54",
      landscapeWidth / 2
    );
  } else {
    const plotX = 52;
    const plotY = 145;
    const plotWidth = 738;
    const plotHeight = 205;
    const slot = plotWidth / chartData.length;
    const gap = Math.min(5, slot * 0.22);
    const labelSize = Math.max(3.2, Math.min(5.5, slot / 3.8));
    chartData.forEach((item, index) => {
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
      chartContent += drawRotatedText(
        String(item.nome),
        x + 1,
        82,
        58,
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

  if (type === "custos_extras") {
    const rowsPerPage = 6;
    const detailChunks = extraCosts.length
      ? Array.from(
          { length: Math.ceil(extraCosts.length / rowsPerPage) },
          (_, index) =>
            extraCosts.slice(
              index * rowsPerPage,
              index * rowsPerPage + rowsPerPage
            )
        )
      : [[]];
    detailChunks.forEach((chunk, pageIndex) => {
      let content = header("DETALHAMENTO - CUSTOS EXTRAS DOS GRUPOS");
      if (!pageIndex) {
        content += drawText(filterLineA, 50, 730, 6, false, "0.30 0.38 0.47");
        content += drawText(filterLineB, 50, 721, 6, false, "0.30 0.38 0.47");
      }
      let y = 640;
      if (!chunk.length) {
        content += drawCenteredText(
          "SEM CUSTOS EXTRAS PARA OS FILTROS SELECIONADOS",
          620,
          9,
          false,
          "0.38 0.45 0.54"
        );
      }
      chunk.forEach((item, index) => {
        content += drawRect(
          50,
          y,
          495,
          78,
          index % 2 ? "0.97 0.98 0.99" : "1 1 1",
          "0.78 0.84 0.90"
        );
        content += drawText(
          `${dateBR(item.dataRefeicao)} | FORNECEDOR: ${item.fornecedor}`.slice(
            0,
            76
          ),
          57,
          y + 64,
          7,
          true,
          "0 0.10 0.20"
        );
        content += drawText(
          money(item.valorExtra),
          470,
          y + 64,
          8,
          true,
          "0.55 0.30 0"
        );
        content += drawText(
          `NOTA: ${item.numeroNota} | TIPO: ${item.tipo} | GRUPO: ${item.id} | REFEIÇÕES: ${item.quantidadeRefeicoes}`.slice(
            0,
            92
          ),
          57,
          y + 50,
          6.5
        );
        content += drawText(
          `FUNCIONÁRIOS: ${item.funcionarios.join(", ") || "Não informado"}`.slice(
            0,
            105
          ),
          57,
          y + 37,
          6
        );
        content += drawText(
          `SETORES: ${item.setores.join(", ") || "Não informado"}`.slice(
            0,
            105
          ),
          57,
          y + 25,
          6
        );
        content += drawText(
          `OBSERVAÇÃO: ${item.observacao}`.slice(0, 112),
          57,
          y + 12,
          6
        );
        y -= 84;
      });
      content += drawText(
        `TOTAL DE GRUPOS: ${extraCosts.length} | TOTAL DE CUSTOS EXTRAS: ${money(totalValue)}`,
        50,
        118,
        7,
        true,
        "0 0.10 0.20"
      );
      content += drawText(
        `EMITIDO EM ${dateTimeBR(new Date())}`,
        50,
        102,
        6,
        false,
        "0.38 0.45 0.54"
      );
      content += drawPhysicalSignatureBlock(78);
      pages.push({ content });
    });
  } else {
    const rowsPerPage = 24;
    const tableChunks = data.length
      ? Array.from(
          { length: Math.ceil(data.length / rowsPerPage) },
          (_, index) =>
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
        180,
        6,
        false,
        "0.38 0.45 0.54"
      );
      content += drawPhysicalSignatureBlock(147);
      pages.push({ content });
    });
  }

  return {
    filename: `relatorio-alimentacao-${type}-${new Date().toISOString().slice(0, 10)}.pdf`,
    buffer: createPdf(pages, timbrado, logo),
  };
}
