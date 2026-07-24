CREATE TABLE IF NOT EXISTS `pedido_obra_resultado_alocacoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pedidoObraId` int NOT NULL,
  `pedidoNum` varchar(50) NOT NULL,
  `itemTipo` enum('receita','despesa','custo') NOT NULL,
  `itemId` int NOT NULL,
  `mesReferencia` varchar(7) NOT NULL,
  `criadoPor` varchar(100) DEFAULT 'Sistema',
  `criadoEm` timestamp DEFAULT CURRENT_TIMESTAMP,
  `atualizadoEm` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pedido_obra_resultado_alocacoes_item_unique` (`pedidoObraId`, `itemTipo`, `itemId`),
  INDEX `pedido_obra_resultado_alocacoes_pedidoObraId_idx` (`pedidoObraId`),
  INDEX `pedido_obra_resultado_alocacoes_pedidoNum_idx` (`pedidoNum`)
);
