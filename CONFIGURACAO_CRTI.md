# Configuração da Sincronização CRTI

## 📌 Visão Geral

Este guia descreve como configurar a sincronização com o banco de dados PostgreSQL CRTI para importar pedidos aprovados e concluídos do tipo ASFALTO TAPFÁCIL.

## 🔧 Pré-requisitos

- Acesso ao servidor PostgreSQL CRTI
- Credenciais de banco de dados (usuário e senha)
- Host e porta do servidor CRTI
- Nome do banco de dados CRTI

## 🛠️ Configuração de Variáveis de Ambiente

As seguintes variáveis de ambiente devem ser configuradas no arquivo `.env` ou através do painel de administração:

```env
# Configuração CRTI
CRTI_HOST=seu-host-postgresql.com
CRTI_PORT=5432
CRTI_DATABASE=crti_database
CRTI_USER=seu_usuario
CRTI_PASSWORD=sua_senha
```

### Descrição das Variáveis

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `CRTI_HOST` | Host do servidor PostgreSQL | `postgresql.example.com` |
| `CRTI_PORT` | Porta do servidor PostgreSQL | `5432` |
| `CRTI_DATABASE` | Nome do banco de dados | `crti_db` |
| `CRTI_USER` | Usuário do banco de dados | `crti_user` |
| `CRTI_PASSWORD` | Senha do usuário | `senha_segura` |

## 📊 Estrutura de Dados CRTI

O sistema espera as seguintes tabelas no banco CRTI:

### Tabela: `pedidos_aprovados`

```sql
CREATE TABLE pedidos_aprovados (
    id SERIAL PRIMARY KEY,
    numero_pedido VARCHAR(50) UNIQUE NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    data_pedido DATE,
    tipo_pedido VARCHAR(100), -- ASFALTO TAPFÁCIL SC ou ASFALTO TAPFÁCIL GRANEL
    quantidade DECIMAL(18,3),
    valor_unitario DECIMAL(18,2),
    valor_total DECIMAL(18,2),
    status VARCHAR(50),
    data_aprovacao TIMESTAMP,
    observacoes TEXT
);
```

### Tabela: `pedidos_concluidos`

```sql
CREATE TABLE pedidos_concluidos (
    id SERIAL PRIMARY KEY,
    numero_pedido VARCHAR(50) UNIQUE NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    data_pedido DATE,
    tipo_pedido VARCHAR(100), -- ASFALTO TAPFÁCIL SC ou ASFALTO TAPFÁCIL GRANEL
    quantidade DECIMAL(18,3),
    valor_unitario DECIMAL(18,2),
    valor_total DECIMAL(18,2),
    status VARCHAR(50),
    data_conclusao TIMESTAMP,
    observacoes TEXT
);
```

## 🔄 Processo de Sincronização

### 1. Importação de Pedidos Aprovados

O sistema importa pedidos com os seguintes critérios:

- **Tipo de Pedido**: ASFALTO TAPFÁCIL SC ou ASFALTO TAPFÁCIL GRANEL
- **Status**: Aprovado
- **Período**: Últimos 60 dias (configurável)

**Mapeamento de Campos**:

| Campo CRTI | Campo Local | Transformação |
|-----------|-------------|----------------|
| `numero_pedido` | `pedido` | Direto |
| `cliente` | `cliente` | Direto |
| `data_pedido` | `dataPedido` | Formato YYYY-MM-DD |
| `tipo_pedido` | `situacao` | Direto |
| `quantidade` | `qtde` | Direto |
| `valor_unitario` | `valorUnit` | Direto |
| `valor_total` | `totalPedido` | Direto |
| `status` | `status` | Mapeado para PENDENTE |

### 2. Sincronização de Pedidos Concluídos

O sistema sincroniza pedidos com os seguintes critérios:

- **Tipo de Pedido**: ASFALTO TAPFÁCIL SC ou ASFALTO TAPFÁCIL GRANEL
- **Status**: Concluído
- **Período**: Últimos 60 dias (configurável)

**Mapeamento de Campos**:

| Campo CRTI | Campo Local | Transformação |
|-----------|-------------|----------------|
| `numero_pedido` | `pedido` | Direto |
| `cliente` | `cliente` | Direto |
| `data_pedido` | `dataPedido` | Formato YYYY-MM-DD |
| `tipo_pedido` | `situacao` | Direto |
| `quantidade` | `qtde` | Direto |
| `valor_unitario` | `valorUnit` | Direto |
| `valor_total` | `totalPedido` | Direto |
| `status` | `status` | Mapeado para SAÍDA OK |

## 🚀 Executar Sincronização

### Via Interface Web

1. Acesse o dashboard do Minasfalto
2. Clique no botão **"Sincronizar CRTI"**
3. Acompanhe o progresso na tela
4. Visualize o relatório de importação

### Via API

```bash
curl -X POST http://localhost:3000/api/trpc/crti.sincronizacaoCompleta \
  -H "Content-Type: application/json" \
  -d '{"dias": 60}'
```

### Via Linha de Comando

```bash
# Testar conexão
curl http://localhost:3000/api/trpc/crti.testarConexao

# Importar pedidos aprovados
curl -X POST http://localhost:3000/api/trpc/crti.importarAprovados \
  -H "Content-Type: application/json" \
  -d '{"dias": 60}'

# Sincronizar pedidos concluídos
curl -X POST http://localhost:3000/api/trpc/crti.sincronizarConcluidos \
  -H "Content-Type: application/json" \
  -d '{"dias": 60}'

# Sincronização completa
curl -X POST http://localhost:3000/api/trpc/crti.sincronizacaoCompleta \
  -H "Content-Type: application/json" \
  -d '{"dias": 60}'
```

## ✅ Testes de Conexão

### 1. Testar Conectividade

```bash
# Teste de conexão básica
psql -h seu-host-postgresql.com -U seu_usuario -d crti_database -c "SELECT 1"
```

### 2. Verificar Dados Disponíveis

```sql
-- Contar pedidos aprovados
SELECT COUNT(*) FROM pedidos_aprovados 
WHERE tipo_pedido IN ('ASFALTO TAPFÁCIL SC', 'ASFALTO TAPFÁCIL GRANEL');

-- Contar pedidos concluídos
SELECT COUNT(*) FROM pedidos_concluidos 
WHERE tipo_pedido IN ('ASFALTO TAPFÁCIL SC', 'ASFALTO TAPFÁCIL GRANEL');

-- Listar últimos pedidos
SELECT * FROM pedidos_aprovados 
ORDER BY data_aprovacao DESC 
LIMIT 10;
```

## 🔐 Segurança

### Boas Práticas

1. **Credenciais Seguras**
   - Nunca compartilhe credenciais CRTI
   - Use senhas fortes e complexas
   - Altere senhas regularmente

2. **Conexão Segura**
   - Use SSL/TLS para conexões PostgreSQL
   - Configure firewall para aceitar apenas IPs autorizados
   - Monitore tentativas de conexão

3. **Permissões de Banco**
   - Crie usuário CRTI com permissões mínimas (apenas SELECT)
   - Não use credenciais de administrador
   - Revise permissões regularmente

### Configurar SSL/TLS

```env
# Adicionar ao .env
CRTI_SSL=true
CRTI_SSL_REJECT_UNAUTHORIZED=true
```

## 📋 Troubleshooting

### Problema: Conexão recusada

**Causa**: Host ou porta incorretos, ou firewall bloqueando

**Solução**:
```bash
# Testar conectividade
telnet seu-host-postgresql.com 5432

# Verificar configurações de firewall
# Contate o administrador do servidor CRTI
```

### Problema: Autenticação falha

**Causa**: Credenciais incorretas

**Solução**:
```bash
# Testar credenciais
psql -h seu-host-postgresql.com -U seu_usuario -d crti_database

# Verificar permissões do usuário
SELECT * FROM information_schema.role_table_grants 
WHERE grantee = 'seu_usuario';
```

### Problema: Nenhum pedido importado

**Causa**: Tabelas vazias ou critérios não atendidos

**Solução**:
```sql
-- Verificar dados disponíveis
SELECT * FROM pedidos_aprovados LIMIT 1;
SELECT * FROM pedidos_concluidos LIMIT 1;

-- Verificar tipo de pedido
SELECT DISTINCT tipo_pedido FROM pedidos_aprovados;
```

### Problema: Pedidos duplicados

**Causa**: Sincronização executada múltiplas vezes

**Solução**:
- O sistema valida números de pedido únicos
- Pedidos duplicados serão rejeitados automaticamente
- Verifique o relatório de importação para detalhes

## 📊 Monitoramento

### Logs de Sincronização

Os logs de sincronização são armazenados em:
- `server/logs/crti-sync.log` (se habilitado)
- Console do servidor de desenvolvimento

### Métricas

```sql
-- Contar pedidos importados por tipo
SELECT tipo_pedido, COUNT(*) as total 
FROM pedidos 
WHERE criadoEm > NOW() - INTERVAL 1 DAY
GROUP BY tipo_pedido;

-- Contar pedidos por status
SELECT status, COUNT(*) as total 
FROM pedidos 
GROUP BY status;
```

## 🔄 Agendamento Automático

Para executar sincronização automática em intervalos regulares:

```javascript
// Exemplo: Sincronizar a cada 6 horas
setInterval(async () => {
  await crtiSync.sincronizacaoCompleta(60);
}, 6 * 60 * 60 * 1000);
```

## 📞 Suporte

Para problemas com a sincronização CRTI, entre em contato com:
- Administrador do servidor CRTI
- Equipe de suporte técnico da Minasfalto

---

**Versão**: 1.0.0  
**Última Atualização**: 22 de Maio de 2026
