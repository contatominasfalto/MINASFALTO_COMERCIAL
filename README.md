# Sistema Integrado Minasfalto

Sistema interno da Minasfalto para apoio às rotinas comerciais, controle de estoque e evolução dos módulos de obras, custos e medições.

O projeto começou como um controle comercial para pedidos de Tap Fácil e granel. Atualmente está organizado como uma plataforma interna com tela inicial por módulos e integração com o CRTI para sincronização de pedidos.

---

## Módulos

- **Login**: acesso por usuário e senha local, com sessão por cookie.
- **Tela Inicial**: hub de entrada com menu lateral para os módulos disponíveis.
- **Comercial**: painel existente de pedidos, contatos, histórico, filtros, sincronização CRTI e acesso ao estoque.
- **Estoque**: lançamentos e relatório de movimentações.
- **Custo Obras**: módulo reservado/em desenvolvimento.

### Permissões de Navegação

Os usuários `comercial` e `subcomercial` não visualizam o menu **Custo Obras**.

Perfis locais previstos:

- `admfull`
- `comercial`
- `subcomercial`
- `gerencia`
- `diretoria`

---

## Fluxo de Uso em Produção Local

O sistema é desenvolvido na máquina local, enviado para o GitHub e atualizado no servidor interno por `git pull`.

Fluxo recomendado no servidor:

```powershell
git pull
npm install
npm run check
npm run build
npm start
```

Endereço padrão usado na rede local:

```txt
http://IP_DO_SERVIDOR:PORTA/control_pedidos/
```

No ambiente atual, o sistema usa `VITE_BASE_PATH=/control_pedidos/`.

---

## Comandos Principais

```powershell
npm run dev
npm run check
npm run build
npm start
npm test
```

Scripts úteis de banco e integração:

```powershell
npm run env:check
npm run db:schema:check
npm run db:data:check
npm run integration:check
npm run crti:check
npm run crti:summary
npm run crti:balance
```

---

## Configuração

O arquivo `.env` não deve ser versionado.

Variáveis importantes:

- `DATABASE_URL`: conexão MySQL do sistema.
- `JWT_SECRET`: segredo usado para assinatura da sessão.
- `VITE_BASE_PATH`: base pública da aplicação. Exemplo: `/control_pedidos/`.
- `PORT`: porta do servidor local.
- `LOCAL_AUTH_BYPASS`: deve ficar `false` no servidor.
- `LOCAL_LOGIN_ADMFULL`
- `LOCAL_LOGIN_COMERCIAL`
- `LOCAL_LOGIN_SUBCOMERCIAL`
- `LOCAL_LOGIN_GERENCIA`
- `LOCAL_LOGIN_DIRETORIA`

Variáveis da integração CRTI:

- `CRTI_HOST`
- `CRTI_PORT`
- `CRTI_DATABASE`
- `CRTI_USER`
- `CRTI_PASSWORD`
- `CRTI_SSL`
- `CRTI_SSL_REJECT_UNAUTHORIZED`
- `CRTI_SYNC_DAYS`
- `CRTI_TABLE_APROVADOS`
- `CRTI_TABLE_CONCLUIDOS`
- `CRTI_TABLE_SAIDAS`

---

## Integração CRTI

O sistema possui integração com o CRTI via PostgreSQL para:

- importar pedidos aprovados;
- atualizar pedidos concluídos;
- recalcular saldo, percentual e quantidade pendente;
- registrar última sincronização;
- apoiar auditoria de divergências.

Rotinas relacionadas estão em:

```txt
server/crti-sync.ts
scripts/check-crti-readonly.mjs
scripts/crti-summary.mjs
scripts/crti-balance-audit.mjs
scripts/find-crti-pedido.mjs
scripts/inspect-crti-table.mjs
```

No painel Comercial, o botão **Atualizar** executa a sincronização completa dos últimos dias configurados.

---

## Estrutura Principal

```txt
client/src/App.tsx              Rotas principais
client/src/pages/Login.tsx      Tela de login
client/src/pages/Home.tsx       Tela inicial e menu de módulos
client/src/pages/Dashboard.tsx  Painel Comercial
client/src/pages/Stock.tsx      Tela de Estoque
client/src/components/          Formulários, modais e UI
client/src/contexts/            Contextos React
server/routers.ts               Rotas tRPC
server/db.ts                    Funções de banco MySQL
server/crti-sync.ts             Integração CRTI
drizzle/schema.ts               Schema e tipos do banco
scripts/                        Verificações e utilitários
```

---

## Stack Técnica

- React
- Vite
- TypeScript
- tRPC
- Express
- Drizzle ORM
- MySQL
- PostgreSQL para leitura CRTI
- Zod
- Vitest

---

## Cuidados Antes de Subir Para o Servidor

Antes de atualizar o servidor local, valide:

```powershell
npm run check
npm run build
```

No servidor, confirme:

- `.env` presente e atualizado;
- `LOCAL_AUTH_BYPASS=false`;
- `VITE_BASE_PATH=/control_pedidos/`;
- banco MySQL acessível;
- credenciais CRTI corretas;
- backup do banco em dia.

---

## Observações

- Não versionar `.env`.
- Não alterar credenciais diretamente no código.
- Evitar excluir dados comerciais sem necessidade; preferir cancelamento/status quando houver rastreabilidade envolvida.
- Alterações de tela devem preservar o fluxo: Login -> Tela Inicial -> Módulos.
