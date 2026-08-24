CREATE TABLE IF NOT EXISTS `compras_fornecedores` (
  `id` int NOT NULL AUTO_INCREMENT, `nome` varchar(180) NOT NULL, `documento` varchar(30) NULL,
  `telefone` varchar(80) NULL, `email` varchar(180) NULL, `endereco` varchar(500) NULL,
  `ativo` boolean NOT NULL DEFAULT true, `origem_planilha` boolean NOT NULL DEFAULT false,
  `fornecedor_nota` boolean NOT NULL DEFAULT true, `fornecedor_item` boolean NOT NULL DEFAULT false,
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `compras_fornecedor_nome_uq` (`nome`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `compras_materiais` (
  `id` int NOT NULL AUTO_INCREMENT, `descricao` varchar(300) NOT NULL, `categoria` varchar(120) NULL, `unidade` varchar(30) NULL,
  `ativo` boolean NOT NULL DEFAULT true, `origem_planilha` boolean NOT NULL DEFAULT false,
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `compras_material_descricao_uq` (`descricao`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `compras_orcamentos` (
  `id` int NOT NULL AUTO_INCREMENT, `numero` varchar(40) NOT NULL, `titulo` varchar(220) NOT NULL,
  `data_orcamento` date NOT NULL, `status` enum('EM_COTACAO','AGUARDANDO_DEFINICAO','COMPRADO','CANCELADO') NOT NULL DEFAULT 'EM_COTACAO',
  `observacoes` text NULL, `fornecedor_escolhido_id` int NULL, `valor_cotado` decimal(15,2) NOT NULL DEFAULT 0,
  `valor_negociado` decimal(15,2) NOT NULL DEFAULT 0, `valor_pago` decimal(15,2) NOT NULL DEFAULT 0,
  `origem_planilha` boolean NOT NULL DEFAULT false, `origem_referencia` varchar(180) NULL,
  `criado_por` varchar(120) NOT NULL, `atualizado_por` varchar(120) NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `compras_orcamento_numero_uq` (`numero`), KEY `compras_orcamento_data_idx` (`data_orcamento`),
  CONSTRAINT `compras_orcamento_fornecedor_fk` FOREIGN KEY (`fornecedor_escolhido_id`) REFERENCES `compras_fornecedores` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `compras_orcamento_itens` (
  `id` int NOT NULL AUTO_INCREMENT, `orcamento_id` int NOT NULL, `material_id` int NULL, `descricao` varchar(300) NOT NULL,
  `quantidade` decimal(15,3) NOT NULL DEFAULT 1, `unidade` varchar(30) NULL, `ordem` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`), KEY `compras_item_orcamento_idx` (`orcamento_id`),
  CONSTRAINT `compras_item_orcamento_fk` FOREIGN KEY (`orcamento_id`) REFERENCES `compras_orcamentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_item_material_fk` FOREIGN KEY (`material_id`) REFERENCES `compras_materiais` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `compras_orcamento_ofertas` (
  `id` int NOT NULL AUTO_INCREMENT, `orcamento_id` int NOT NULL, `item_id` int NOT NULL, `fornecedor_id` int NOT NULL,
  `valor_unitario` decimal(15,4) NOT NULL DEFAULT 0, `valor_total` decimal(15,2) NOT NULL DEFAULT 0,
  `prazo_entrega` varchar(120) NULL, `condicao_pagamento` varchar(180) NULL, `selecionada` boolean NOT NULL DEFAULT false,
  PRIMARY KEY (`id`), UNIQUE KEY `compras_oferta_uq` (`item_id`,`fornecedor_id`), KEY `compras_oferta_orcamento_idx` (`orcamento_id`),
  CONSTRAINT `compras_oferta_orcamento_fk` FOREIGN KEY (`orcamento_id`) REFERENCES `compras_orcamentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_oferta_item_fk` FOREIGN KEY (`item_id`) REFERENCES `compras_orcamento_itens` (`id`) ON DELETE CASCADE,
  CONSTRAINT `compras_oferta_fornecedor_fk` FOREIGN KEY (`fornecedor_id`) REFERENCES `compras_fornecedores` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `compras_importacoes` (
  `id` int NOT NULL AUTO_INCREMENT, `arquivo` varchar(300) NOT NULL, `hash_arquivo` char(64) NOT NULL, `status` varchar(30) NOT NULL,
  `resumo` text NULL, `importado_por` varchar(120) NOT NULL, `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `compras_importacao_hash_uq` (`hash_arquivo`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `compras_importacao_celulas` (
  `id` bigint NOT NULL AUTO_INCREMENT, `importacao_id` int NOT NULL, `aba` varchar(150) NOT NULL, `celula` varchar(20) NOT NULL,
  `valor` text NULL, `formula` text NULL, PRIMARY KEY (`id`), UNIQUE KEY `compras_importacao_celula_uq` (`importacao_id`,`aba`,`celula`),
  CONSTRAINT `compras_importacao_fk` FOREIGN KEY (`importacao_id`) REFERENCES `compras_importacoes` (`id`) ON DELETE CASCADE
);
