CREATE TABLE `pedido_obra_receitas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pedidoObraId` int NOT NULL,
  `pedidoNum` varchar(50) NOT NULL,
  `numeroDocumento` varchar(80),
  `status` enum('Nfe','Outros') NOT NULL DEFAULT 'Nfe',
  `data` varchar(10),
  `valor` decimal(18,2) DEFAULT '0',
  `descricao` text DEFAULT (''),
  `criadoPor` varchar(100) DEFAULT 'Sistema',
  `criadoEm` timestamp DEFAULT CURRENT_TIMESTAMP,
  `atualizadoEm` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `pedido_obra_receitas_pedidoObraId_idx` (`pedidoObraId`),
  INDEX `pedido_obra_receitas_pedidoNum_idx` (`pedidoNum`)
);
