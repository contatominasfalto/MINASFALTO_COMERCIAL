import type mysql from "mysql2/promise";
import { getMysqlPool } from "./db";

const comprasSchemaPromises = new WeakMap<object, Promise<void>>();

export const comprasPrazoEntregaPadraoMigration =
  "ALTER TABLE compras_orcamentos ADD COLUMN prazo_entrega_padrao varchar(120) NULL AFTER observacoes";

export const comprasOrcamentoSequenciaMigration = `CREATE TABLE IF NOT EXISTS compras_orcamento_sequencias (
  ano smallint unsigned NOT NULL PRIMARY KEY,
  ultimo_numero bigint unsigned NOT NULL DEFAULT 0,
  atualizado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

/** Garante evoluções compatíveis sem depender de comando manual após o deploy. */
export async function ensureComprasSchema(pool: mysql.Pool) {
  let pending = comprasSchemaPromises.get(pool);
  if (!pending) {
    pending = (async () => {
      const [columns] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='compras_orcamentos' AND column_name='prazo_entrega_padrao'"
      );
      if (!columns.length) await pool.query(comprasPrazoEntregaPadraoMigration);
      await pool.query(comprasOrcamentoSequenciaMigration);
      await pool.query(`INSERT INTO compras_orcamento_sequencias (ano,ultimo_numero)
        SELECT
          CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(numero,'-',2),'-',-1) AS UNSIGNED) ano,
          MAX(CAST(SUBSTRING_INDEX(numero,'-',-1) AS UNSIGNED)) ultimo_numero
        FROM compras_orcamentos
        WHERE numero REGEXP '^COT-[0-9]{4}-[0-9]+$'
        GROUP BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(numero,'-',2),'-',-1) AS UNSIGNED)
        ON DUPLICATE KEY UPDATE ultimo_numero=GREATEST(compras_orcamento_sequencias.ultimo_numero,VALUES(ultimo_numero))`);
    })().catch((error) => {
      comprasSchemaPromises.delete(pool);
      throw error;
    });
    comprasSchemaPromises.set(pool, pending);
  }
  await pending;
}

export function comprasUppercase(value: unknown) {
  return String(value ?? "").trim().toLocaleUpperCase("pt-BR");
}

export function anoDoOrcamento(dataOrcamento: string) {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dataOrcamento);
  if (!match) throw new Error("Data do orcamento invalida.");
  return Number(match[1]);
}

export function formatarNumeroOrcamento(ano: number, sequencia: number) {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 9999)
    throw new Error("Ano do orcamento invalido.");
  if (!Number.isInteger(sequencia) || sequencia < 1)
    throw new Error("Sequencia do orcamento invalida.");
  return `COT-${ano}-${sequencia}`;
}

async function gerarNumeroOrcamento(
  cx: mysql.PoolConnection,
  dataOrcamento: string
) {
  const ano = anoDoOrcamento(dataOrcamento);
  await cx.execute(
    `INSERT INTO compras_orcamento_sequencias (ano,ultimo_numero)
     VALUES (?,LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE ultimo_numero=LAST_INSERT_ID(ultimo_numero+1)`,
    [ano]
  );
  const [rows] = await cx.query<mysql.RowDataPacket[]>(
    "SELECT LAST_INSERT_ID() sequencia"
  );
  return formatarNumeroOrcamento(ano, Number(rows[0].sequencia));
}

export type TipoCadastroCompras =
  | "FORNECEDOR_NOTA"
  | "FORNECEDOR_ITEM"
  | "MATERIAL";

export const destinosTransferenciaCompras: Record<TipoCadastroCompras, TipoCadastroCompras[]> = {
  FORNECEDOR_NOTA: ["FORNECEDOR_ITEM", "MATERIAL"],
  FORNECEDOR_ITEM: ["FORNECEDOR_NOTA", "MATERIAL"],
  MATERIAL: ["FORNECEDOR_NOTA", "FORNECEDOR_ITEM"],
};

export function validarTransferenciaCompras(origem: TipoCadastroCompras, destino: TipoCadastroCompras) {
  if (!destinosTransferenciaCompras[origem].includes(destino)) {
    throw new Error("Destino invalido para o cadastro selecionado.");
  }
  return true;
}

export function comandoExclusaoCadastro(
  tipo: "fornecedor" | "material"
) {
  return tipo === "fornecedor"
    ? "DELETE FROM compras_fornecedores WHERE id=?"
    : "UPDATE compras_materiais SET ativo=FALSE WHERE id=?";
}

export async function painel() {
  const pool = await getMysqlPool();
  await ensureComprasSchema(pool);
  const [[orcamentos], [fornecedores], [materiais], [historico]] =
    await Promise.all([
      pool.query(
        `SELECT o.id,o.numero,o.titulo,DATE_FORMAT(o.data_orcamento,'%Y-%m-%d') dataOrcamento,o.status,o.observacoes,o.valor_cotado valorCotado,o.valor_negociado valorNegociado,o.valor_pago valorPago,o.fornecedor_escolhido_id fornecedorEscolhidoId,f.nome fornecedorEscolhido,(SELECT COUNT(*) FROM compras_orcamento_itens i WHERE i.orcamento_id=o.id) itens FROM compras_orcamentos o LEFT JOIN compras_fornecedores f ON f.id=o.fornecedor_escolhido_id ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(o.numero,'-',2),'-',-1) AS UNSIGNED),CAST(SUBSTRING_INDEX(o.numero,'-',-1) AS UNSIGNED),o.id`
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
  await ensureComprasSchema(pool);
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
  numero?: string;
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
  await ensureComprasSchema(pool);
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    let id = data.id;
    let numero = data.numero || "";
    if (id)
      await cx.execute(
        "UPDATE compras_orcamentos SET titulo=?,data_orcamento=?,status=?,observacoes=?,prazo_entrega_padrao=?,fornecedor_escolhido_id=?,valor_cotado=?,valor_negociado=?,valor_pago=?,atualizado_por=? WHERE id=?",
        [
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
      numero = await gerarNumeroOrcamento(cx, data.dataOrcamento);
      const [result] = await cx.execute<mysql.ResultSetHeader>(
        "INSERT INTO compras_orcamentos(numero,titulo,data_orcamento,status,observacoes,prazo_entrega_padrao,fornecedor_escolhido_id,valor_cotado,valor_negociado,valor_pago,criado_por,atualizado_por) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          numero,
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
    return { ok: true, id, numero };
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

export async function transferirCadastro(
  id: number,
  origem: TipoCadastroCompras,
  destino: TipoCadastroCompras
) {
  validarTransferenciaCompras(origem, destino);
  const pool = await getMysqlPool();
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    if (origem === "MATERIAL") {
      const [rows] = await cx.execute<mysql.RowDataPacket[]>(
        "SELECT id,descricao,origem_planilha FROM compras_materiais WHERE id=? AND ativo=TRUE FOR UPDATE",
        [id]
      );
      const material = rows[0];
      if (!material) throw new Error("Material nao encontrado ou inativo.");
      const paraNota = destino === "FORNECEDOR_NOTA";
      await cx.execute(
        `INSERT INTO compras_fornecedores
          (nome,ativo,origem_planilha,fornecedor_nota,fornecedor_item)
         VALUES(?,TRUE,?,?,?)
         ON DUPLICATE KEY UPDATE ativo=TRUE,
          fornecedor_nota=VALUES(fornecedor_nota), fornecedor_item=VALUES(fornecedor_item)`,
        [material.descricao, Boolean(material.origem_planilha), paraNota, !paraNota]
      );
      await cx.execute("UPDATE compras_materiais SET ativo=FALSE WHERE id=?", [id]);
    } else {
      const [rows] = await cx.execute<mysql.RowDataPacket[]>(
        "SELECT id,nome,origem_planilha FROM compras_fornecedores WHERE id=? AND ativo=TRUE FOR UPDATE",
        [id]
      );
      const fornecedor = rows[0];
      if (!fornecedor) throw new Error("Fornecedor nao encontrado ou inativo.");
      if (destino === "MATERIAL") {
        await cx.execute(
          `INSERT INTO compras_materiais
            (descricao,categoria,unidade,ativo,origem_planilha)
           VALUES(?,'CADASTRO TRANSFERIDO','UN',TRUE,?)
           ON DUPLICATE KEY UPDATE ativo=TRUE`,
          [fornecedor.nome, Boolean(fornecedor.origem_planilha)]
        );
        await cx.execute(
          "UPDATE compras_fornecedores SET fornecedor_nota=FALSE,fornecedor_item=FALSE WHERE id=?",
          [id]
        );
      } else {
        const paraNota = destino === "FORNECEDOR_NOTA";
        await cx.execute(
          "UPDATE compras_fornecedores SET fornecedor_nota=?,fornecedor_item=? WHERE id=?",
          [paraNota, !paraNota, id]
        );
      }
    }
    await cx.commit();
    return { ok: true, origem, destino };
  } catch (error) {
    await cx.rollback();
    throw error;
  } finally {
    cx.release();
  }
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

  if (tipo === "fornecedor") {
    try {
      const [result] = await pool.execute<mysql.ResultSetHeader>(
        comandoExclusaoCadastro("fornecedor"),
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error("Fornecedor não encontrado ou já excluído.");
      }

      return { ok: true, acao: "EXCLUIDO" as const };
    } catch (error: any) {
      if (
        error?.code === "ER_ROW_IS_REFERENCED_2" ||
        error?.errno === 1451
      ) {
        throw new Error(
          "Este fornecedor possui orçamentos ou propostas vinculadas e não pode ser excluído sem comprometer o histórico."
        );
      }
      throw error;
    }
  }

  const [result] = await pool.execute<mysql.ResultSetHeader>(
    comandoExclusaoCadastro("material"),
    [id]
  );
  if (result.affectedRows === 0) {
    throw new Error("Material não encontrado.");
  }
  return { ok: true, acao: "INATIVADO" as const };
}
