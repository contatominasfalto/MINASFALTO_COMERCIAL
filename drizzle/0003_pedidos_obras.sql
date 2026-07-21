CREATE TABLE `pedidos_obras` (
  `id` int AUTO_INCREMENT NOT NULL,
  `dataPedido` varchar(10),
  `cliente` varchar(255) NOT NULL,
  `pedido` varchar(50) NOT NULL,
  `situacao` varchar(50) DEFAULT 'Aprovado',
  `qtde` decimal(18,3) DEFAULT '0',
  `qtdeTapFacil` decimal(18,3) DEFAULT '0',
  `qtdeGranel` decimal(18,3) DEFAULT '0',
  `valorUnit` decimal(18,2) DEFAULT '0',
  `totalPedido` decimal(18,2) DEFAULT '0',
  `saldo` decimal(18,2) DEFAULT '0',
  `prioridade` enum('NORMAL','PRIORIDADE') DEFAULT 'NORMAL',
  `status` varchar(20) DEFAULT 'Aprovado',
  `observacoesPagamento` text DEFAULT (''),
  `observacoes` text DEFAULT (''),
  `observacoesOperador` text DEFAULT (''),
  `condicaoPagamento` text DEFAULT (''),
  `materiais` text DEFAULT (''),
  `criadoEm` timestamp DEFAULT now(),
  `atualizadoEm` timestamp DEFAULT now() ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pedidos_obras_id` PRIMARY KEY(`id`),
  CONSTRAINT `pedidos_obras_pedido_unique` UNIQUE(`pedido`)
);
--> statement-breakpoint
CREATE INDEX `pedidos_obras_pedido_idx` ON `pedidos_obras` (`pedido`);
--> statement-breakpoint
CREATE INDEX `pedidos_obras_cliente_idx` ON `pedidos_obras` (`cliente`);
--> statement-breakpoint
CREATE INDEX `pedidos_obras_status_idx` ON `pedidos_obras` (`status`);
--> statement-breakpoint
CREATE INDEX `pedidos_obras_prioridade_idx` ON `pedidos_obras` (`prioridade`);
--> statement-breakpoint
CREATE TABLE `sincronizacaoCrtiObras` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pedidoObraId` int,
  `pedidoNum` varchar(50) NOT NULL,
  `tipoPedido` varchar(100),
  `statusCrti` varchar(50),
  `dataImportacao` timestamp DEFAULT now(),
  `dataUltimaSincronizacao` timestamp,
  CONSTRAINT `sincronizacaoCrtiObras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sincronizacao_obras_pedidoNum_idx` ON `sincronizacaoCrtiObras` (`pedidoNum`);
