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

const comprasCadastrosOrcamentoMigration = `CREATE TABLE IF NOT EXISTS compras_objetos_cotacao (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome varchar(220) NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const comprasVeiculosMigration = `CREATE TABLE IF NOT EXISTS compras_veiculos_equipamentos (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome varchar(220) NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
      const [itemColumns] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='compras_orcamento_itens' AND column_name='incluido_calculo'"
      );
      if (!itemColumns.length)
        await pool.query(
          "ALTER TABLE compras_orcamento_itens ADD COLUMN incluido_calculo boolean NOT NULL DEFAULT true AFTER unidade"
        );
      await pool.query(comprasCadastrosOrcamentoMigration);
      await pool.query(comprasVeiculosMigration);
      const [relationColumns] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='compras_orcamentos' AND column_name IN ('objeto_cotacao_id','veiculo_equipamento_id')"
      );
      const existing = new Set(relationColumns.map(row => row.column_name ?? row.COLUMN_NAME));
      if (!existing.has("objeto_cotacao_id"))
        await pool.query("ALTER TABLE compras_orcamentos ADD COLUMN objeto_cotacao_id int NULL AFTER titulo");
      if (!existing.has("veiculo_equipamento_id"))
        await pool.query("ALTER TABLE compras_orcamentos ADD COLUMN veiculo_equipamento_id int NULL AFTER objeto_cotacao_id");
      await pool.query(`INSERT IGNORE INTO compras_objetos_cotacao(nome)
        SELECT DISTINCT UPPER(TRIM(titulo)) FROM compras_orcamentos WHERE TRIM(COALESCE(titulo,''))<>''`);
      await pool.query(`UPDATE compras_orcamentos o JOIN compras_objetos_cotacao c
        ON c.nome=UPPER(TRIM(o.titulo)) SET o.objeto_cotacao_id=c.id
        WHERE o.objeto_cotacao_id IS NULL`);
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
  const [[orcamentos], [fornecedores], [materiais], [historico], [objetosCotacao], [veiculosEquipamentos]] =
    await Promise.all([
      pool.query(
        `SELECT o.id,o.numero,o.titulo,o.objeto_cotacao_id objetoCotacaoId,o.veiculo_equipamento_id veiculoEquipamentoId,DATE_FORMAT(o.data_orcamento,'%Y-%m-%d') dataOrcamento,o.status,o.observacoes,o.valor_cotado valorCotado,o.valor_negociado valorNegociado,o.valor_pago valorPago,o.fornecedor_escolhido_id fornecedorEscolhidoId,f.nome fornecedorEscolhido,v.nome veiculoEquipamento,(SELECT COUNT(*) FROM compras_orcamento_itens i WHERE i.orcamento_id=o.id) itens FROM compras_orcamentos o LEFT JOIN compras_fornecedores f ON f.id=o.fornecedor_escolhido_id LEFT JOIN compras_veiculos_equipamentos v ON v.id=o.veiculo_equipamento_id ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(o.numero,'-',2),'-',-1) AS UNSIGNED),CAST(SUBSTRING_INDEX(o.numero,'-',-1) AS UNSIGNED),o.id`
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
      pool.query("SELECT id,nome,ativo FROM compras_objetos_cotacao ORDER BY ativo DESC,nome"),
      pool.query("SELECT id,nome,ativo FROM compras_veiculos_equipamentos ORDER BY ativo DESC,nome"),
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
    objetosCotacao: (objetosCotacao as any[]).map(x => ({ ...x, ativo: Boolean(x.ativo) })),
    veiculosEquipamentos: (veiculosEquipamentos as any[]).map(x => ({ ...x, ativo: Boolean(x.ativo) })),
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
      "SELECT id,material_id materialId,descricao,quantidade,unidade,incluido_calculo incluidoCalculo,ordem FROM compras_orcamento_itens WHERE orcamento_id=? ORDER BY ordem,id",
      [id]
    ),
    pool.query(
      "SELECT o.id,o.item_id itemId,o.fornecedor_id fornecedorId,f.nome fornecedor,o.valor_unitario valorUnitario,o.valor_total valorTotal,COALESCE(o.prazo_entrega,'') prazoEntrega,COALESCE(o.condicao_pagamento,'') condicaoPagamento,o.selecionada FROM compras_orcamento_ofertas o JOIN compras_fornecedores f ON f.id=o.fornecedor_id WHERE o.orcamento_id=? ORDER BY o.item_id,f.nome",
      [id]
    ),
  ]);
  if (!(rows as any[])[0]) throw new Error("Orçamento não encontrado.");
  return {
    orcamento: (rows as any[])[0],
    itens: (itens as any[]).map(item => ({
      ...item,
      incluidoCalculo: Boolean(item.incluidoCalculo),
    })),
    ofertas,
  } as any;
}

type OrcamentoInput = {
  id?: number;
  numero?: string;
  titulo: string;
  objetoCotacaoId: number;
  veiculoEquipamentoId?: number | null;
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
    incluidoCalculo: boolean;
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

export function calcularTotaisOrcamento(
  itens: OrcamentoInput["itens"],
  valorDesconto: number
) {
  const valorCotado = itens.reduce((total, item) => {
    if (!item.incluidoCalculo) return total;
    const totais = item.ofertas
      .map(oferta => Number(oferta.valorUnitario) * Number(item.quantidade))
      .filter(valor => Number.isFinite(valor) && valor > 0);
    return total + (totais.length ? Math.min(...totais) : 0);
  }, 0);
  const cotado = Math.round((valorCotado + Number.EPSILON) * 100) / 100;
  const desconto = Math.round((Number(valorDesconto || 0) + Number.EPSILON) * 100) / 100;
  if (desconto > cotado)
    throw new Error("O valor do desconto nao pode ser maior que o valor cotado.");
  return {
    valorCotado: cotado,
    valorFinal: Math.round((cotado - desconto + Number.EPSILON) * 100) / 100,
  };
}

export async function salvarOrcamento(data: OrcamentoInput, usuario: string) {
  const pool = await getMysqlPool();
  await ensureComprasSchema(pool);
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    const [objetos] = await cx.execute<mysql.RowDataPacket[]>(
      "SELECT id,nome FROM compras_objetos_cotacao WHERE id=? AND ativo=TRUE",
      [data.objetoCotacaoId]
    );
    if (!objetos[0]) throw new Error("Objeto da cotacao nao encontrado ou inativo.");
    if (data.veiculoEquipamentoId) {
      const [veiculos] = await cx.execute<mysql.RowDataPacket[]>(
        "SELECT id FROM compras_veiculos_equipamentos WHERE id=? AND ativo=TRUE",
        [data.veiculoEquipamentoId]
      );
      if (!veiculos[0]) throw new Error("Veiculo/equipamento nao encontrado ou inativo.");
    }
    const titulo = comprasUppercase(objetos[0].nome);
    const totais = calcularTotaisOrcamento(data.itens, data.valorNegociado);
    let id = data.id;
    let numero = data.numero || "";
    if (id)
      await cx.execute(
        "UPDATE compras_orcamentos SET titulo=?,objeto_cotacao_id=?,veiculo_equipamento_id=?,data_orcamento=?,status=?,observacoes=?,prazo_entrega_padrao=?,fornecedor_escolhido_id=?,valor_cotado=?,valor_negociado=?,valor_pago=?,atualizado_por=? WHERE id=?",
        [
          titulo,
          data.objetoCotacaoId,
          data.veiculoEquipamentoId || null,
          data.dataOrcamento,
          data.status,
          comprasUppercase(data.observacoes) || null,
          comprasUppercase(data.prazoEntregaPadrao) || null,
          data.fornecedorEscolhidoId || null,
          totais.valorCotado,
          data.valorNegociado,
          totais.valorFinal,
          usuario,
          id,
        ]
      );
    else {
      numero = await gerarNumeroOrcamento(cx, data.dataOrcamento);
      const [result] = await cx.execute<mysql.ResultSetHeader>(
        "INSERT INTO compras_orcamentos(numero,titulo,objeto_cotacao_id,veiculo_equipamento_id,data_orcamento,status,observacoes,prazo_entrega_padrao,fornecedor_escolhido_id,valor_cotado,valor_negociado,valor_pago,criado_por,atualizado_por) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          numero,
          titulo,
          data.objetoCotacaoId,
          data.veiculoEquipamentoId || null,
          data.dataOrcamento,
          data.status,
          comprasUppercase(data.observacoes) || null,
          comprasUppercase(data.prazoEntregaPadrao) || null,
          data.fornecedorEscolhidoId || null,
          totais.valorCotado,
          data.valorNegociado,
          totais.valorFinal,
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
        "INSERT INTO compras_orcamento_itens(orcamento_id,material_id,descricao,quantidade,unidade,incluido_calculo,ordem) VALUES(?,?,?,?,?,?,?)",
        [
          id,
          item.materialId || null,
          comprasUppercase(item.descricao),
          item.quantidade,
          comprasUppercase(item.unidade) || null,
          item.incluidoCalculo,
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

export type TipoCadastroAuxiliar = "objeto" | "veiculo";
function tabelaCadastroAuxiliar(tipo: TipoCadastroAuxiliar) {
  return tipo === "objeto"
    ? "compras_objetos_cotacao"
    : "compras_veiculos_equipamentos";
}
export async function salvarCadastroAuxiliar(
  tipo: TipoCadastroAuxiliar,
  data: { id?: number; nome: string; ativo: boolean }
) {
  const pool = await getMysqlPool();
  await ensureComprasSchema(pool);
  const tabela = tabelaCadastroAuxiliar(tipo);
  const nome = comprasUppercase(data.nome);
  if (data.id) {
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE ${tabela} SET nome=?,ativo=? WHERE id=?`,
      [nome, data.ativo, data.id]
    );
    if (!result.affectedRows) throw new Error("Cadastro nao encontrado.");
  } else {
    await pool.execute(`INSERT INTO ${tabela}(nome,ativo) VALUES(?,?)`, [nome, data.ativo]);
  }
  return { ok: true };
}
export async function excluirCadastroAuxiliar(tipo: TipoCadastroAuxiliar, id: number) {
  const pool = await getMysqlPool();
  await ensureComprasSchema(pool);
  const coluna = tipo === "objeto" ? "objeto_cotacao_id" : "veiculo_equipamento_id";
  const [refs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) total FROM compras_orcamentos WHERE ${coluna}=?`, [id]
  );
  if (Number(refs[0]?.total || 0) > 0)
    throw new Error("Cadastro vinculado a orcamento. Edite os orcamentos antes de exclui-lo.");
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `DELETE FROM ${tabelaCadastroAuxiliar(tipo)} WHERE id=?`, [id]
  );
  if (!result.affectedRows) throw new Error("Cadastro nao encontrado ou ja excluido.");
  return { ok: true };
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
