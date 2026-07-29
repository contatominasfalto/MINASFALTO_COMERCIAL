CREATE TABLE IF NOT EXISTS licitacao_status (
  id int AUTO_INCREMENT NOT NULL,
  nome varchar(120) NOT NULL,
  criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY licitacao_status_nome_unique (nome),
  INDEX licitacao_status_nome_idx (nome)
);

CREATE TABLE IF NOT EXISTS licitacao_plataformas (
  id int AUTO_INCREMENT NOT NULL,
  nome varchar(180) NOT NULL,
  link text DEFAULT (''),
  criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX licitacao_plataformas_nome_idx (nome)
);

CREATE TABLE IF NOT EXISTS licitacao_vendedores (
  id int AUTO_INCREMENT NOT NULL,
  nome varchar(180) NOT NULL,
  criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY licitacao_vendedores_nome_unique (nome),
  INDEX licitacao_vendedores_nome_idx (nome)
);

CREATE TABLE IF NOT EXISTS licitacoes (
  id int AUTO_INCREMENT NOT NULL,
  data varchar(10) NULL,
  orgao varchar(255) NOT NULL,
  cidade varchar(120) NULL,
  status varchar(120) DEFAULT 'Pendente',
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
);

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
  criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX licitacao_atas_licitacao_idx (licitacaoId),
  INDEX licitacao_atas_vendedor_idx (vendedorId)
);

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
);
