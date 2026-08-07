import type mysql from "mysql2/promise";
import { getMysqlPool } from "./db";
import { dinheiro, totalItem } from "./alimentacao-rules";

export type Filtros = {
  inicio?: string;
  fim?: string;
  fornecedorId?: number;
  funcionarioId?: number;
  setor?: string;
  tipo?: string;
};

function whereRelatorio(f: Filtros) {
  const parts = ["l.excluido_em IS NULL"];
  const values: unknown[] = [];
  if (f.inicio) {
    parts.push("l.data_refeicao >= ?");
    values.push(f.inicio);
  }
  if (f.fim) {
    parts.push("l.data_refeicao <= ?");
    values.push(f.fim);
  }
  if (f.fornecedorId) {
    parts.push("l.fornecedor_id = ?");
    values.push(f.fornecedorId);
  }
  if (f.funcionarioId) {
    parts.push("i.funcionario_id = ?");
    values.push(f.funcionarioId);
  }
  if (f.setor) {
    parts.push("fn.setor = ?");
    values.push(f.setor);
  }
  if (f.tipo) {
    parts.push("l.tipo = ?");
    values.push(f.tipo);
  }
  return { sql: parts.join(" AND "), values };
}

export async function cadastros() {
  const pool = await getMysqlPool();
  const [[funcionarios], [fornecedores], [custos]] = await Promise.all([
    pool.query(
      "SELECT id,nome,setor,ativo FROM alimentacao_funcionarios ORDER BY ativo DESC,nome"
    ),
    pool.query(
      "SELECT id,nome,valor_refeicao valorRefeicao,ativo FROM alimentacao_fornecedores ORDER BY ativo DESC,nome"
    ),
    pool.query(
      "SELECT id,descricao,categoria,valor,data_custo dataCusto FROM alimentacao_custos_extras WHERE excluido_em IS NULL ORDER BY data_custo DESC,id DESC"
    ),
  ]);
  return { funcionarios, fornecedores, custos } as any;
}

export async function salvarFuncionario(data: {
  id?: number;
  nome: string;
  setor: string;
  ativo: boolean;
}) {
  const pool = await getMysqlPool();
  if (data.id)
    await pool.execute(
      "UPDATE alimentacao_funcionarios SET nome=?,setor=?,ativo=? WHERE id=?",
      [data.nome.trim(), data.setor.trim(), data.ativo, data.id]
    );
  else
    await pool.execute(
      "INSERT INTO alimentacao_funcionarios(nome,setor,ativo) VALUES(?,?,?)",
      [data.nome.trim(), data.setor.trim(), data.ativo]
    );
  return { ok: true };
}

export async function excluirFuncionario(id: number) {
  const pool = await getMysqlPool();
  const [vinculos] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) total FROM alimentacao_lancamento_itens WHERE funcionario_id=?",
    [id]
  );
  if (Number(vinculos[0]?.total || 0) > 0) {
    throw new Error(
      "Funcionário possui lançamentos vinculados. Inative o cadastro para preservar o histórico."
    );
  }
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "DELETE FROM alimentacao_funcionarios WHERE id=?",
    [id]
  );
  if (!result.affectedRows) throw new Error("Funcionário não encontrado.");
  return { ok: true };
}

export async function salvarFornecedor(data: {
  id?: number;
  nome: string;
  valorRefeicao: number;
  ativo: boolean;
}) {
  const pool = await getMysqlPool();
  if (data.id)
    await pool.execute(
      "UPDATE alimentacao_fornecedores SET nome=?,valor_refeicao=?,ativo=? WHERE id=?",
      [data.nome.trim(), dinheiro(data.valorRefeicao), data.ativo, data.id]
    );
  else
    await pool.execute(
      "INSERT INTO alimentacao_fornecedores(nome,valor_refeicao,ativo) VALUES(?,?,?)",
      [data.nome.trim(), dinheiro(data.valorRefeicao), data.ativo]
    );
  return { ok: true };
}

export async function excluirFornecedor(id: number) {
  const pool = await getMysqlPool();
  const [vinculos] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) total FROM alimentacao_lancamentos WHERE fornecedor_id=?",
    [id]
  );
  if (Number(vinculos[0]?.total || 0) > 0) {
    throw new Error(
      "Fornecedor possui lançamentos vinculados. Inative o cadastro para preservar o histórico."
    );
  }
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "DELETE FROM alimentacao_fornecedores WHERE id=?",
    [id]
  );
  if (!result.affectedRows) throw new Error("Fornecedor não encontrado.");
  return { ok: true };
}

export async function salvarCusto(
  data: {
    id?: number;
    descricao: string;
    categoria: string;
    valor: number;
    dataCusto: string;
  },
  usuario: string
) {
  const pool = await getMysqlPool();
  if (data.id) {
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      "UPDATE alimentacao_custos_extras SET descricao=?,categoria=?,valor=?,data_custo=? WHERE id=? AND excluido_em IS NULL",
      [
        data.descricao.trim(),
        data.categoria.trim(),
        dinheiro(data.valor),
        data.dataCusto,
        data.id,
      ]
    );
    if (!result.affectedRows) throw new Error("Custo extra não encontrado.");
  } else {
    await pool.execute(
      "INSERT INTO alimentacao_custos_extras(descricao,categoria,valor,data_custo,criado_por) VALUES(?,?,?,?,?)",
      [
        data.descricao.trim(),
        data.categoria.trim(),
        dinheiro(data.valor),
        data.dataCusto,
        usuario,
      ]
    );
  }
  return { ok: true };
}

export async function excluirCusto(
  id: number,
  motivo: string,
  usuario: string
) {
  const pool = await getMysqlPool();
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE alimentacao_custos_extras SET excluido_em=NOW(),excluido_por=?,motivo_exclusao=? WHERE id=? AND excluido_em IS NULL",
    [usuario, motivo, id]
  );
  if (!result.affectedRows) throw new Error("Custo extra não encontrado.");
  return { ok: true };
}

export async function criarLancamento(data: any, usuario: string) {
  const pool = await getMysqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id FROM alimentacao_lancamentos WHERE token_idempotencia=? FOR UPDATE",
      [data.token]
    );
    if (existing.length) {
      await conn.commit();
      return { id: existing[0].id, repetido: true };
    }
    const [forn] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id,ativo FROM alimentacao_fornecedores WHERE id=? FOR UPDATE",
      [data.fornecedorId]
    );
    if (!forn[0]?.ativo) throw new Error("Fornecedor inexistente ou inativo.");
    const uniqueIds = new Set<number>(
      data.itens.map((i: any) => Number(i.funcionarioId))
    );
    if (uniqueIds.size !== data.itens.length)
      throw new Error("Funcionário repetido no lançamento.");
    const ids = Array.from(uniqueIds);
    const [ativos] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT id FROM alimentacao_funcionarios WHERE ativo=1 AND id IN (${ids.map(() => "?").join(",")}) FOR UPDATE`,
      ids
    );
    if (ativos.length !== ids.length)
      throw new Error("Há funcionário inexistente ou inativo.");
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      "INSERT INTO alimentacao_lancamentos(fornecedor_id,numero_nota,tipo,data_refeicao,valor_extra,observacao,token_idempotencia,criado_por,atualizado_por) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        data.fornecedorId,
        data.numeroNota || null,
        data.tipo,
        data.dataRefeicao,
        dinheiro(data.valorExtra),
        data.observacao || null,
        data.token,
        usuario,
        usuario,
      ]
    );
    for (const item of data.itens) {
      const total = totalItem(item.quantidade, item.valorUnitario);
      await conn.execute(
        "INSERT INTO alimentacao_lancamento_itens(lancamento_id,funcionario_id,quantidade,valor_unitario,valor_total) VALUES(?,?,?,?,?)",
        [
          result.insertId,
          item.funcionarioId,
          item.quantidade,
          dinheiro(item.valorUnitario),
          total,
        ]
      );
    }
    await conn.commit();
    return { id: result.insertId, repetido: false };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function excluirLancamento(
  id: number,
  motivo: string,
  usuario: string
) {
  const pool = await getMysqlPool();
  const [r] = await pool.execute<mysql.ResultSetHeader>(
    "UPDATE alimentacao_lancamentos SET excluido_em=NOW(),excluido_por=?,motivo_exclusao=? WHERE id=? AND excluido_em IS NULL",
    [usuario, motivo, id]
  );
  if (!r.affectedRows)
    throw new Error("Lançamento não encontrado ou já excluído.");
  return { ok: true };
}

export async function obterLancamento(id: number) {
  const pool = await getMysqlPool();
  const [cab] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT id,fornecedor_id fornecedorId,numero_nota numeroNota,tipo,DATE_FORMAT(data_refeicao,'%Y-%m-%d') dataRefeicao,valor_extra valorExtra,observacao FROM alimentacao_lancamentos WHERE id=? AND excluido_em IS NULL",
    [id]
  );
  if (!cab[0]) throw new Error("Lançamento não encontrado.");
  const [itens] = await pool.query(
    "SELECT i.funcionario_id funcionarioId,f.nome,i.quantidade,i.valor_unitario valorUnitario FROM alimentacao_lancamento_itens i JOIN alimentacao_funcionarios f ON f.id=i.funcionario_id WHERE i.lancamento_id=? ORDER BY f.nome",
    [id]
  );
  return { ...cab[0], itens } as any;
}

export async function atualizarLancamento(
  id: number,
  data: any,
  usuario: string
) {
  const pool = await getMysqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cab] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id FROM alimentacao_lancamentos WHERE id=? AND excluido_em IS NULL FOR UPDATE",
      [id]
    );
    if (!cab.length) throw new Error("Lançamento não encontrado.");
    const [forn] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id,ativo FROM alimentacao_fornecedores WHERE id=? FOR UPDATE",
      [data.fornecedorId]
    );
    if (!forn[0]?.ativo) throw new Error("Fornecedor inexistente ou inativo.");
    const ids = Array.from(
      new Set<number>(data.itens.map((i: any) => Number(i.funcionarioId)))
    );
    if (ids.length !== data.itens.length)
      throw new Error("Funcionário repetido no lançamento.");
    const [funcs] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT id FROM alimentacao_funcionarios WHERE id IN (${ids.map(() => "?").join(",")}) FOR UPDATE`,
      ids
    );
    if (funcs.length !== ids.length)
      throw new Error("Funcionário inexistente.");
    await conn.execute(
      "UPDATE alimentacao_lancamentos SET fornecedor_id=?,numero_nota=?,tipo=?,data_refeicao=?,valor_extra=?,observacao=?,atualizado_por=? WHERE id=?",
      [
        data.fornecedorId,
        data.numeroNota || null,
        data.tipo,
        data.dataRefeicao,
        dinheiro(data.valorExtra),
        data.observacao || null,
        usuario,
        id,
      ]
    );
    await conn.execute(
      "DELETE FROM alimentacao_lancamento_itens WHERE lancamento_id=?",
      [id]
    );
    for (const item of data.itens)
      await conn.execute(
        "INSERT INTO alimentacao_lancamento_itens(lancamento_id,funcionario_id,quantidade,valor_unitario,valor_total) VALUES(?,?,?,?,?)",
        [
          id,
          item.funcionarioId,
          item.quantidade,
          dinheiro(item.valorUnitario),
          totalItem(item.quantidade, item.valorUnitario),
        ]
      );
    await conn.commit();
    return { ok: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function relatorio(f: Filtros = {}) {
  const pool = await getMysqlPool();
  const w = whereRelatorio(f);
  const [rows] = await pool.query(
    `SELECT l.id,DATE_FORMAT(l.data_refeicao,'%Y-%m-%d') dataRefeicao,l.tipo,l.numero_nota numeroNota,l.valor_extra valorExtra,
    fn.nome funcionario,fn.setor,fo.nome fornecedor,i.quantidade,i.valor_unitario valorUnitario,i.valor_total valorItens,
    (i.valor_total + CASE WHEN i.id=(SELECT MIN(i2.id) FROM alimentacao_lancamento_itens i2 WHERE i2.lancamento_id=l.id) THEN l.valor_extra ELSE 0 END) valorTotal
    FROM alimentacao_lancamentos l JOIN alimentacao_lancamento_itens i ON i.lancamento_id=l.id JOIN alimentacao_funcionarios fn ON fn.id=i.funcionario_id
    JOIN alimentacao_fornecedores fo ON fo.id=l.fornecedor_id WHERE ${w.sql} ORDER BY l.data_refeicao DESC,l.id DESC,fn.nome`,
    w.values
  );
  return rows as any[];
}

export async function painel() {
  const pool = await getMysqlPool();
  const [metricas] = await pool.query<
    mysql.RowDataPacket[]
  >(`SELECT COUNT(DISTINCT l.id) lancamentos,COALESCE(SUM(i.quantidade),0) refeicoes,
    COALESCE(SUM(i.valor_total)+(SELECT COALESCE(SUM(valor_extra),0) FROM alimentacao_lancamentos WHERE excluido_em IS NULL)+(SELECT COALESCE(SUM(valor),0) FROM alimentacao_custos_extras WHERE excluido_em IS NULL),0) custoTotal,
    (SELECT COALESCE(SUM(valor),0) FROM alimentacao_custos_extras WHERE excluido_em IS NULL) custosOperacionais,
    COUNT(DISTINCT i.funcionario_id) funcionariosAtivos FROM alimentacao_lancamentos l JOIN alimentacao_lancamento_itens i ON i.lancamento_id=l.id WHERE l.excluido_em IS NULL`);
  const [evolucao] = await pool.query(
    `SELECT DATE_FORMAT(l.data_refeicao,'%Y-%m') mes,SUM(i.valor_total)+SUM(CASE WHEN i.id=(SELECT MIN(i2.id) FROM alimentacao_lancamento_itens i2 WHERE i2.lancamento_id=l.id) THEN l.valor_extra ELSE 0 END) total FROM alimentacao_lancamentos l JOIN alimentacao_lancamento_itens i ON i.lancamento_id=l.id WHERE l.excluido_em IS NULL GROUP BY mes ORDER BY mes DESC LIMIT 12`
  );
  const [ranking] = await pool.query(
    `SELECT fn.nome,SUM(i.valor_total) total,SUM(i.quantidade) quantidade FROM alimentacao_lancamento_itens i JOIN alimentacao_lancamentos l ON l.id=i.lancamento_id JOIN alimentacao_funcionarios fn ON fn.id=i.funcionario_id WHERE l.excluido_em IS NULL GROUP BY fn.id,fn.nome ORDER BY total DESC LIMIT 10`
  );
  const [fornecedores] = await pool.query(
    `SELECT fo.nome,SUM(i.valor_total) total FROM alimentacao_lancamento_itens i JOIN alimentacao_lancamentos l ON l.id=i.lancamento_id JOIN alimentacao_fornecedores fo ON fo.id=l.fornecedor_id WHERE l.excluido_em IS NULL GROUP BY fo.id,fo.nome ORDER BY total DESC LIMIT 10`
  );
  const m = metricas[0] || {};
  return {
    metricas: {
      ...m,
      media: Number(m.refeicoes)
        ? Number(m.custoTotal) / Number(m.refeicoes)
        : 0,
    },
    evolucao,
    ranking,
    fornecedores,
  } as any;
}
