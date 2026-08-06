import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
const sourceUrl = process.env.ALIMENTACAO_LEGACY_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
if (!sourceUrl || !targetUrl) throw new Error("Defina ALIMENTACAO_LEGACY_DATABASE_URL e DATABASE_URL.");
if (sourceUrl === targetUrl) throw new Error("Origem e destino não podem ser o mesmo banco.");

const source = await mysql.createConnection(sourceUrl);
const target = await mysql.createConnection(targetUrl);
const report = { modo: apply ? "APPLY" : "DRY-RUN", origem: {}, inconsistencias: [] };
try {
  for (const table of ["funcionarios", "fornecedores", "refeicoes", "custos"]) {
    const [[row]] = await source.query(`SELECT COUNT(*) total FROM \`${table}\``);
    report.origem[table] = Number(row.total);
  }
  const [orphans] = await source.query(`SELECT r.id FROM refeicoes r LEFT JOIN funcionarios f ON f.id=r.funcionario_id LEFT JOIN fornecedores x ON x.id=r.fornecedor_id WHERE f.id IS NULL OR x.id IS NULL`);
  if (orphans.length) report.inconsistencias.push({ tipo: "refeicoes_orfas", ids: orphans.map(r => r.id) });
  console.log(JSON.stringify(report, null, 2));
  if (!apply) { console.log("Dry-run concluído. Nenhum dado foi alterado. Use --apply após validar o relatório."); process.exitCode = report.inconsistencias.length ? 2 : 0; }
  else {
    if (report.inconsistencias.length) throw new Error("Migração interrompida: corrija as inconsistências do dry-run.");
    await target.beginTransaction();
    const [funcs] = await source.query("SELECT id,nome,setor,ativo FROM funcionarios");
    for (const r of funcs) await target.execute(`INSERT INTO alimentacao_funcionarios(nome,setor,ativo,origem_sistema,origem_id) VALUES(?,?,?,'legado_alimentacao',?) ON DUPLICATE KEY UPDATE nome=VALUES(nome),setor=VALUES(setor),ativo=VALUES(ativo)`, [r.nome,r.setor,Boolean(r.ativo),String(r.id)]);
    const [forns] = await source.query("SELECT id,nome,valor_refeicao,ativo FROM fornecedores");
    for (const r of forns) await target.execute(`INSERT INTO alimentacao_fornecedores(nome,valor_refeicao,ativo,origem_sistema,origem_id) VALUES(?,?,?,'legado_alimentacao',?) ON DUPLICATE KEY UPDATE nome=VALUES(nome),valor_refeicao=VALUES(valor_refeicao),ativo=VALUES(ativo)`, [r.nome,r.valor_refeicao,Boolean(r.ativo),String(r.id)]);
    const [custos] = await source.query("SELECT id,descricao,categoria,valor,data_custo FROM custos");
    for (const r of custos) await target.execute(`INSERT INTO alimentacao_custos_extras(descricao,categoria,valor,data_custo,criado_por,origem_sistema,origem_id) VALUES(?,?,?,?,'Migração','legado_alimentacao',?) ON DUPLICATE KEY UPDATE descricao=VALUES(descricao),categoria=VALUES(categoria),valor=VALUES(valor),data_custo=VALUES(data_custo)`, [r.descricao,r.categoria,r.valor,r.data_custo,String(r.id)]);
    const [refeicoes] = await source.query("SELECT * FROM refeicoes ORDER BY id");
    for (const r of refeicoes) {
      const origemGrupo = r.numero_nota ? `nota:${r.fornecedor_id}:${String(r.data_refeicao).slice(0,10)}:${r.numero_nota}` : `refeicao:${r.id}`;
      const [[forn]] = await target.query("SELECT id FROM alimentacao_fornecedores WHERE origem_sistema='legado_alimentacao' AND origem_id=?", [String(r.fornecedor_id)]);
      const [[func]] = await target.query("SELECT id FROM alimentacao_funcionarios WHERE origem_sistema='legado_alimentacao' AND origem_id=?", [String(r.funcionario_id)]);
      await target.execute(`INSERT INTO alimentacao_lancamentos(fornecedor_id,numero_nota,tipo,data_refeicao,valor_extra,observacao,token_idempotencia,criado_por,atualizado_por,origem_sistema,origem_id) VALUES(?,?,?,?,?,?,?,'Migração','Migração','legado_alimentacao',?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [forn.id,r.numero_nota,r.tipo,String(r.data_refeicao).slice(0,10),r.valor_extra||0,r.observacao,`legacy-${origemGrupo}`,origemGrupo]);
      const [[lanc]] = await target.query("SELECT id FROM alimentacao_lancamentos WHERE origem_sistema='legado_alimentacao' AND origem_id=?", [origemGrupo]);
      await target.execute(`INSERT INTO alimentacao_lancamento_itens(lancamento_id,funcionario_id,quantidade,valor_unitario,valor_total,origem_sistema,origem_id) VALUES(?,?,?,?,?,'legado_alimentacao',?) ON DUPLICATE KEY UPDATE quantidade=VALUES(quantidade),valor_unitario=VALUES(valor_unitario),valor_total=VALUES(valor_total)`, [lanc.id,func.id,r.quantidade,r.valor_unitario,r.valor_total,String(r.id)]);
    }
    await target.commit(); console.log("Migração aplicada com sucesso.");
  }
} catch (error) { if (apply) await target.rollback().catch(()=>{}); throw error; }
finally { await source.end(); await target.end(); }
