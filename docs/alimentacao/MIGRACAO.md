# Migração e homologação

1. Fazer backup completo do banco principal e do legado.
2. Aplicar `drizzle/0016_controle_alimentacao.sql` somente no ambiente de homologação.
3. Configurar `DATABASE_URL` e `ALIMENTACAO_LEGACY_DATABASE_URL` sem gravá-las no repositório.
4. Executar `npm run alimentacao:migrate` para o diagnóstico (`dry-run`).
5. Corrigir todas as divergências reportadas e repetir até os totais fecharem.
6. Executar `npm run alimentacao:migrate -- --apply` em homologação.
7. Validar contagens, somatórios por mês/fornecedor/funcionário e amostras de lançamentos.

O importador pode ser repetido: cada registro carrega a origem e chaves únicas impedem duplicação. O banco antigo deve permanecer disponível, somente leitura, até o aceite formal.

## Rollback

Antes do aceite, restaure o backup para reversão total. Para remover apenas o módulo vazio ou já exportado, execute `drizzle/rollback/0016_controle_alimentacao.rollback.sql`. O rollback é destrutivo e exige autorização explícita.

