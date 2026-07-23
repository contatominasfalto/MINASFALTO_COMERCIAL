ALTER TABLE `pedido_obra_receitas`
  ADD COLUMN `tipoReceitaOutros` text DEFAULT ('') AFTER `status`;
