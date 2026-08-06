CREATE TABLE `alimentacao_funcionarios` (
  `id` int NOT NULL AUTO_INCREMENT, `nome` varchar(180) NOT NULL, `setor` varchar(120) NOT NULL,
  `ativo` boolean NOT NULL DEFAULT true, `origem_sistema` varchar(40), `origem_id` varchar(80),
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `alimentacao_func_origem_uq` (`origem_sistema`,`origem_id`), KEY `alimentacao_func_nome_idx` (`nome`), KEY `alimentacao_func_ativo_idx` (`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `alimentacao_fornecedores` (
  `id` int NOT NULL AUTO_INCREMENT, `nome` varchar(180) NOT NULL, `valor_refeicao` decimal(12,2) NOT NULL DEFAULT 0,
  `ativo` boolean NOT NULL DEFAULT true, `origem_sistema` varchar(40), `origem_id` varchar(80),
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `alimentacao_forn_origem_uq` (`origem_sistema`,`origem_id`), KEY `alimentacao_forn_nome_idx` (`nome`), KEY `alimentacao_forn_ativo_idx` (`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `alimentacao_lancamentos` (
  `id` int NOT NULL AUTO_INCREMENT, `fornecedor_id` int NOT NULL, `numero_nota` varchar(80), `tipo` varchar(30) NOT NULL,
  `data_refeicao` date NOT NULL, `valor_extra` decimal(12,2) NOT NULL DEFAULT 0, `observacao` text,
  `token_idempotencia` varchar(80) NOT NULL, `criado_por` varchar(120) NOT NULL, `atualizado_por` varchar(120) NOT NULL,
  `excluido_em` timestamp NULL, `excluido_por` varchar(120), `motivo_exclusao` varchar(500), `origem_sistema` varchar(40), `origem_id` varchar(120),
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `alimentacao_lanc_token_uq` (`token_idempotencia`), UNIQUE KEY `alimentacao_lanc_origem_uq` (`origem_sistema`,`origem_id`),
  KEY `alimentacao_lanc_data_idx` (`data_refeicao`), KEY `alimentacao_lanc_forn_idx` (`fornecedor_id`), KEY `alimentacao_lanc_excluido_idx` (`excluido_em`),
  CONSTRAINT `alimentacao_lanc_forn_fk` FOREIGN KEY (`fornecedor_id`) REFERENCES `alimentacao_fornecedores` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `alimentacao_lancamento_itens` (
  `id` int NOT NULL AUTO_INCREMENT, `lancamento_id` int NOT NULL, `funcionario_id` int NOT NULL, `quantidade` int NOT NULL,
  `valor_unitario` decimal(12,2) NOT NULL, `valor_total` decimal(14,2) NOT NULL, `origem_sistema` varchar(40), `origem_id` varchar(80),
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `alimentacao_item_func_uq` (`lancamento_id`,`funcionario_id`), UNIQUE KEY `alimentacao_item_origem_uq` (`origem_sistema`,`origem_id`),
  KEY `alimentacao_item_func_idx` (`funcionario_id`), CONSTRAINT `alimentacao_item_lanc_fk` FOREIGN KEY (`lancamento_id`) REFERENCES `alimentacao_lancamentos` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `alimentacao_item_func_fk` FOREIGN KEY (`funcionario_id`) REFERENCES `alimentacao_funcionarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `alimentacao_custos_extras` (
  `id` int NOT NULL AUTO_INCREMENT, `descricao` varchar(220) NOT NULL, `categoria` varchar(100) NOT NULL, `valor` decimal(12,2) NOT NULL,
  `data_custo` date NOT NULL, `criado_por` varchar(120) NOT NULL, `excluido_em` timestamp NULL, `excluido_por` varchar(120), `motivo_exclusao` varchar(500),
  `origem_sistema` varchar(40), `origem_id` varchar(80), `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `alimentacao_custo_origem_uq` (`origem_sistema`,`origem_id`), KEY `alimentacao_custo_data_idx` (`data_custo`), KEY `alimentacao_custo_categoria_idx` (`categoria`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

