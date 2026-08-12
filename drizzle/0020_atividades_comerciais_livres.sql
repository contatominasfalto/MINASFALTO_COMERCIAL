ALTER TABLE `pedido_atividades`
  MODIFY COLUMN `pedidoId` int NULL,
  MODIFY COLUMN `pedidoNum` varchar(50) NULL,
  MODIFY COLUMN `cliente` varchar(255) NULL;

UPDATE `pedido_atividades`
SET `pedidoId` = NULL,
    `pedidoNum` = NULL,
    `cliente` = NULL;
