# Relatório final de limpeza

Data: 27/08/2026

Branch: `cleanup/project-docs-20260827`

## Resultados

- Arquivos analisados: 253, excluindo `.git`, `node_modules` e `dist`.
- Arquivos textuais auditados no inventário inicial: 223.
- Funções/handlers removidos: 3.
- Outros símbolos mortos: 6 (1 binding, 2 constantes e 3 imports).
- Markdown: 16 iniciais; 3 deletados; 13 preexistentes mantidos; 1 atualizado na limpeza; 4 criados (incluindo `AGENTS.md` no esclarecimento operacional); 17 finais.
- Detalhes individuais: `CHANGELOG_CLEANUP.md`.

## Verificações

| Verificação | Resultado |
|---|---|
| Estado/backup | `main...origin/main` limpa; branch separada criada |
| TypeScript inicial | passou (`npm run check`) |
| TypeScript após cada arquivo | passou |
| Análise estrita de não usados | passou (`tsc --noUnusedLocals --noUnusedParameters`) |
| Build inicial | passou (`npm run build`) |
| Testes iniciais | 73 passaram e 6 falharam de 79; falhas preexistentes por MySQL local indisponível |
| TypeScript final | passou, inclusive modo estrito de não usados |
| Build final | passou; 3.324 módulos transformados |
| Testes finais | resultado idêntico à linha de base: 73 passaram e 6 falharam por MySQL indisponível |
| Integridade do diff | `git diff --check` sem erro; apenas aviso esperado de normalização LF/CRLF |

## Remoções e compatibilidade

Foram removidos `formatCurrencyOrBlank`, `formatDecimal`, `handleClearFinanceiro`, o binding React `clearFinanceiro`, duas constantes `HIDDEN_COST_PROFILES` e três imports. Foram excluídos `DOCUMENTACAO.md`, `todo.md` e `docs/alimentacao/PUBLICACAO_ROLLBACK.md`.

Nenhum endpoint, export, schema, migração ou fluxo de runtime foi removido. A procedure pública `pedidosObras.clearFinanceiro` foi preservada. O subprojeto `estoque` também foi preservado porque pode ter implantação independente.

Não se afirma que toda a suíte passa sem o MySQL esperado. Funcionalidades dependentes de MySQL/CRTI e aceite visual não são declaradas “ok” sem esses serviços; compilação, análise estática, testes disponíveis e build verificam a ausência de quebra estrutural observável.

## Estatísticas finais por linguagem

Após o esclarecimento operacional, excluindo `.git`, `node_modules` e `dist`: 254 arquivos totais e 224 textuais. Há 80 `.ts` (13.214 linhas), 47 `.tsx` (14.174), 5 `.css` (7.055), 29 `.js/.mjs/.cjs` (3.214), 29 `.sql` (697), 2 `.html` (32), 17 `.md` (1.152) e 13 `.json` (principalmente snapshots). Outros arquivos incluem assets, planilhas, lockfiles e dados auxiliares.
