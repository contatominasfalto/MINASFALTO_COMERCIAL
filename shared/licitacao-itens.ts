import { z } from "zod";

const decimal = (casas: number, max: number) => z.coerce.number().finite().nonnegative().max(max)
  .refine(value => Math.abs(value * 10 ** casas - Math.round(value * 10 ** casas)) < 0.0001,
    `Use no máximo ${casas} casas decimais.`);

export const licitacaoItemSchema = z.object({
  numero: z.number().int().min(1).max(5),
  tipo: z.string().trim().max(120),
  qtdeSc: decimal(3, 999999999),
  valorUnit: decimal(2, 999999999),
  lanceLimite: decimal(2, 999999999),
  valorAdjudicado: decimal(2, 999999999),
  qtdeTn: decimal(3, 999999999),
});

export const licitacaoItensSchema = z.array(licitacaoItemSchema).min(1).max(5)
  .refine(itens => itens.every((item, index) => item.numero === index + 1),
    "Os itens devem ser numerados de 1 até a quantidade selecionada, sem repetição.")
  .refine(itens => itens.reduce((sum, item) => sum + valorTotalItem(item), 0) <= 9999999999999,
    "O valor total excede o limite permitido.");

export type LicitacaoItem = z.infer<typeof licitacaoItemSchema>;

export function novoLicitacaoItem(numero: number): LicitacaoItem {
  return { numero, tipo: "", qtdeSc: 0, valorUnit: 0, lanceLimite: 0, valorAdjudicado: 0, qtdeTn: 0 };
}

/** Multiplicação decimal: milésimos de saco × centavos, arredondada ao centavo. */
export function valorTotalItem(item: Pick<LicitacaoItem, "qtdeSc" | "valorUnit">): number {
  const quantidade = Math.round(item.qtdeSc * 1000);
  const centavos = Math.round(item.valorUnit * 100);
  // O formulário pode conter temporariamente números fora dos limites; não quebrar a tela.
  if (!Number.isSafeInteger(quantidade) || !Number.isSafeInteger(centavos)) return 0;
  const produto = BigInt(quantidade) * BigInt(centavos);
  return Number((produto + BigInt(500)) / BigInt(1000)) / 100;
}

export function resumirLicitacaoItens(input: LicitacaoItem[]) {
  const itens = licitacaoItensSchema.parse(input);
  const sum = (key: "qtdeSc" | "qtdeTn", scale: number) =>
    itens.reduce((total, item) => total + Math.round(item[key] * scale), 0) / scale;
  return {
    itensJson: JSON.stringify(itens),
    item: itens.map(item => item.numero).join(", "),
    tipo: Array.from(new Set(itens.map(item => item.tipo).filter(Boolean))).join(" / ").slice(0, 120),
    qtdeSc: sum("qtdeSc", 1000),
    qtdeTn: sum("qtdeTn", 1000),
    // Não existe um preço unitário único em uma licitação com vários itens.
    valorUnit: itens.length === 1 ? itens[0].valorUnit : null,
    lanceLimite: itens.length === 1 ? itens[0].lanceLimite : null,
    valorAdjudicado: itens.length === 1 ? itens[0].valorAdjudicado : null,
    valorInicialContrato: itens.reduce((total, item) => total + Math.round(valorTotalItem(item) * 100), 0) / 100,
  };
}

export function lerLicitacaoItens(registro: Record<string, any>): LicitacaoItem[] {
  if (registro.itensJson != null) {
    // Falhar explicitamente evita substituir dados inválidos por um item vazio.
    return licitacaoItensSchema.parse(JSON.parse(registro.itensJson));
  }
  return [{ ...novoLicitacaoItem(1), tipo: String(registro.tipo || ""),
    qtdeSc: Number(registro.qtdeSc || 0), valorUnit: Number(registro.valorUnit || 0),
    lanceLimite: Number(registro.lanceLimite || 0), valorAdjudicado: Number(registro.valorAdjudicado || 0),
    qtdeTn: Number(registro.qtdeTn || 0) }];
}

export function itemPreenchido(item: LicitacaoItem) {
  return Boolean(item.tipo.trim() || item.qtdeSc || item.qtdeTn || item.valorUnit || item.lanceLimite || item.valorAdjudicado);
}
