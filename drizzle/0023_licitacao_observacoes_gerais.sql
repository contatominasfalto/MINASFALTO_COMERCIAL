ALTER TABLE `licitacoes`
  ADD COLUMN IF NOT EXISTS `observacoesGerais` text NULL AFTER `alertaPregao`;
