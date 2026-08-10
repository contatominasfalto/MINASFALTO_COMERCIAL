ALTER TABLE `alimentacao_funcionarios`
  ADD COLUMN `excluido_em` timestamp NULL,
  ADD COLUMN `excluido_por` varchar(120) NULL,
  ADD COLUMN `motivo_exclusao` varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE `alimentacao_fornecedores`
  ADD COLUMN `excluido_em` timestamp NULL,
  ADD COLUMN `excluido_por` varchar(120) NULL,
  ADD COLUMN `motivo_exclusao` varchar(500) NULL;
