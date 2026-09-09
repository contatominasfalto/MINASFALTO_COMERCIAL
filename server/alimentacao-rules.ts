export const TIPOS_REFEICAO = ["cafe", "almoco", "jantar", "lanche"] as const;
export function dinheiro(value: unknown) {
  const number =
    typeof value === "string"
      ? Number(value.replace(/\./g, "").replace(",", "."))
      : Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error("Valor monetário inválido.");
  return Math.round(number * 100) / 100;
}
export function totalItem(quantidade: number, valorUnitario: number) {
  if (!Number.isInteger(quantidade) || quantidade < 0)
    throw new Error("A quantidade deve ser um inteiro maior ou igual a zero.");
  return Math.round(quantidade * dinheiro(valorUnitario) * 100) / 100;
}
export function totalGrupo(
  itens: Array<{ quantidade: number; valorUnitario: number }>,
  extra: number
) {
  if (!itens.length) throw new Error("Inclua ao menos um funcionário.");
  const valorExtra = dinheiro(extra);
  if (itens.some(item => item.quantidade === 0) && valorExtra <= 0) {
    throw new Error(
      "Preencha o custo extra do grupo para usar quantidade zero."
    );
  }
  return (
    Math.round(
      (itens.reduce(
        (sum, item) => sum + totalItem(item.quantidade, item.valorUnitario),
        0
      ) +
        valorExtra) *
        100
    ) / 100
  );
}
export function dataIso(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T12:00:00Z`))
  )
    throw new Error("Data inválida.");
  return value;
}
