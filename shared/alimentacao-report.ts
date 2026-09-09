export type AlimentacaoCustoExtraDetalhado = {
  id: number;
  dataRefeicao: string;
  fornecedor: string;
  numeroNota: string;
  tipo: string;
  observacao: string;
  valorExtra: number;
  quantidadeRefeicoes: number;
  funcionarios: string[];
  setores: string[];
};

export function detalharCustosExtrasAlimentacao(
  rows: any[]
): AlimentacaoCustoExtraDetalhado[] {
  const grupos = new Map<number, AlimentacaoCustoExtraDetalhado>();

  for (const row of rows) {
    const id = Number(row.id);
    const valorExtra = Number(row.valorExtra || 0);
    if (!Number.isFinite(id) || id <= 0 || valorExtra <= 0) continue;

    const atual = grupos.get(id) || {
      id,
      dataRefeicao: String(row.dataRefeicao || ""),
      fornecedor: String(row.fornecedor || "Não informado"),
      numeroNota: String(row.numeroNota || "Sem nota"),
      tipo: String(row.tipo || "Não informado"),
      observacao: String(row.observacao || "Sem observação"),
      valorExtra,
      quantidadeRefeicoes: 0,
      funcionarios: [],
      setores: [],
    };

    atual.quantidadeRefeicoes += Number(row.quantidade || 0);
    const funcionario = String(row.funcionario || "").trim();
    const setor = String(row.setor || "").trim();
    if (funcionario && !atual.funcionarios.includes(funcionario)) {
      atual.funcionarios.push(funcionario);
    }
    if (setor && !atual.setores.includes(setor)) atual.setores.push(setor);
    grupos.set(id, atual);
  }

  return Array.from(grupos.values()).sort(
    (a, b) => b.dataRefeicao.localeCompare(a.dataRefeicao) || b.id - a.id
  );
}

export function agruparCustosExtrasPorData(
  custos: AlimentacaoCustoExtraDetalhado[]
) {
  const datas = new Map<
    string,
    { nome: string; quantidade: number; total: number }
  >();
  for (const custo of custos) {
    const nome = custo.dataRefeicao || "Não informado";
    const atual = datas.get(nome) || { nome, quantidade: 0, total: 0 };
    atual.quantidade += 1;
    atual.total += custo.valorExtra;
    datas.set(nome, atual);
  }
  return Array.from(datas.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome)
  );
}
