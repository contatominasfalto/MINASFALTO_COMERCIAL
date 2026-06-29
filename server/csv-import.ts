import * as db from "./db";

export interface CSVPedido {
  dataPedido?: string;
  cliente: string;
  pedido: string;
  situacao?: string;
  qtde?: number;
  valorUnit?: number;
  totalPedido?: number;
  saldo?: number;
  percentual?: number;
  prioridade?: "NORMAL" | "PRIORIDADE";
  qtdeGranel?: number;
  qtdeTapFacil?: number;
  status?: "PENDENTE" | "SAÍDA OK" | "CANCELADO";
  dataEntrega?: string;
  observacoes?: string;
}

export async function importarCSV(csv: string): Promise<{
  sucesso: boolean;
  mensagem: string;
  importados: number;
  erros: string[];
}> {
  const linhas = csv.trim().split("\n");
  const erros: string[] = [];
  let importados = 0;

  // Pular header se existir
  let startIndex = 0;
  if (linhas[0]?.toLowerCase().includes("data")) {
    startIndex = 1;
  }

  for (let i = startIndex; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;

    try {
      const partes = linha.split(",").map(p => p.trim());

      // Validar número mínimo de campos
      if (partes.length < 3) {
        erros.push(`Linha ${i + 1}: Formato inválido`);
        continue;
      }

      const pedido: CSVPedido = {
        dataPedido: partes[0] || undefined,
        cliente: partes[1],
        pedido: partes[2],
        situacao: partes[3] || "Aprovado",
        qtde: partes[4] ? parseFloat(partes[4]) : undefined,
        valorUnit: partes[5] ? parseFloat(partes[5]) : undefined,
        totalPedido: partes[6] ? parseFloat(partes[6]) : undefined,
        saldo: partes[7] ? parseFloat(partes[7]) : undefined,
        percentual: partes[8] ? parseFloat(partes[8]) : undefined,
        prioridade: (partes[9] === "PRIORIDADE" ? "PRIORIDADE" : "NORMAL") as any,
        qtdeGranel: partes[10] ? parseFloat(partes[10]) : undefined,
        qtdeTapFacil: partes[11] ? parseFloat(partes[11]) : undefined,
        status: (partes[12] as any) || "PENDENTE",
        dataEntrega: partes[13] || undefined,
        observacoes: partes[14] || undefined,
      };

      // Validar campos obrigatórios
      if (!pedido.cliente || !pedido.pedido) {
        erros.push(`Linha ${i + 1}: Cliente e Pedido são obrigatórios`);
        continue;
      }

      // Verificar se pedido já existe
      const existing = await db.getPedidoByNumber(pedido.pedido);
      if (existing) {
        erros.push(`Linha ${i + 1}: Pedido ${pedido.pedido} já existe`);
        continue;
      }

      // Criar pedido
      await db.createPedido(pedido);
      importados++;
    } catch (error) {
      erros.push(`Linha ${i + 1}: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  }

  return {
    sucesso: erros.length === 0 || importados > 0,
    mensagem: erros.length > 0 
      ? `Importação parcial: ${importados} pedidos importados, ${erros.length} erros`
      : `Importação concluída: ${importados} pedidos importados`,
    importados,
    erros,
  };
}
