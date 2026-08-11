ALTER TABLE licitacao_pedidos_crti
  ADD COLUMN origem varchar(20) NOT NULL DEFAULT 'CRTI' AFTER pedidoCrti;
