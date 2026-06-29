# Minasfalto Controle Comercial - Guia de Instalação e Teste Local

## 📥 Instalação

### 1. Extrair o Arquivo ZIP

```bash
unzip minasfalto_comercial_v1.0.zip
cd minasfalto_comercial
```

### 2. Instalar Dependências

```bash
# Instalar dependências do projeto
pnpm install

# Ou se usar npm
npm install

# Ou se usar yarn
yarn install
```

### 3. Configurar Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com as seguintes variáveis:

```env
# Banco de Dados
DATABASE_URL=mysql://usuario:senha@host:3306/minasfalto

# Autenticação (Manus OAuth)
VITE_APP_ID=seu_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im/login
JWT_SECRET=sua_chave_secreta_aqui

# Informações do Proprietário
OWNER_NAME=Seu Nome
OWNER_OPEN_ID=seu_open_id

# APIs Manus (opcional para desenvolvimento local)
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=sua_chave_api

# Sincronização CRTI (opcional)
CRTI_HOST=seu-host-postgresql.com
CRTI_PORT=5432
CRTI_DATABASE=crti_database
CRTI_USER=seu_usuario
CRTI_PASSWORD=sua_senha
```

## 🚀 Executar Localmente

### Modo Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
pnpm dev

# O servidor estará disponível em: http://localhost:3000
```

### Modo Produção

```bash
# Build do projeto
pnpm build

# Iniciar servidor de produção
pnpm start
```

## 🗄️ Configurar Banco de Dados

### Opção 1: MySQL Local

```bash
# Instalar MySQL (macOS com Homebrew)
brew install mysql

# Iniciar MySQL
brew services start mysql

# Criar banco de dados
mysql -u root -e "CREATE DATABASE minasfalto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Atualizar DATABASE_URL no .env.local
DATABASE_URL=mysql://root@localhost:3306/minasfalto
```

### Opção 2: Docker

```bash
# Criar container MySQL
docker run --name minasfalto-mysql \
  -e MYSQL_ROOT_PASSWORD=senha123 \
  -e MYSQL_DATABASE=minasfalto \
  -p 3306:3306 \
  -d mysql:8.0

# Atualizar DATABASE_URL no .env.local
DATABASE_URL=mysql://root:senha123@localhost:3306/minasfalto
```

### Opção 3: TiDB Cloud (Recomendado)

1. Acesse https://tidbcloud.com
2. Crie uma conta gratuita
3. Crie um cluster TiDB
4. Copie a connection string para DATABASE_URL

## 📊 Criar Tabelas do Banco

Após configurar o banco de dados, execute:

```bash
# Gerar migração (se necessário)
pnpm drizzle-kit generate

# Executar migração
pnpm drizzle-kit migrate
```

## ✅ Testar a Aplicação

### 1. Verificar Servidor

```bash
# Verificar se o servidor está rodando
curl http://localhost:3000

# Você deve receber uma resposta HTML (página 404 é esperada sem autenticação)
```

### 2. Testar Backend (tRPC)

```bash
# Listar pedidos (sem autenticação)
curl http://localhost:3000/api/trpc/pedidos.list

# Você deve receber um erro de autenticação (esperado)
```

### 3. Testar Frontend

Abra o navegador e acesse:
```
http://localhost:3000
```

Você verá:
- Página de login (se autenticação estiver ativa)
- Dashboard com tabela de pedidos (após login)

## 🧪 Executar Testes

```bash
# Executar testes unitários
pnpm test

# Executar testes com watch mode
pnpm test:watch

# Executar testes com coverage
pnpm test:coverage
```

## 🔍 Verificar Erros de TypeScript

```bash
# Verificar erros de tipo
pnpm check

# Formatar código
pnpm format
```

## 📁 Estrutura do Projeto

```
minasfalto_comercial/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── pages/         # Páginas (Dashboard, etc)
│   │   ├── components/    # Componentes reutilizáveis
│   │   ├── App.tsx        # Componente principal
│   │   └── index.css      # Estilos globais
│   └── index.html         # HTML principal
├── server/                # Backend Express + tRPC
│   ├── routers.ts         # Procedures tRPC
│   ├── db.ts              # Helpers de banco de dados
│   ├── crti-sync.ts       # Sincronização CRTI
│   ├── csv-import.ts      # Importação CSV
│   └── _core/             # Código de infraestrutura
├── drizzle/               # Schema e migrações
│   ├── schema.ts          # Definição das tabelas
│   └── migrations/        # Arquivos SQL de migração
├── shared/                # Código compartilhado
├── package.json           # Dependências
├── tsconfig.json          # Configuração TypeScript
├── vite.config.ts         # Configuração Vite
├── DOCUMENTACAO.md        # Guia de uso
├── CONFIGURACAO_CRTI.md   # Guia CRTI
└── todo.md                # Lista de tarefas
```

## 🐛 Troubleshooting

### Problema: Porta 3000 já está em uso

```bash
# Encontrar processo usando porta 3000
lsof -i :3000

# Matar processo
kill -9 <PID>

# Ou usar porta diferente
PORT=3001 pnpm dev
```

### Problema: Erro de conexão com banco de dados

```bash
# Verificar se banco está rodando
mysql -u root -p -e "SELECT 1;"

# Verificar DATABASE_URL no .env.local
cat .env.local | grep DATABASE_URL

# Testar conexão
node -e "require('mysql2/promise').createConnection({connectionString: process.env.DATABASE_URL}).then(() => console.log('OK')).catch(e => console.error(e))"
```

### Problema: Módulos não encontrados

```bash
# Limpar cache
rm -rf node_modules pnpm-lock.yaml

# Reinstalar
pnpm install
```

### Problema: Erro de autenticação

- Verifique se VITE_APP_ID está correto
- Verifique se OAUTH_SERVER_URL está acessível
- Verifique se JWT_SECRET está definido

## 📝 Exemplo de Uso

### 1. Criar um Pedido via API

```bash
curl -X POST http://localhost:3000/api/trpc/pedidos.create \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": "Cliente A",
    "pedido": "PED-001",
    "dataPedido": "2026-05-22",
    "qtde": 100,
    "valorUnit": 50.00,
    "totalPedido": 5000.00,
    "saldo": 2500.00,
    "percentual": 50,
    "prioridade": "NORMAL",
    "qtdeGranel": 50,
    "qtdeTapFacil": 50,
    "status": "PENDENTE",
    "dataEntrega": "2026-06-22",
    "observacoes": "Pedido de teste"
  }'
```

### 2. Listar Pedidos

```bash
curl http://localhost:3000/api/trpc/pedidos.list
```

### 3. Importar CSV

```bash
# Criar arquivo CSV
cat > pedidos.csv << 'EOF'
data,cliente,pedido,situacao,qtde,valorUnit,totalPedido,saldo,percentual,prioridade,qtdeGranel,qtdeTapFacil,status,dataEntrega,observacoes
2026-05-22,Cliente A,PED-001,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-06-22,Teste
EOF

# Importar via API
curl -X POST http://localhost:3000/api/trpc/pedidos.importCSV \
  -H "Content-Type: application/json" \
  -d @pedidos.json
```

## 📚 Documentação Adicional

- **DOCUMENTACAO.md**: Guia completo de uso do sistema
- **CONFIGURACAO_CRTI.md**: Guia de configuração da sincronização CRTI
- **README.md**: Informações técnicas do projeto

## 🎯 Próximos Passos

1. ✅ Instalar e configurar banco de dados
2. ✅ Executar `pnpm dev` para iniciar servidor
3. ✅ Acessar http://localhost:3000 no navegador
4. ✅ Fazer login com suas credenciais
5. ✅ Testar criar, editar e deletar pedidos
6. ✅ Testar importação CSV
7. ✅ Testar sincronização CRTI

## 💡 Dicas

- Use o modo desenvolvimento para hot-reload automático
- Verifique os logs do servidor para diagnosticar problemas
- Use o DevTools do navegador para debugar frontend
- Consulte a documentação para dúvidas sobre funcionalidades

## 🚀 Deploy em Produção

Para fazer deploy em produção:

1. **Manus Platform** (Recomendado):
   - Clique no botão "Publish" no Management UI
   - Sistema será publicado automaticamente

2. **Outras Plataformas** (Railway, Render, Vercel):
   - Execute `pnpm build`
   - Faça upload do arquivo `dist/`
   - Configure variáveis de ambiente

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte a documentação (DOCUMENTACAO.md)
2. Verifique os logs do servidor
3. Abra uma issue no repositório

---

**Versão**: 1.0.0  
**Data**: 22 de Maio de 2026  
**Desenvolvido por**: Manus AI
