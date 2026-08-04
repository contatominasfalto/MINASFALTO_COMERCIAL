import "dotenv/config";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

let connection;

try {
  connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    connectTimeout: Number.parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000", 10),
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sincronizacaoCrti (
      id int AUTO_INCREMENT NOT NULL,
      pedidoId int NULL,
      pedidoNum varchar(50) NOT NULL,
      tipoPedido varchar(100) NULL,
      statusCrti varchar(50) NULL,
      statusLocal varchar(20) NULL,
      dataImportacao timestamp DEFAULT CURRENT_TIMESTAMP,
      dataUltimaSincronizacao timestamp NULL,
      PRIMARY KEY (id),
      INDEX sincronizacao_pedidoNum_idx (pedidoNum)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS pedidos_obras (
      id int AUTO_INCREMENT NOT NULL,
      dataPedido varchar(10) NULL,
      cliente varchar(255) NOT NULL,
      pedido varchar(50) NOT NULL,
      situacao varchar(50) DEFAULT 'Aprovado',
      qtde decimal(18,3) DEFAULT '0',
      qtdeTapFacil decimal(18,3) DEFAULT '0',
      qtdeGranel decimal(18,3) DEFAULT '0',
      valorUnit decimal(18,2) DEFAULT '0',
      totalPedido decimal(18,2) DEFAULT '0',
      saldo decimal(18,2) DEFAULT '0',
      prioridade enum('NORMAL','PRIORIDADE') DEFAULT 'NORMAL',
      status varchar(20) DEFAULT 'Aprovado',
      observacoesPagamento text DEFAULT (''),
      observacoes text DEFAULT (''),
      observacoesOperador text DEFAULT (''),
      condicaoPagamento text DEFAULT (''),
      materiais text DEFAULT (''),
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY pedidos_obras_pedido_unique (pedido),
      INDEX pedidos_obras_pedido_idx (pedido),
      INDEX pedidos_obras_cliente_idx (cliente),
      INDEX pedidos_obras_status_idx (status),
      INDEX pedidos_obras_prioridade_idx (prioridade)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sincronizacaoCrtiObras (
      id int AUTO_INCREMENT NOT NULL,
      pedidoObraId int NULL,
      pedidoNum varchar(50) NOT NULL,
      tipoPedido varchar(100) NULL,
      statusCrti varchar(50) NULL,
      dataImportacao timestamp DEFAULT CURRENT_TIMESTAMP,
      dataUltimaSincronizacao timestamp NULL,
      PRIMARY KEY (id),
      INDEX sincronizacao_obras_pedidoNum_idx (pedidoNum)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS despesas_tabela_geral (
      id int AUTO_INCREMENT NOT NULL,
      sourceKey varchar(191) NOT NULL,
      codigoFornecedorCliente varchar(50) NULL,
      fornecedorCliente varchar(255) NULL,
      numeroDocumento varchar(80) NULL,
      tipoConta varchar(50) NULL,
      tipoDocumento varchar(100) NULL,
      dataEmissao varchar(10) NULL,
      dataVencimento varchar(10) NULL,
      valorTotalDocumento decimal(18,2) DEFAULT '0',
      complemento text DEFAULT (''),
      observacoesAprovacao text DEFAULT (''),
      situacao varchar(80) NULL,
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY despesas_tabela_geral_sourceKey_unique (sourceKey),
      INDEX despesas_sourceKey_idx (sourceKey),
      INDEX despesas_fornecedor_idx (fornecedorCliente),
      INDEX despesas_documento_idx (numeroDocumento),
      INDEX despesas_vencimento_idx (dataVencimento)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS pedido_obra_financeiro (
      id int AUTO_INCREMENT NOT NULL,
      pedidoObraId int NOT NULL,
      pedidoNum varchar(50) NOT NULL,
      nfes decimal(18,2) DEFAULT '0',
      faturamentoDireto decimal(18,2) DEFAULT '0',
      valorTotalImposto decimal(18,2) DEFAULT '0',
      porcentagemImposto decimal(5,2) DEFAULT '17.00',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY pedido_obra_financeiro_pedidoObraId_unique (pedidoObraId),
      INDEX pedido_obra_financeiro_pedidoObraId_idx (pedidoObraId),
      INDEX pedido_obra_financeiro_pedidoNum_idx (pedidoNum)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS pedido_obra_despesas (
      id int AUTO_INCREMENT NOT NULL,
      pedidoObraId int NOT NULL,
      pedidoNum varchar(50) NOT NULL,
      despesaTabelaGeralId int NULL,
      origem enum('manual','vinculada') NOT NULL DEFAULT 'manual',
      categoria enum('Custo','Despesa','Outros') NOT NULL DEFAULT 'Despesa',
      justificativaOutros text DEFAULT (''),
      codigoFornecedorCliente varchar(50) NULL,
      fornecedorCliente varchar(255) NULL,
      numeroDocumento varchar(80) NULL,
      tipoConta varchar(50) NULL,
      tipoDocumento varchar(100) NULL,
      dataEmissao varchar(10) NULL,
      dataVencimento varchar(10) NULL,
      valorTotalDocumento decimal(18,2) DEFAULT '0',
      complemento text DEFAULT (''),
      observacoesAprovacao text DEFAULT (''),
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY pedido_obra_despesas_despesaTabelaGeralId_unique (despesaTabelaGeralId),
      INDEX pedido_obra_despesas_pedidoObraId_idx (pedidoObraId),
      INDEX pedido_obra_despesas_pedidoNum_idx (pedidoNum),
      INDEX pedido_obra_despesas_despesaTabelaGeralId_idx (despesaTabelaGeralId)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS pedido_obra_receitas (
      id int AUTO_INCREMENT NOT NULL,
      pedidoObraId int NOT NULL,
      pedidoNum varchar(50) NOT NULL,
      despesaTabelaGeralId int NULL,
      codigoFornecedorCliente varchar(50) NULL,
      fornecedorCliente varchar(255) NULL,
      numeroDocumento varchar(80) NULL,
      status enum('Nfe','Faturamento Direto','Outros') NOT NULL DEFAULT 'Nfe',
      tipoReceitaOutros text DEFAULT (''),
      tipoConta varchar(50) NULL,
      tipoDocumento varchar(100) NULL,
      dataEmissao varchar(10) NULL,
      dataVencimento varchar(10) NULL,
      valorTotalDocumento decimal(18,2) DEFAULT '0',
      data varchar(10) NULL,
      valor decimal(18,2) DEFAULT '0',
      descricao text DEFAULT (''),
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX pedido_obra_receitas_pedidoObraId_idx (pedidoObraId),
      INDEX pedido_obra_receitas_pedidoNum_idx (pedidoNum),
      INDEX pedido_obra_receitas_despesaTabelaGeralId_idx (despesaTabelaGeralId)
    )
  `);

  await connection.query(`
    ALTER TABLE pedido_obra_receitas
    MODIFY status enum('Nfe','Faturamento Direto','Outros') NOT NULL DEFAULT 'Nfe'
  `);

  const [receitaTipoOutrosColumns] = await connection.query("SHOW COLUMNS FROM pedido_obra_receitas LIKE 'tipoReceitaOutros'");
  if (receitaTipoOutrosColumns.length === 0) {
    await connection.query("ALTER TABLE pedido_obra_receitas ADD tipoReceitaOutros text DEFAULT ('') AFTER status");
  }

  const receitaColumns = [
    ["despesaTabelaGeralId", "ALTER TABLE pedido_obra_receitas ADD despesaTabelaGeralId int NULL AFTER pedidoNum"],
    ["codigoFornecedorCliente", "ALTER TABLE pedido_obra_receitas ADD codigoFornecedorCliente varchar(50) NULL AFTER despesaTabelaGeralId"],
    ["fornecedorCliente", "ALTER TABLE pedido_obra_receitas ADD fornecedorCliente varchar(255) NULL AFTER codigoFornecedorCliente"],
    ["tipoConta", "ALTER TABLE pedido_obra_receitas ADD tipoConta varchar(50) NULL AFTER tipoReceitaOutros"],
    ["tipoDocumento", "ALTER TABLE pedido_obra_receitas ADD tipoDocumento varchar(100) NULL AFTER tipoConta"],
    ["dataEmissao", "ALTER TABLE pedido_obra_receitas ADD dataEmissao varchar(10) NULL AFTER tipoDocumento"],
    ["dataVencimento", "ALTER TABLE pedido_obra_receitas ADD dataVencimento varchar(10) NULL AFTER dataEmissao"],
    ["valorTotalDocumento", "ALTER TABLE pedido_obra_receitas ADD valorTotalDocumento decimal(18,2) DEFAULT '0' AFTER dataVencimento"],
  ];
  for (const [columnName, ddl] of receitaColumns) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM pedido_obra_receitas LIKE '${columnName}'`);
    if (columns.length === 0) await connection.query(ddl);
  }

  try {
    await connection.query("CREATE INDEX pedido_obra_receitas_despesaTabelaGeralId_idx ON pedido_obra_receitas (despesaTabelaGeralId)");
  } catch (error) {
    if (error.code !== "ER_DUP_KEYNAME") throw error;
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS pedido_obra_custos (
      id int AUTO_INCREMENT NOT NULL,
      sourceKey varchar(191) NOT NULL,
      pedidoObraId int NOT NULL,
      pedidoNum varchar(50) NOT NULL,
      numeroDocumento varchar(80) NULL,
      dataEmissao varchar(10) NULL,
      valorTotal decimal(18,2) DEFAULT '0',
      situacao varchar(80) DEFAULT 'Retirado',
      complemento text DEFAULT (''),
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY pedido_obra_custos_sourceKey_unique (sourceKey),
      INDEX pedido_obra_custos_sourceKey_idx (sourceKey),
      INDEX pedido_obra_custos_pedidoObraId_idx (pedidoObraId),
      INDEX pedido_obra_custos_pedidoNum_idx (pedidoNum)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS pedido_obra_resultado_alocacoes (
      id int AUTO_INCREMENT NOT NULL,
      pedidoObraId int NOT NULL,
      pedidoNum varchar(50) NOT NULL,
      itemTipo enum('receita','despesa','custo') NOT NULL,
      itemId int NOT NULL,
      mesReferencia varchar(7) NOT NULL,
      dataReferencia varchar(10) NULL,
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY pedido_obra_resultado_alocacoes_item_unique (pedidoObraId, itemTipo, itemId),
      INDEX pedido_obra_resultado_alocacoes_pedidoObraId_idx (pedidoObraId),
      INDEX pedido_obra_resultado_alocacoes_pedidoNum_idx (pedidoNum)
    )
  `);

  const [resultadoAlocacaoDataColumns] = await connection.query("SHOW COLUMNS FROM pedido_obra_resultado_alocacoes LIKE 'dataReferencia'");
  if (resultadoAlocacaoDataColumns.length === 0) {
    await connection.query("ALTER TABLE pedido_obra_resultado_alocacoes ADD dataReferencia varchar(10) NULL AFTER mesReferencia");
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacao_status (
      id int AUTO_INCREMENT NOT NULL,
      nome varchar(120) NOT NULL,
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY licitacao_status_nome_unique (nome),
      INDEX licitacao_status_nome_idx (nome)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacao_plataformas (
      id int AUTO_INCREMENT NOT NULL,
      nome varchar(180) NOT NULL,
      link text DEFAULT (''),
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX licitacao_plataformas_nome_idx (nome)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacao_vendedores (
      id int AUTO_INCREMENT NOT NULL,
      nome varchar(180) NOT NULL,
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY licitacao_vendedores_nome_unique (nome),
      INDEX licitacao_vendedores_nome_idx (nome)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacoes (
      id int AUTO_INCREMENT NOT NULL,
      data varchar(10) NULL,
      orgao varchar(255) NOT NULL,
      cidade varchar(120) NULL,
      status varchar(120) DEFAULT 'Pendente',
      plataformaId int NULL,
      horaInicioDisputa varchar(8) NULL,
      item varchar(120) NULL,
      tipo varchar(120) NULL,
      qtdeSc decimal(18,3) DEFAULT '0',
      valorUnit decimal(18,2) DEFAULT '0',
      lanceLimite decimal(18,2) DEFAULT '0',
      valorAdjudicado decimal(18,2) DEFAULT '0',
      qtdeTn decimal(18,3) DEFAULT '0',
      valorInicialContrato decimal(18,2) DEFAULT '0',
      kmDistancia decimal(18,2) DEFAULT '0',
      potencialCliente varchar(80) NULL,
      regiao varchar(120) NULL,
      statusContrato varchar(80) DEFAULT 'Pendente',
      ataVendedorId int NULL,
      ataVendedorNome varchar(180) DEFAULT 'NA',
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX licitacoes_data_idx (data),
      INDEX licitacoes_orgao_idx (orgao),
      INDEX licitacoes_status_idx (status)
    )
  `);

  try {
    await connection.query("ALTER TABLE licitacoes ADD plataformaId int NULL AFTER status");
  } catch (error) {
    if (!String(error?.message || "").includes("Duplicate column name")) throw error;
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacao_atas (
      id int AUTO_INCREMENT NOT NULL,
      licitacaoId int NOT NULL,
      vendedorId int NULL,
      vendedorNome varchar(180) DEFAULT 'NA',
      validadeAta varchar(10) NULL,
      quantidadeOriginal decimal(18,3) DEFAULT '0',
      limiteIndividual decimal(18,3) DEFAULT '0',
      limiteColetivo decimal(18,3) DEFAULT '0',
      observacoes text DEFAULT (''),
      quantidadeMaximaAdesoes int DEFAULT 0,
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX licitacao_atas_licitacao_idx (licitacaoId),
      INDEX licitacao_atas_vendedor_idx (vendedorId)
    )
  `);

  const [ataMaxAdesoesColumns] = await connection.query("SHOW COLUMNS FROM licitacao_atas LIKE 'quantidadeMaximaAdesoes'");
  if (ataMaxAdesoesColumns.length === 0) {
    await connection.query("ALTER TABLE licitacao_atas ADD quantidadeMaximaAdesoes int DEFAULT 0 AFTER observacoes");
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacao_adesoes (
      id int AUTO_INCREMENT NOT NULL,
      licitacaoId int NOT NULL,
      orgaoAderente varchar(255) NOT NULL,
      dataAdesao varchar(10) NULL,
      quantidade decimal(18,3) DEFAULT '0',
      entregue boolean DEFAULT false,
      dataEntrega varchar(10) NULL,
      pedidoCrti varchar(50) NULL,
      clienteCrti varchar(255) NULL,
      dataPedidoCrti varchar(10) NULL,
      statusPedidoCrti varchar(80) NULL,
      quantidadePedidoCrti decimal(18,3) DEFAULT '0',
      valorTotalPedidoCrti decimal(18,2) DEFAULT '0',
      observacoes text DEFAULT (''),
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX licitacao_adesoes_licitacao_idx (licitacaoId),
      INDEX licitacao_adesoes_pedido_idx (pedidoCrti)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS licitacao_pedidos_crti (
      id int AUTO_INCREMENT NOT NULL,
      licitacaoId int NOT NULL,
      pedidoCrti varchar(50) NOT NULL,
      cliente varchar(255) NULL,
      dataPedido varchar(10) NULL,
      statusPedido varchar(80) NULL,
      quantidade decimal(18,3) DEFAULT '0',
      valorTotal decimal(18,2) DEFAULT '0',
      saldoEntrega decimal(18,3) DEFAULT '0',
      observacoes text DEFAULT (''),
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX licitacao_pedidos_crti_licitacao_idx (licitacaoId),
      INDEX licitacao_pedidos_crti_pedido_idx (pedidoCrti)
    )
  `);

  await connection.query("INSERT IGNORE INTO licitacao_status (nome) VALUES ('Pendente'), ('Encerrado'), ('Documentacao Separada'), ('Adjudicado')");

  const [userProfileColumns] = await connection.query("SHOW COLUMNS FROM users LIKE 'profile'");
  if (userProfileColumns.length === 0) {
    await connection.query(
      "ALTER TABLE users ADD profile enum('admfull','comercial','subcomercial','gerencia','diretoria') DEFAULT 'comercial'",
    );
  }

  await connection.query("ALTER TABLE pedidos MODIFY status varchar(20) DEFAULT 'PENDENTE'");
  await connection.query("ALTER TABLE sincronizacaoCrti MODIFY statusLocal varchar(20) NULL");
  await connection.query("ALTER TABLE contatos MODIFY tipo varchar(30) DEFAULT 'Ligação'");
  await connection.query("UPDATE pedidos SET status = 'SAÍDA OK' WHERE status = '' OR status LIKE 'SA%DA OK'");

  console.log("Schema MySQL reparado com sucesso.");
} catch (error) {
  console.error("Falha ao reparar schema MySQL.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await connection?.end();
}
