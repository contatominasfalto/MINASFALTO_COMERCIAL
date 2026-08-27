# Changelog da limpeza

Data: 27/08/2026

Branch: `cleanup/project-docs-20260827`

Base recuperável: `main`/`origin/main`, limpa no início.

## Código removido

| Arquivo | Símbolo | Evidência |
|---|---|---|
| `client/src/App.tsx` | `HIDDEN_COST_PROFILES` | constante privada sem leitura; permissões usam `usePermissions` |
| `client/src/pages/Home.tsx` | `HIDDEN_COST_PROFILES` | constante privada sem leitura |
| `client/src/pages/CustoObras.tsx` | `formatCurrencyOrBlank` | função privada sem chamada |
| `client/src/pages/CustoObras.tsx` | `formatDecimal` | função privada sem chamada |
| `client/src/pages/CustoObras.tsx` | `handleClearFinanceiro` | handler privado nunca ligado a evento/callback |
| `client/src/pages/CustoObras.tsx` | `clearFinanceiro` | binding de hook sem consumidor; procedure pública preservada |
| `client/src/pages/CustoObras.tsx` | import `X` | import sem uso |
| `client/src/pages/Licitacoes.tsx` | import `Search` | import sem uso |
| `client/src/pages/Rastreabilidade.tsx` | import `X` | import sem uso |

`npm run check` passou após cada arquivo alterado. A varredura final com `tsc --noUnusedLocals --noUnusedParameters` passou. Nenhum export, endpoint, callback registrado, método mágico, interface, config, teste ou build script foi removido. Candidatos ambíguos foram preservados; não houve local seguro que justificasse adicionar `TODO: verify`.

## Markdown excluído

| Documento | Razão |
|---|---|
| `DOCUMENTACAO.md` | duplicado/obsoleto: tratava Manus OAuth, TiDB e Cloud Run como arquitetura principal e omitiria módulos atuais |
| `todo.md` | backlog antigo contradizia permissões e integração já implementadas |
| `docs/alimentacao/PUBLICACAO_ROLLBACK.md` | referia-se à branch histórica `feature/controle-alimentacao`; o guia vigente permanece em `MIGRACAO.md` |

## Markdown mantido e atualizado

Mantidos 13 documentos preexistentes de instalação, CRTI, deploy, arquitetura, usuários, compras, alimentação e referência técnica. `README.md` foi reescrito. Foram criados `PROJECT_OVERVIEW.md`, este changelog e `CLEANUP_REPORT.md`.

## Esclarecimento operacional posterior

- Documentado que a produção roda no servidor local/on-premises da Minasfalto.
- Formalizado o fluxo: validar localmente, publicar no GitHub, executar `git pull` no servidor, instalar/buildar/reiniciar e testar no ambiente de produção local.
- Registrados cuidados com `.env`, alterações locais, backup, migrações, smoke tests e rollback.
- Explicitado para futuros agentes Codex que GitHub é o canal de distribuição do código, não o ambiente de execução final.
