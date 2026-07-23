import type { Express, Request, Response } from "express";
import { readFile } from "fs/promises";
import path from "path";
import * as db from "./db";
import { getAppBasePath } from "./_core/basePath";

type PdfImage = {
  data: Buffer;
  width: number;
  height: number;
};

const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);

const dateBR = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString("pt-BR");
};

const dateTimeBR = (value: Date) =>
  value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const pdfText = (value: unknown) => String(value ?? "")
  .replace(/\\/g, "\\\\")
  .replace(/\(/g, "\\(")
  .replace(/\)/g, "\\)")
  .replace(/[\r\n]+/g, " ");

function readJpegSize(data: Buffer) {
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) break;
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { width: 1, height: 1 };
}

async function loadJpeg(relativePath: string): Promise<PdfImage> {
  const data = await readFile(path.resolve(process.cwd(), relativePath));
  return { data, ...readJpegSize(data) };
}

function wrap(text: unknown, maxChars: number, maxLines = 2) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return (lines.length ? lines : [""]).slice(0, maxLines);
}

function createPdf(pages: string[], timbrado: PdfImage, assinatura: PdfImage) {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let position = 0;
  const write = (content: string | Buffer) => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "binary");
    chunks.push(buffer);
    position += buffer.length;
  };
  const obj = (id: number, content: string | Buffer) => {
    offsets[id] = position;
    write(`${id} 0 obj\n`);
    write(content);
    write("\nendobj\n");
  };

  const pageIds = pages.map((_, index) => 5 + index * 2);
  const maxObject = 4 + pages.length * 2;
  write("%PDF-1.3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  obj(3, `<< /Type /XObject /Subtype /Image /Width ${timbrado.width} /Height ${timbrado.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${timbrado.data.length} >>\nstream\n${timbrado.data.toString("binary")}\nendstream`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${assinatura.width} /Height ${assinatura.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${assinatura.data.length} >>\nstream\n${assinatura.data.toString("binary")}\nendstream`);

  pages.forEach((content, index) => {
    const contentId = 6 + index * 2;
    const pageId = 5 + index * 2;
    const contentBytes = Buffer.from(content, "binary");
    obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> /XObject << /BG 3 0 R /SIG 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    obj(contentId, `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`);
  });

  const xref = position;
  write(`xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= maxObject; id += 1) {
    write(`${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(chunks);
}

function drawText(text: unknown, x: number, y: number, size = 9, bold = false, color = "0 0 0") {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(text)}) Tj ET\n`;
}

function drawRect(x: number, y: number, w: number, h: number, fill = "1 1 1", stroke = "0.65 0.72 0.80") {
  return `${fill} rg ${stroke} RG ${x} ${y} ${w} ${h} re B\n`;
}

async function buildMedicaoPdf(pedidoObraIdOrPedidoNum: number) {
  const pedido = await db.getPedidoObraById(pedidoObraIdOrPedidoNum)
    ?? await db.getPedidoObraByNumber(String(pedidoObraIdOrPedidoNum));
  if (!pedido) throw new Error(`Pedido nao encontrado: ${pedidoObraIdOrPedidoNum}`);

  const pedidoObraId = Number(pedido.id);
  const modal = await db.getPedidoObraModalData(pedidoObraId);
  const receitas = modal.receitas as any[];
  const despesas = modal.despesas as any[];
  const custos = modal.custos as any[];
  const percent = Number(modal.financeiro?.porcentagemImposto ?? 17) || 17;
  const receitaTotal = receitas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const impostoTotal = receitas
    .filter((item) => item.status === "Nfe")
    .reduce((sum, item) => sum + Number(item.valor || 0), 0) * (percent / 100);
  const despesaTotal = despesas.reduce((sum, item) => sum + Number(item.valorTotalDocumento || 0), 0);
  const custoTotal = custos.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
  const saldo = receitaTotal - impostoTotal - despesaTotal - custoTotal;

  const timbrado = await loadJpeg("client/src/assets/papel-timbrado-minasfalto.jpeg");
  const assinatura = await loadJpeg("client/src/assets/assinatura-diretor.jpg");
  const pages: string[] = [];
  let content = "";
  let y = 790;
  const newPage = () => {
    if (content) pages.push(content);
    content = "q 595.28 0 0 841.89 0 0 cm /BG Do Q\n";
    y = 790;
    content += drawText("MEDICAO DE OBRA", 96, y, 17, true, "0 0.10 0.20");
    content += drawText(`Pedido ${pedido.pedido} - ${pedido.cliente}`, 96, y - 20, 10, true, "0.20 0.28 0.36");
    content += "0.95 0.65 0.10 RG 50 748 495 0 l S\n";
    y = 720;
  };
  const card = (label: string, value: unknown, x: number, width = 115) => {
    content += drawRect(x, y, width, 36, "1 1 1");
    content += drawText(label.toUpperCase(), x + 6, y + 22, 6, true, "0.38 0.45 0.54");
    content += drawText(value, x + 6, y + 8, 8, true, "0 0.10 0.20");
  };
  const section = (title: string, headers: string[], rows: unknown[][]) => {
    if (y < 170) newPage();
    const widths = headers.map(() => 495 / headers.length);
    content += drawRect(50, y, 495, 18, "0.86 0.90 0.94");
    content += drawText(title, 56, y + 6, 9, true, "0 0.10 0.20");
    y -= 18;
    headers.forEach((header, index) => {
      content += drawText(header, 52 + widths.slice(0, index).reduce((a, b) => a + b, 0), y + 5, 6, true, "0 0.10 0.20");
    });
    y -= 14;
    const tableRows = rows.length ? rows : [[`Nenhum registro em ${title.toLowerCase()}`]];
    for (const row of tableRows) {
      if (y < 95) newPage();
      row.forEach((cell, index) => {
        const x = 52 + widths.slice(0, index).reduce((a, b) => a + b, 0);
        wrap(cell, Math.max(10, Math.floor(widths[index] / 4.2)), 2).forEach((line, lineIndex) => {
          content += drawText(line, x, y - lineIndex * 8, 6);
        });
      });
      y -= 22;
    }
    y -= 10;
  };

  newPage();
  card("Pedido", pedido.pedido, 50);
  card("Data inicio", dateBR(pedido.dataPedido), 174);
  card("Data impressao", dateTimeBR(new Date()), 298, 130);
  card("Status", pedido.status, 437, 108);
  y -= 54;
  card("Receita", money(receitaTotal), 50);
  card("Impostos", money(impostoTotal), 149);
  card("Despesas", money(despesaTotal), 248);
  card("Custos", money(custoTotal), 347);
  card("Saldo", money(saldo), 446, 99);
  y -= 55;

  section("Receitas", ["N Doc", "Status", "Data", "Valor", "Descricao"], receitas.map((item) => [
    item.numeroDocumento,
    item.status,
    dateBR(item.data),
    money(item.valor),
    item.descricao,
  ]));
  section("Despesas", ["Codigo", "Fornecedor", "Doc", "Valor", "Complemento"], despesas.map((item) => [
    item.codigoFornecedorCliente,
    item.fornecedorCliente,
    item.numeroDocumento,
    money(item.valorTotalDocumento),
    item.complemento,
  ]));
  section("Impostos", ["N Doc", "Data", "Valor"], receitas.filter((item) => item.status === "Nfe").map((item) => [
    item.numeroDocumento,
    dateBR(item.data),
    money(Number(item.valor || 0) * (percent / 100)),
  ]));
  section("Custos", ["N Doc", "Data", "Valor", "Situacao", "Complemento"], custos.map((item) => [
    item.numeroDocumento,
    dateBR(item.dataEmissao),
    money(item.valorTotal),
    item.situacao,
    item.complemento,
  ]));
  if (y < 180) newPage();
  content += "q 145 0 0 44 225 98 cm /SIG Do Q\n";
  content += "0 0 0 RG 210 92 175 0 l S\n";
  content += drawText("Diretoria Minasfalto", 250, 76, 9, true, "0 0.10 0.20");
  pages.push(content);

  return {
    filename: `medicao-obra-${pedido.pedido}-${new Date().toISOString().slice(0, 10)}.pdf`,
    buffer: createPdf(pages, timbrado, assinatura),
  };
}

export function registerMedicaoPdfRoutes(app: Express) {
  const handler = async (req: Request, res: Response) => {
    const pedidoObraIdOrPedidoNum = Number(req.params.id);
    if (!Number.isFinite(pedidoObraIdOrPedidoNum)) {
      res.status(400).send("Pedido invalido");
      return;
    }
    try {
      const pdf = await buildMedicaoPdf(pedidoObraIdOrPedidoNum);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
    } catch (error) {
      console.error("[MedicaoPDF]", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).send(`Erro ao gerar PDF da medicao: ${message}`);
    }
  };

  app.get("/api/medicao-obras/:id/pdf", handler);
  const appBasePath = getAppBasePath();
  if (appBasePath) app.get(`${appBasePath}/api/medicao-obras/:id/pdf`, handler);
}
