ALTER TABLE pedido_obra_receitas
  ADD COLUMN despesaTabelaGeralId int NULL AFTER pedidoNum,
  ADD COLUMN codigoFornecedorCliente varchar(50) NULL AFTER despesaTabelaGeralId,
  ADD COLUMN fornecedorCliente varchar(255) NULL AFTER codigoFornecedorCliente,
  ADD COLUMN tipoConta varchar(50) NULL AFTER tipoReceitaOutros,
  ADD COLUMN tipoDocumento varchar(100) NULL AFTER tipoConta,
  ADD COLUMN dataEmissao varchar(10) NULL AFTER tipoDocumento,
  ADD COLUMN dataVencimento varchar(10) NULL AFTER dataEmissao,
  ADD COLUMN valorTotalDocumento decimal(18,2) DEFAULT '0' AFTER dataVencimento;

CREATE INDEX pedido_obra_receitas_despesaTabelaGeralId_idx
  ON pedido_obra_receitas (despesaTabelaGeralId);
