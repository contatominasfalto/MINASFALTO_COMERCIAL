export function toSqlDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  throw new Error(`Data legada inválida: ${text || "vazia"}`);
}

export function aggregateLegacyMeals(rows) {
  const headers = new Map();
  const items = new Map();
  let sourceQuantity = 0;
  for (const row of rows) {
    const date = toSqlDate(row.data_refeicao);
    const groupKey = row.numero_nota ? `nota:${row.fornecedor_id}:${date}:${row.numero_nota}` : `refeicao:${row.id}`;
    const quantity = Number(row.quantidade || 0);
    const unit = Number(row.valor_unitario || 0);
    const extra = Number(row.valor_extra || 0);
    sourceQuantity += quantity;
    const header = headers.get(groupKey) || { groupKey, date, fornecedorId: row.fornecedor_id, numeroNota: row.numero_nota || null, tipo: row.tipo, observacao: row.observacao || null, valorExtra: 0 };
    header.valorExtra += extra;
    headers.set(groupKey, header);
    const itemKey = `${groupKey}|funcionario:${row.funcionario_id}`;
    const item = items.get(itemKey) || { itemKey, groupKey, funcionarioId: row.funcionario_id, quantidade: 0, valorBase: 0, origemId: String(row.id) };
    item.quantidade += quantity;
    item.valorBase += quantity * unit;
    items.set(itemKey, item);
  }
  return { headers: Array.from(headers.values()), items: Array.from(items.values()), sourceQuantity, consolidatedRows: rows.length - items.size };
}
