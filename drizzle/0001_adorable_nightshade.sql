CREATE TABLE `contatos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` int NOT NULL,
	`pedidoNum` varchar(50) NOT NULL,
	`tipo` enum('Ligação','E-mail','WhatsApp','Visita','Outro') DEFAULT 'Ligação',
	`descricao` text,
	`dataContato` timestamp DEFAULT (now()),
	`usuario` varchar(100) DEFAULT 'Sistema',
	CONSTRAINT `contatos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` int NOT NULL,
	`pedidoNum` varchar(50) NOT NULL,
	`campo` varchar(100) NOT NULL,
	`valorAnterior` text,
	`valorNovo` text,
	`usuario` varchar(100) DEFAULT 'Sistema',
	`dataHora` timestamp DEFAULT (now()),
	CONSTRAINT `historico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dataPedido` varchar(10),
	`cliente` varchar(255) NOT NULL,
	`pedido` varchar(50) NOT NULL,
	`situacao` varchar(50) DEFAULT 'Aprovado',
	`qtde` decimal(18,3) DEFAULT '0',
	`valorUnit` decimal(18,2) DEFAULT '0',
	`totalPedido` decimal(18,2) DEFAULT '0',
	`saldo` decimal(18,2) DEFAULT '0',
	`percentual` decimal(5,2) DEFAULT '0',
	`prioridade` enum('NORMAL','PRIORIDADE') DEFAULT 'NORMAL',
	`qtdeGranel` decimal(18,3) DEFAULT '0',
	`qtdeTapFacil` decimal(18,3) DEFAULT '0',
	`status` enum('PENDENTE','SAÍDA OK','CANCELADO') DEFAULT 'PENDENTE',
	`dataEntrega` varchar(10),
	`observacoes` text DEFAULT (''),
	`criadoEm` timestamp DEFAULT (now()),
	`atualizadoEm` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pedidos_id` PRIMARY KEY(`id`),
	CONSTRAINT `pedidos_pedido_unique` UNIQUE(`pedido`)
);
--> statement-breakpoint
CREATE TABLE `sincronizacaoCrti` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pedidoId` int,
	`pedidoNum` varchar(50) NOT NULL,
	`tipoPedido` varchar(100),
	`statusCrti` varchar(50),
	`statusLocal` enum('PENDENTE','SAÍDA OK','CANCELADO'),
	`dataImportacao` timestamp DEFAULT (now()),
	`dataUltimaSincronizacao` timestamp,
	CONSTRAINT `sincronizacaoCrti_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `profile` enum('admfull','comercial','subcomercial','gerencia','diretoria') DEFAULT 'comercial';--> statement-breakpoint
CREATE INDEX `contatos_pedidoId_idx` ON `contatos` (`pedidoId`);--> statement-breakpoint
CREATE INDEX `contatos_pedidoNum_idx` ON `contatos` (`pedidoNum`);--> statement-breakpoint
CREATE INDEX `historico_pedidoId_idx` ON `historico` (`pedidoId`);--> statement-breakpoint
CREATE INDEX `historico_pedidoNum_idx` ON `historico` (`pedidoNum`);--> statement-breakpoint
CREATE INDEX `pedido_idx` ON `pedidos` (`pedido`);--> statement-breakpoint
CREATE INDEX `cliente_idx` ON `pedidos` (`cliente`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `pedidos` (`status`);--> statement-breakpoint
CREATE INDEX `prioridade_idx` ON `pedidos` (`prioridade`);--> statement-breakpoint
CREATE INDEX `sincronizacao_pedidoNum_idx` ON `sincronizacaoCrti` (`pedidoNum`);