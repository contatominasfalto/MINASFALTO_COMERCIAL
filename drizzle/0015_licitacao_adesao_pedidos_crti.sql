CREATE TABLE IF NOT EXISTS licitacao_adesao_pedidos_crti (
  id int AUTO_INCREMENT NOT NULL,
  adesaoId int NOT NULL,
  licitacaoId int NOT NULL,
  pedidoCrti varchar(50) NOT NULL,
  cliente varchar(255) NULL,
  dataPedido varchar(10) NULL,
  statusPedido varchar(80) NULL,
  quantidade decimal(18,3) DEFAULT '0',
  valorTotal decimal(18,2) DEFAULT '0',
  criadoPor varchar(100) DEFAULT 'Sistema',
  criadoEm timestamp DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY licitacao_adesao_pedidos_pedido_unique (pedidoCrti),
  INDEX licitacao_adesao_pedidos_adesao_idx (adesaoId),
  INDEX licitacao_adesao_pedidos_licitacao_idx (licitacaoId)
);
