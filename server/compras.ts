import type mysql from "mysql2/promise";
import { getMysqlPool } from "./db";

export function comprasUppercase(value: unknown) {
  return String(value ?? "").trim().toLocaleUpperCase("pt-BR");
}

export async function painel() {
  const pool = await getMysqlPool();
  const [[orcamentos], [fornecedores], [materiais], [historico]] =
    await Promise.all([
      pool.query(
        `SELECT o.id,o.numero,o.titulo,DATE_FORMAT(o.data_orcamento,'%Y-%m-%d') dataOrcamento,o.status,o.observacoes,o.valor_cotado valorCotado,o.valor_negociado valorNegociado,o.valor_pago valorPago,o.fornecedor_escolhido_id fornecedorEscolhidoId,f.nome fornecedorEscolhido,(SELECT COUNT(*) FROM compras_orcamento_itens i WHERE i.orcamento_id=o.id) itens FROM compras_orcamentos o LEFT JOIN compras_fornecedores f ON f.id=o.fornecedor_escolhido_id ORDER BY o.data_orcamento DESC,o.id DESC`
      ),
      pool.query(
        "SELECT id,nome,documento,telefone,email,endereco,ativo,origem_planilha origemPlanilha,fornecedor_nota fornecedorNota,fornecedor_item fornecedorItem FROM compras_fornecedores ORDER BY ativo DESC,nome"
      ),
      pool.query(
        "SELECT id,descricao,categoria,unidade,ativo,origem_planilha origemPlanilha FROM compras_materiais ORDER BY ativo DESC,descricao"
      ),
      pool.query(
        "SELECT id,arquivo,status,resumo,criado_em criadoEm FROM compras_importacoes ORDER BY id DESC LIMIT 20"
      ),
    ]);
  const fornecedoresNormalizados = (fornecedores as any[]).map(item => ({
    ...item,
    documento: item.documento ?? "",
    telefone: item.telefone ?? "",
    email: item.email ?? "",
    endereco: item.endereco ?? "",
    ativo: Boolean(item.ativo),
    origemPlanilha: Boolean(item.origemPlanilha),
    fornecedorNota: Boolean(item.fornecedorNota),
    fornecedorItem: Boolean(item.fornecedorItem),
  }));
  const materiaisNormalizados = (materiais as any[]).map(item => ({
    ...item,
    categoria: item.categoria ?? "",
    unidade: item.unidade ?? "",
    ativo: Boolean(item.ativo),
    origemPlanilha: Boolean(item.origemPlanilha),
  }));
  return {
    orcamentos,
    fornecedores: fornecedoresNormalizados,
    materiais: materiaisNormalizados,
    historico,
  } as any;
}

export async function obterOrcamento(id: number) {
  const pool = await getMysqlPool();
  const [[rows], [itens], [ofertas]] = await Promise.all([
    pool.query(
      "SELECT o.*,DATE_FORMAT(o.data_orcamento,'%Y-%m-%d') data_orcamento FROM compras_orcamentos o WHERE o.id=?",
      [id]
    ),
    pool.query(
      "SELECT id,material_id materialId,descricao,quantidade,unidade,ordem FROM compras_orcamento_itens WHERE orcamento_id=? ORDER BY ordem,id",
      [id]
    ),
    pool.query(
      "SELECT o.id,o.item_id itemId,o.fornecedor_id fornecedorId,f.nome fornecedor,o.valor_unitario valorUnitario,o.valor_total valorTotal,COALESCE(o.prazo_entrega,'') prazoEntrega,COALESCE(o.condicao_pagamento,'') condicaoPagamento,o.selecionada FROM compras_orcamento_ofertas o JOIN compras_fornecedores f ON f.id=o.fornecedor_id WHERE o.orcamento_id=? ORDER BY o.item_id,f.nome",
      [id]
    ),
  ]);
  if (!(rows as any[])[0]) throw new Error("Orçamento não encontrado.");
  return { orcamento: (rows as any[])[0], itens, ofertas } as any;
}

type OrcamentoInput = {
  id?: number;
  numero: string;
  titulo: string;
  dataOrcamento: string;
  status: string;
  observacoes?: string;
  prazoEntregaPadrao?: string;
  fornecedorEscolhidoId?: number | null;
  valorCotado: number;
  valorNegociado: number;
  valorPago: number;
  itens: Array<{
    id?: number;
    materialId?: number | null;
    descricao: string;
    quantidade: number;
    unidade?: string;
    ofertas: Array<{
      fornecedorId: number;
      valorUnitario: number;
      prazoEntrega?: string;
      condicaoPagamento?: string;
      selecionada: boolean;
    }>;
  }>;
};
export async function salvarOrcamento(data: OrcamentoInput, usuario: string) {
  const pool = await getMysqlPool();
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    let id = data.id;
    if (id)
      await cx.execute(
        "UPDATE compras_orcamentos SET numero=?,titulo=?,data_orcamento=?,status=?,observacoes=?,prazo_entrega_padrao=?,fornecedor_escolhido_id=?,valor_cotado=?,valor_negociado=?,valor_pago=?,atualizado_por=? WHERE id=?",
        [
          comprasUppercase(data.numero),
          comprasUppercase(data.titulo),
          data.dataOrcamento,
          data.status,
          comprasUppercase(data.observacoes) || null,
          comprasUppercase(data.prazoEntregaPadrao) || null,
          data.fornecedorEscolhidoId || null,
          data.valorCotado,
          data.valorNegociado,
          data.valorPago,
          usuario,
          id,
        ]
      );
    else {
      const [result] = await cx.execute<mysql.ResultSetHeader>(
        "INSERT INTO compras_orcamentos(numero,titulo,data_orcamento,status,observacoes,prazo_entrega_padrao,fornecedor_escolhido_id,valor_cotado,valor_negociado,valor_pago,criado_por,atualizado_por) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          comprasUppercase(data.numero),
          comprasUppercase(data.titulo),
          data.dataOrcamento,
          data.status,
          comprasUppercase(data.observacoes) || null,
          comprasUppercase(data.prazoEntregaPadrao) || null,
          data.fornecedorEscolhidoId || null,
          data.valorCotado,
          data.valorNegociado,
          data.valorPago,
          usuario,
          usuario,
        ]
      );
      id = result.insertId;
    }
    await cx.execute(
      "DELETE FROM compras_orcamento_ofertas WHERE orcamento_id=?",
      [id]
    );
    await cx.execute(
      "DELETE FROM compras_orcamento_itens WHERE orcamento_id=?",
      [id]
    );
    for (let n = 0; n < data.itens.length; n++) {
      const item = data.itens[n];
      const [r] = await cx.execute<mysql.ResultSetHeader>(
        "INSERT INTO compras_orcamento_itens(orcamento_id,material_id,descricao,quantidade,unidade,ordem) VALUES(?,?,?,?,?,?)",
        [
          id,
          item.materialId || null,
          comprasUppercase(item.descricao),
          item.quantidade,
          comprasUppercase(item.unidade) || null,
          n,
        ]
      );
      for (const oferta of item.ofertas)
        await cx.execute(
          "INSERT INTO compras_orcamento_ofertas(orcamento_id,item_id,fornecedor_id,valor_unitario,valor_total,prazo_entrega,condicao_pagamento,selecionada) VALUES(?,?,?,?,?,?,?,?)",
          [
            id,
            r.insertId,
            oferta.fornecedorId,
            oferta.valorUnitario,
            oferta.valorUnitario * item.quantidade,
            comprasUppercase(oferta.prazoEntrega) || null,
            comprasUppercase(oferta.condicaoPagamento) || null,
            oferta.selecionada,
          ]
        );
    }
    await cx.commit();
    return { ok: true, id };
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
}
export function criarOrcamento(
  data: Omit<OrcamentoInput, "id">,
  usuario: string
) {
  return salvarOrcamento(data, usuario);
}
export function atualizarOrcamento(
  data: OrcamentoInput & { id: number },
  usuario: string
) {
  return salvarOrcamento(data, usuario);
}
export async function excluirOrcamento(id: number) {
  const pool = await getMysqlPool();
  const [r] = await pool.execute<mysql.ResultSetHeader>(
    "DELETE FROM compras_orcamentos WHERE id=?",
    [id]
  );
  if (!r.affectedRows) throw new Error("Orçamento não encontrado.");
  return { ok: true };
}
export async function salvarFornecedor(data: any) {
  const pool = await getMysqlPool();
  if (data.id)
    await pool.execute(
      "UPDATE compras_fornecedores SET nome=?,documento=?,telefone=?,email=?,endereco=?,ativo=? WHERE id=?",
      [
        comprasUppercase(data.nome),
        comprasUppercase(data.documento) || null,
        comprasUppercase(data.telefone) || null,
        comprasUppercase(data.email) || null,
        comprasUppercase(data.endereco) || null,
        data.ativo,
        data.id,
      ]
    );
  else
    await pool.execute(
      "INSERT INTO compras_fornecedores(nome,documento,telefone,email,endereco,ativo,fornecedor_nota,fornecedor_item) VALUES(?,?,?,?,?,?,?,?)",
      [
        comprasUppercase(data.nome),
        comprasUppercase(data.documento) || null,
        comprasUppercase(data.telefone) || null,
        comprasUppercase(data.email) || null,
        comprasUppercase(data.endereco) || null,
        data.ativo,
        data.tipoFornecedor !== "ITEM",
        data.tipoFornecedor === "ITEM" || data.tipoFornecedor === "AMBOS",
      ]
    );
  return { ok: true };
}
export async function classificarFornecedor(
  id: number,
  tipoFornecedor: "NOTA" | "ITEM" | "AMBOS"
) {
  const pool = await getMysqlPool();
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE compras_fornecedores SET fornecedor_nota=?,fornecedor_item=? WHERE id=?",
    [
      tipoFornecedor === "NOTA" || tipoFornecedor === "AMBOS",
      tipoFornecedor === "ITEM" || tipoFornecedor === "AMBOS",
      id,
    ]
  );
  if (!result.affectedRows) throw new Error("Fornecedor não encontrado.");
  return { ok: true };
}
export async function salvarMaterial(data: any) {
  const pool = await getMysqlPool();
  if (data.id)
    await pool.execute(
      "UPDATE compras_materiais SET descricao=?,categoria=?,unidade=?,ativo=? WHERE id=?",
      [
        comprasUppercase(data.descricao),
        comprasUppercase(data.categoria) || null,
        comprasUppercase(data.unidade) || null,
        data.ativo,
        data.id,
      ]
    );
  else
    await pool.execute(
      "INSERT INTO compras_materiais(descricao,categoria,unidade,ativo) VALUES(?,?,?,?)",
      [
        comprasUppercase(data.descricao),
        comprasUppercase(data.categoria) || null,
        comprasUppercase(data.unidade) || null,
        data.ativo,
      ]
    );
  return { ok: true };
}
export function criarFornecedor(data: any) {
  return salvarFornecedor({ ...data, id: undefined });
}
export function atualizarFornecedor(data: any) {
  return salvarFornecedor(data);
}
export function criarMaterial(data: any) {
  return salvarMaterial({ ...data, id: undefined });
}
export function atualizarMaterial(data: any) {
  return salvarMaterial(data);
}
export async function excluirCadastro(
  tipo: "fornecedor" | "material",
  id: number
) {
  const pool = await getMysqlPool();
  const table =
    tipo === "fornecedor" ? "compras_fornecedores" : "compras_materiais";
  await pool.execute(`UPDATE ${table} SET ativo=FALSE WHERE id=?`, [id]);
  return { ok: true };
}
