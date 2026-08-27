# Visão geral do projeto

> Fonte única de verdade técnica do Sistema Integrado Minasfalto. Atualizada em 27/08/2026.

## Ambiente oficial e processo de publicação

> **Regra para usuários, mantenedores e agentes Codex:** a versão final desta aplicação roda em um **servidor local/on-premises da Minasfalto**, e não em uma hospedagem pública ou cloud gerenciada.

O fluxo oficial é:

1. desenvolver em uma branch na máquina de trabalho;
2. executar `npm run check`, `npm test` e `npm run build` localmente;
3. revisar e enviar a versão aprovada ao repositório GitHub;
4. no servidor local, preservar o `.env` e os dados locais, confirmar backup do banco e executar `git pull` da branch de produção;
5. executar `npm install`, `npm run env:check`, `npm run check` e `npm run build` no servidor;
6. reiniciar o processo Node com o mecanismo adotado pelo servidor;
7. realizar testes de fumaça e aceite **no ambiente de produção local**, usando os bancos e integrações reais autorizados;
8. se houver falha, interromper a publicação e reverter para o commit anterior, restaurando banco/arquivos apenas quando a mudança os tiver afetado.

Os testes na máquina de desenvolvimento são pré-validação. A validação definitiva ocorre no servidor local porque conectividade, `.env`, MySQL, CRTI, caminhos de documentos, base path e permissões reais dependem desse ambiente. Nunca copie ou versione o `.env` do servidor, nunca substitua dados locais durante um `git pull` e não execute migrações com `--apply` sem backup e autorização.

## Descrição e público-alvo

Aplicação web interna da Minasfalto para equipes comercial, compras, estoque, obras, licitações, alimentação, gestão e diretoria. Centraliza pedidos, contatos, movimentações, custos/receitas, cotações, documentos e auditoria, com permissões por usuário/perfil e leitura do ERP CRTI.

## Stack e arquitetura

- Frontend: React 19, TypeScript, Vite 7, Wouter, TanStack Query, tRPC React, Radix UI e Tailwind CSS 4.
- Backend: Node.js, Express 4, tRPC 11 e Zod.
- Dados: Drizzle ORM/MySQL; PostgreSQL (`pg`) somente para leitura/sincronização CRTI.
- Relatórios/arquivos: ExcelJS, PDFs no servidor e AWS SDK S3 quando configurado.
- Qualidade: Vitest e TypeScript 5.9.

O navegador carrega a SPA, autentica por cookie e chama `/api/trpc`. O middleware valida identidade e permissão e audita mutations. Os routers usam módulos de domínio/`server/db.ts`, persistem no MySQL e, na sincronização, leem o PostgreSQL CRTI. Vite serve o desenvolvimento; no servidor local de produção, Express entrega `dist/public`.

## Módulos e endpoints

| Módulo | Rota web | Router tRPC |
|---|---|---|
| Início | `/` | `system` |
| Comercial | `/comercial` | `pedidos`, `contatos`, `historico`, `indicadores`, `crti` |
| Estoque | `/estoque` | `estoque` |
| Custo Obras | `/custo-obras` | `pedidosObras`, `despesasTabelaGeral` |
| Licitações | `/licitacoes` | `licitacoes` |
| Alimentação | `/alimentacao` | `alimentacao` |
| Compras | `/compras` | `compras` |
| Usuários | `/controle-usuarios` | `userManagement` |
| Rastreabilidade | `/rastreabilidade` | `rastreabilidade` |

Há ainda `/login`, `/404` e fallback. O endpoint HTTP é `/api/trpc`, também sob o base path configurado. Procedures internas aos routers são API pública e devem manter compatibilidade.

## Organização e dependências

- `client/src`: SPA, páginas, componentes, hooks e contextos.
- `server`: API, domínio, autenticação, PDFs, integrações e persistência.
- `shared`: contratos, constantes e catálogo de permissões.
- `drizzle`: schema, relações e migrações MySQL.
- `scripts`: inicialização, diagnósticos, migrações e auditoria CRTI.
- `docs`: guias especializados vigentes.
- `estoque`: frontend isolado/legado, preservado como possível implantação independente.

Dependências centrais: React/Vite, Express/tRPC, Drizzle/MySQL2/pg, Zod, TanStack Query, Radix, ExcelJS e AWS SDK S3. Versões exatas ficam em `package.json` e lockfiles.

## Fluxo

1. O usuário autentica e recebe sessão em cookie.
2. O frontend carrega permissões e protege navegação.
3. A chamada tRPC passa por autenticação, autorização e auditoria.
4. Zod valida a entrada; domínio e banco executam a operação.
5. Mutations invalidam caches e a interface recarrega dados.
6. Sincronizações leem o CRTI em modo somente leitura, normalizam e persistem no MySQL.

## Banco de dados

O schema declara 30 tabelas MySQL, agrupadas em acesso/auditoria (`users`, permissões e logs), comercial (pedidos, atividades, contatos, histórico e sincronização), obras (financeiro, despesas, receitas, custos e alocações), licitações (cadastros, processos, atas, adesões e vínculos CRTI), estoque e alimentação. Compras é criada pela migração `0026_controle_compras.sql` e scripts próprios.

Migrações ficam em `drizzle/`. Faça backup, valide em homologação e não altere migração já aplicada sem estratégia explícita.

## Configuração

- Núcleo: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `VITE_BASE_PATH`, `APP_BASE_PATH`.
- Autenticação: `AUTH_MODE`, `LOCAL_AUTH_BYPASS`, `LOCAL_LOGIN_*`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`.
- MySQL: `MYSQL_CONNECT_TIMEOUT_MS`, `MYSQL_CONNECTION_LIMIT`.
- CRTI: `CRTI_HOST`, `CRTI_PORT`, `CRTI_DATABASE`, `CRTI_USER`, `CRTI_PASSWORD`, `CRTI_SSL`, `CRTI_SSL_REJECT_UNAUTHORIZED`, `CRTI_SYNC_DAYS`, `CRTI_TABLE_APROVADOS`, `CRTI_TABLE_CONCLUIDOS`, `CRTI_TABLE_SAIDAS`.
- Domínio/serviços: `ALIMENTACAO_LEGACY_DATABASE_URL`, `LICITACOES_DOCUMENTOS_ROOT`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`.

Segredos ficam em `.env`/secret manager. `npm run env:check` valida o mínimo e `npm run integration:check` verifica integrações.

## Segurança

- Sessão assinada por `JWT_SECRET`, cookie HTTP-only e expiração/inatividade.
- Autorização no middleware do backend; controles React são apenas UX.
- Master protegido, status do usuário, regras explícitas e perfis determinam acesso.
- Senhas locais usam hash `scrypt` com salt; credenciais não são versionadas.
- Zod valida entradas e mutations geram auditoria.
- CRTI usa acesso somente leitura e SSL deve ser validado em produção.
- Documentos devem permanecer sob `LICITACOES_DOCUMENTOS_ROOT`.

## Estatísticas

Inventário inicial em 27/08/2026, excluindo `.git`, `node_modules` e `dist`: 253 arquivos, 223 textuais; TypeScript 80 arquivos/13.214 linhas, TSX 47/14.174, CSS 5/7.055, JavaScript/MJS/CJS 29/3.214, SQL 29/697, HTML 2/32, Markdown 16/1.364 e JSON 13/17.511 (principalmente snapshots). Números finais estão em `CLEANUP_REPORT.md`.

## Governança documental

Este arquivo define o estado atual. `README.md` é a entrada operacional; `AGENTS.md` vincula futuras sessões Codex às regras de produção local; os demais `.md` detalham instalação, implantação, CRTI, usuários, compras e alimentação. Em conflito, atualize esta fonte e o guia especializado na mesma mudança.
