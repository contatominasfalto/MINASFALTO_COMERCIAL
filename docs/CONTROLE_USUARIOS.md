# Controle de Usuários e Permissões

## Modelo

- `users` mantém usuários OAuth e locais e agora registra `username`, `status`, proteção do master e arquivamento.
- `profile_permissions` persiste os padrões dos perfis legados.
- `user_permissions` contém as personalizações por usuário, recurso e ação.
- `permission_audit_log` registra autor, alvo, valores anterior/novo, motivo e data.

Precedência: `admfull` protegido → usuário inativo bloqueado → permissão explícita → padrão persistido do perfil → negação. O efeito `view` permite `access`, `read` e `export`, mas bloqueia escrita.

## Autenticação

OAuth continua sendo provisionado pelo provedor atual. Os cinco logins locais continuam usando as variáveis `LOCAL_LOGIN_*`; nenhuma senha é armazenada no banco. A tela administrativa cria identidade, perfil e permissões. Para conceder credencial local a um novo login é necessário provisioná-lo no mecanismo corporativo/OAuth; esta separação evita senha em texto puro.

Usuários desativados ou arquivados têm a autenticação recusada. O `admfull` é protegido na UI, backend e por triggers no banco.

## Aplicar a migração

1. Faça backup do banco MySQL de produção.
2. Na raiz da aplicação, carregue a mesma `DATABASE_URL` usada pelo servidor.
3. Execute `npm run usuarios:schema -- --apply`. O instalador é idempotente e valida todas as estruturas ao final.
4. Confirme no banco:

```sql
SELECT id, openId, username, role, profile, status, isProtected
FROM users
WHERE username = 'admfull';
```

O resultado esperado é `role=admin`, `profile=admfull`, `status=active` e `isProtected=1`.

5. Reinicie a aplicação, entre como `admfull` e acesse **Controle de Usuários** no menu lateral.

## Catálogo protegido

- Início: acesso e consulta.
- Comercial: acesso, consulta, criação, edição, exclusão, importação e sincronização CRTI.
- Estoque: acesso, consulta e CRUD.
- Custo Obras: acesso, consulta, CRUD, exportação e sincronização CRTI.
- Licitações: acesso, consulta, CRUD, relatórios e gestão de atas/adesões.
- Alimentação: acesso, consulta, CRUD, relatórios e cadastros.
- Controle de Usuários: exclusivo do `admfull`.

Todas as procedures autenticadas passam pelo middleware de autorização no servidor. A ocultação de rotas e menus no React é somente uma camada de experiência, não a barreira de segurança.
