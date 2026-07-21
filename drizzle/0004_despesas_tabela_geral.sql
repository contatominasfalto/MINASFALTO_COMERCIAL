CREATE TABLE `despesas_tabela_geral` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceKey` varchar(191) NOT NULL,
  `codigoFornecedorCliente` varchar(50),
  `fornecedorCliente` varchar(255),
  `numeroDocumento` varchar(80),
  `tipoConta` varchar(50),
  `tipoDocumento` varchar(100),
  `dataEmissao` varchar(10),
  `dataVencimento` varchar(10),
  `valorTotalDocumento` decimal(18,2) DEFAULT '0',
  `complemento` text DEFAULT (''),
  `observacoesAprovacao` text DEFAULT (''),
  `situacao` varchar(80),
  `criadoEm` timestamp DEFAULT now(),
  `atualizadoEm` timestamp DEFAULT now() ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `despesas_tabela_geral_id` PRIMARY KEY(`id`),
  CONSTRAINT `despesas_tabela_geral_sourceKey_unique` UNIQUE(`sourceKey`)
);
--> statement-breakpoint
CREATE INDEX `despesas_sourceKey_idx` ON `despesas_tabela_geral` (`sourceKey`);
--> statement-breakpoint
CREATE INDEX `despesas_fornecedor_idx` ON `despesas_tabela_geral` (`fornecedorCliente`);
--> statement-breakpoint
CREATE INDEX `despesas_documento_idx` ON `despesas_tabela_geral` (`numeroDocumento`);
--> statement-breakpoint
CREATE INDEX `despesas_vencimento_idx` ON `despesas_tabela_geral` (`dataVencimento`);
