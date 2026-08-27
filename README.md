# Sistema Integrado Minasfalto

Plataforma interna para rotinas comerciais, estoque, custos de obras, licitações, alimentação, compras, usuários e rastreabilidade. A descrição técnica vigente está em [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Requisitos e instalação

- Node.js 20+ e npm (o projeto também declara pnpm 10)
- MySQL para uso normal e PostgreSQL CRTI para sincronizações

```powershell
git clone <URL_DO_REPOSITORIO>
cd <DIRETORIO_DO_PROJETO>
npm install
```

Não versione `.env`. Use a configuração fornecida pela administração e valide-a com `npm run env:check`.

## Configuração

Obrigatórias: `DATABASE_URL` (MySQL) e `JWT_SECRET`. Em produção, mantenha `LOCAL_AUTH_BYPASS=false`. Também são usadas, conforme o ambiente, `PORT`, `VITE_BASE_PATH`, `APP_BASE_PATH`, `AUTH_MODE`, `LOCAL_LOGIN_*`, `CRTI_*`, `LICITACOES_DOCUMENTOS_ROOT` e as variáveis OAuth.

```powershell
npm run db:schema:check
npm run db:data:check
npm run integration:check
```

Consulte [GUIA_INSTALACAO.md](GUIA_INSTALACAO.md), [CONFIGURACAO_CRTI.md](CONFIGURACAO_CRTI.md) e [DEPLOY_A2_HOSTING.md](DEPLOY_A2_HOSTING.md).

## Execução

```powershell
npm run dev
npm run start:local
npm run start:demo
npm run build
npm start
```

O caminho público é controlado por `VITE_BASE_PATH`/`APP_BASE_PATH`; no ambiente interno costuma ser `/control_pedidos/`.

## Publicação no servidor local

A produção roda em um servidor local da Minasfalto. O GitHub distribui as versões, mas não hospeda a aplicação. O procedimento oficial é publicar a versão aprovada no GitHub e então atualizá-la no servidor:

```powershell
git status
git pull
npm install
npm run env:check
npm run check
npm run build
npm start
```

Quando o servidor usa um gerenciador de processos ou serviço do Windows, reinicie pelo mecanismo configurado em vez de abrir um segundo `npm start`.

Antes do `git pull`, confirme que a árvore do servidor não contém alterações manuais, que o `.env` está preservado e que existe backup atual do banco quando a versão inclui migrações. Depois do reinício, teste em produção: login/logout, permissões, abertura dos módulos afetados, leitura/gravação no MySQL, sincronização CRTI quando aplicável e acesso pelo endereço/base path da rede local.

Se a validação falhar, registre os logs e volte ao commit anteriormente implantado. Migrações e alterações de dados exigem um plano de rollback próprio; reverter apenas o código pode não ser suficiente. O processo detalhado está em [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md#ambiente-oficial-e-processo-de-publicação).

## Testes

```powershell
npm run check
npm test
npm run build
```

Testes de integração exigem os bancos configurados. Antes de mudanças de schema, faça backup e execute primeiro os scripts sem `--apply`.

## Contribuição

1. Crie uma branch a partir de `main` e mantenha commits focados.
2. Não inclua `.env`, credenciais ou dados sensíveis.
3. Preserve autorização no backend; ocultação no frontend é apenas UX.
4. Inclua migração, documentação e rollback aplicável em mudanças de banco.
5. Execute check, testes e build; registre dependências externas indisponíveis.
6. Envie a versão aprovada ao GitHub; não trate a publicação no GitHub como implantação concluída.
7. Atualize e valide a versão no servidor local de produção.
8. Na revisão, descreva impacto, validações e reversão.

Mudanças arquiteturais devem atualizar primeiro [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).
