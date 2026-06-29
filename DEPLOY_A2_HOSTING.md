# Deploy na A2 Hosting

Este projeto usa MySQL. No cPanel, use **Bancos de dados MySQL**, nao PostgreSQL.

## 1. Conferir o `.env`

O `.env` precisa ter, no minimo:

```env
DATABASE_URL=mysql://usuario:senha@localhost:3306/banco
JWT_SECRET=uma_chave_grande_e_secreta
AUTH_MODE=auto
LOCAL_AUTH_BYPASS=false
LOCAL_LOGIN_ADMFULL=sua_senha_admin
VITE_BASE_PATH=/control_pedidos/
```

Se a senha tiver caracteres especiais, eles precisam estar escapados na URL. Exemplo: `@` vira `%40`.

## 2. Comandos no terminal da hospedagem

Dentro da pasta do projeto:

```bash
npm install
npm run env:check
npm run db:test
npm run build
npm run db:push
npm start
```

## 3. App Node.js no cPanel

No **Setup Node.js App**, configure:

```text
Application mode: Production
Application root: pasta do projeto minasfalto_comercial
Application startup file: app-a2.cjs
Node.js version: 20 ou superior
```

Se o painel permitir iniciar por script npm, use:

```bash
npm start
```

## 4. Ordem correta

1. Criar banco MySQL.
2. Criar usuario MySQL.
3. Adicionar usuario ao banco com todos os privilegios.
4. Configurar `DATABASE_URL`.
5. Configurar `VITE_BASE_PATH=/control_pedidos/`.
6. Rodar `npm run env:check`.
7. Rodar `npm run db:test`.
8. Rodar `npm run db:push`.
9. Rodar `npm run build`.
10. Iniciar/reiniciar o app Node.js.
