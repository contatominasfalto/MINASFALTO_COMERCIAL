ALTER TABLE `pedido_obra_receitas`
MODIFY `status` enum('Nfe','Faturamento Direto','Outros') NOT NULL DEFAULT 'Nfe';
