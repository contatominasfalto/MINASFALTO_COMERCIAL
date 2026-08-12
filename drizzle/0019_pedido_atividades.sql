CREATE TABLE IF NOT EXISTS `pedido_atividades` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pedidoId` int NOT NULL,
  `pedidoNum` varchar(50) NOT NULL,
  `cliente` varchar(255) NOT NULL,
  `descricao` text NOT NULL,
  `criadoPor` varchar(100) DEFAULT 'Sistema',
  `criadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizadoEm` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pedido_atividades_id` PRIMARY KEY(`id`),
  INDEX `pedido_atividades_pedido_idx` (`pedidoId`),
  INDEX `pedido_atividades_data_idx` (`criadoEm`)
);
