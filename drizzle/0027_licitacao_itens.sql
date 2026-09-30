-- Migração aditiva. Nenhum registro histórico é convertido ou recalculado.
-- Aplicar com scripts/migrate-licitacao-itens.mjs após backup.
ALTER TABLE licitacoes ADD COLUMN itensJson TEXT NULL;
