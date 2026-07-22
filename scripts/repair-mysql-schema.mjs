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
      numeroDocumento varchar(80) NULL,
      status enum('Nfe','Outros') NOT NULL DEFAULT 'Nfe',
      data varchar(10) NULL,
      valor decimal(18,2) DEFAULT '0',
      descricao text DEFAULT (''),
      criadoPor varchar(100) DEFAULT 'Sistema',
      criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX pedido_obra_receitas_pedidoObraId_idx (pedidoObraId),
      INDEX pedido_obra_receitas_pedidoNum_idx (pedidoNum)
    )
  `);

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
