ALTER TABLE licitacao_atas
  ADD COLUMN quantidadeMaximaAdesoes int DEFAULT 0 AFTER observacoes;

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
);
