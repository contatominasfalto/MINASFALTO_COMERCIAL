CREATE TABLE IF NOT EXISTS `pedido_obra_custos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceKey` varchar(191) NOT NULL,
  `pedidoObraId` int NOT NULL,
  `pedidoNum` varchar(50) NOT NULL,
  `numeroDocumento` varchar(80),
  `dataEmissao` varchar(10),
  `valorTotal` decimal(18,2) DEFAULT '0',
  `situacao` varchar(80) DEFAULT 'Retirado',
  `complemento` text DEFAULT (''),
  `criadoEm` timestamp DEFAULT CURRENT_TIMESTAMP,
  `atualizadoEm` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pedido_obra_custos_sourceKey_unique` (`sourceKey`),
  INDEX `pedido_obra_custos_sourceKey_idx` (`sourceKey`),
  INDEX `pedido_obra_custos_pedidoObraId_idx` (`pedidoObraId`),
  INDEX `pedido_obra_custos_pedidoNum_idx` (`pedidoNum`)
);
