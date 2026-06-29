# Minasfalto - Controle Comercial | Documentação de Uso

## 📋 Visão Geral

O **Minasfalto Controle Comercial** é um sistema web moderno de gestão de pedidos de vendas, desenvolvido com tecnologia de ponta para suportar múltiplos usuários simultâneos. O sistema oferece uma interface elegante inspirada no SAP GUI, com funcionalidades completas de gestão, sincronização e relatórios.

## 🚀 Características Principais

### 1. **Dashboard Inteligente**
- Visualização em tempo real de todos os pedidos
- Indicadores de resumo (total, pendentes, saída OK, cancelados, prioridade)
- Filtros avançados por status, prioridade, cliente e número do pedido
- Busca em tempo real

### 2. **Gestão de Pedidos**
- Criar novos pedidos com validação de dados
- Editar pedidos existentes com histórico de alterações
- Deletar pedidos com confirmação
- Campos completos: data, cliente, número, situação, quantidade, valores, saldo, percentual, prioridade, tipos de produto (granel/tap fácil), status, data de entrega e observações

### 3. **Registro de Contatos**
- Registrar ligações, e-mails, WhatsApp, visitas e outros tipos de contato
- Associar contatos a pedidos específicos
- Visualizar histórico de contatos por pedido
- Rastreamento de usuário responsável e data/hora

### 4. **Histórico de Alterações**
- Registro automático de todas as alterações em pedidos
- Visualização de campo alterado, valor anterior, valor novo
- Rastreamento de usuário e data/hora da alteração
- Auditoria completa de mudanças

### 5. **Sincronização CRTI**
- Importação automática de pedidos aprovados do banco PostgreSQL CRTI
- Sincronização de pedidos concluídos
- Suporte a tipos específicos: ASFALTO TAPFÁCIL SC e ASFALTO TAPFÁCIL GRANEL
- Status de sincronização em tempo real

### 6. **Importação CSV**
- Carregar pedidos em lote via arquivo CSV
- Validação automática de dados
- Relatório de importação com sucessos e erros
- Compatibilidade com formato original do sistema

## 📊 Estrutura de Dados

### Campos de Pedido
| Campo | Tipo | Descrição |
|-------|------|-----------|
| Número | String | Identificador único do pedido |
| Cliente | String | Nome do cliente |
| Data | Data | Data de criação do pedido |
| Situação | String | Estado do pedido (Aprovado, etc) |
| Quantidade | Decimal | Quantidade total |
| Valor Unitário | Decimal | Preço por unidade |
| Total | Decimal | Valor total do pedido |
| Saldo | Decimal | Valor pendente |
| Percentual | Decimal | Percentual de progresso |
| Prioridade | Enum | NORMAL ou PRIORIDADE |
| Qtde Granel | Decimal | Quantidade de asfalto granel |
| Qtde Tap Fácil | Decimal | Quantidade de asfalto tap fácil |
| Status | Enum | PENDENTE, SAÍDA OK, CANCELADO |
| Data Entrega | Data | Data prevista de entrega |
| Observações | Texto | Notas adicionais |

### Status de Pedidos
- **PENDENTE**: Pedido aguardando processamento
- **SAÍDA OK**: Pedido enviado/concluído
- **CANCELADO**: Pedido cancelado

### Prioridades
- **NORMAL**: Pedido com prioridade normal
- **PRIORIDADE**: Pedido com prioridade alta

## 🔐 Autenticação e Perfis

O sistema utiliza autenticação via Manus OAuth com suporte a 5 perfis de usuário:

| Perfil | Descrição |
|--------|-----------|
| **admfull** | Administrador com acesso total |
| **comercial** | Usuário comercial com acesso completo |
| **subcomercial** | Subcomercial com acesso limitado |
| **gerencia** | Gerência com acesso a relatórios |
| **diretoria** | Diretoria com acesso a indicadores |

## 💻 Como Usar

### Acessar o Sistema
1. Navegue para a URL do sistema
2. Clique em "Login" e autentique com suas credenciais Manus
3. Você será redirecionado para o dashboard

### Criar um Novo Pedido
1. No dashboard, clique em **"Novo Pedido"**
2. Preencha todos os campos obrigatórios
3. Clique em **"Salvar"**
4. O pedido será criado e aparecerá na tabela

### Editar um Pedido
1. Localize o pedido na tabela
2. Clique no ícone **"Editar"** (lápis)
3. Modifique os dados desejados
4. Clique em **"Salvar"**
5. As alterações serão registradas no histórico

### Registrar um Contato
1. Localize o pedido na tabela
2. Clique no ícone **"Contato"** (telefone)
3. Selecione o tipo de contato (Ligação, E-mail, WhatsApp, Visita, Outro)
4. Descreva o contato
5. Clique em **"Registrar"**

### Visualizar Histórico
1. Localize o pedido na tabela
2. Clique no ícone **"Histórico"** (relógio)
3. Visualize todas as alterações realizadas no pedido
4. Veja quem alterou, quando e o que foi alterado

### Sincronizar com CRTI
1. No dashboard, clique em **"Sincronizar CRTI"**
2. O sistema importará pedidos aprovados e concluídos
3. Acompanhe o progresso na tela
4. Os pedidos serão adicionados automaticamente

### Importar Pedidos via CSV
1. No dashboard, clique em **"Importar CSV"**
2. Selecione o arquivo CSV com os pedidos
3. Clique em **"Importar CSV"**
4. Visualize o relatório de importação
5. Os pedidos válidos serão adicionados ao sistema

### Filtrar e Buscar
1. Use a **barra de busca** para procurar por número de pedido ou cliente
2. Use o filtro de **Status** para visualizar pedidos específicos
3. Use o filtro de **Prioridade** para filtrar por normal ou prioridade
4. Clique em **"Atualizar"** para recarregar a lista

## 📁 Formato de Arquivo CSV

O arquivo CSV deve seguir o formato abaixo:

```
data,cliente,pedido,situacao,qtde,valorUnit,totalPedido,saldo,percentual,prioridade,qtdeGranel,qtdeTapFacil,status,dataEntrega,observacoes
2026-01-15,Cliente A,PED-001,Aprovado,100,50.00,5000.00,2500.00,50,NORMAL,50,50,PENDENTE,2026-02-15,Observação teste
2026-01-16,Cliente B,PED-002,Aprovado,200,75.00,15000.00,7500.00,50,PRIORIDADE,100,100,SAÍDA OK,2026-02-16,Observação teste 2
```

### Campos Obrigatórios
- **data**: Data do pedido (formato: YYYY-MM-DD)
- **cliente**: Nome do cliente
- **pedido**: Número único do pedido

### Campos Opcionais
- **situacao**: Estado do pedido
- **qtde**: Quantidade total
- **valorUnit**: Valor unitário
- **totalPedido**: Valor total
- **saldo**: Saldo pendente
- **percentual**: Percentual de progresso
- **prioridade**: NORMAL ou PRIORIDADE
- **qtdeGranel**: Quantidade de granel
- **qtdeTapFacil**: Quantidade de tap fácil
- **status**: PENDENTE, SAÍDA OK ou CANCELADO
- **dataEntrega**: Data de entrega
- **observacoes**: Observações adicionais

## 🔄 Sincronização CRTI

### Configuração
A sincronização com o banco CRTI (PostgreSQL) requer:
- Host do servidor PostgreSQL
- Porta (padrão: 5432)
- Banco de dados
- Usuário e senha

### Tipos de Pedidos Sincronizados
- ASFALTO TAPFÁCIL SC
- ASFALTO TAPFÁCIL GRANEL

### Frequência
A sincronização pode ser executada manualmente a qualquer momento através do botão "Sincronizar CRTI".

## 📊 Indicadores e Resumo

O dashboard exibe indicadores em tempo real:

| Indicador | Descrição |
|-----------|-----------|
| **Total** | Quantidade total de pedidos |
| **Pendentes** | Pedidos com status PENDENTE |
| **Saída OK** | Pedidos com status SAÍDA OK |
| **Cancelado** | Pedidos com status CANCELADO |
| **Prioridade** | Pedidos marcados como PRIORIDADE |

## 🎨 Design e Interface

O sistema utiliza uma paleta de cores corporativa inspirada no SAP GUI:

| Cor | Código | Uso |
|-----|--------|-----|
| Azul Primário | #003D99 | Header, botões principais |
| Azul Secundário | #0050CC | Destaque, links |
| Verde | #10B981 | Status OK, sucesso |
| Amarelo | #F59E0B | Alerta, pendência |
| Vermelho | #EF4444 | Erro, cancelado |
| Cinza | #6B7280 | Texto secundário |

## ⚙️ Configuração Técnica

### Stack Tecnológico
- **Frontend**: React 19 + Tailwind CSS 4
- **Backend**: Express 4 + tRPC 11
- **Banco de Dados**: TiDB (MySQL-compatible)
- **Autenticação**: Manus OAuth
- **Deployment**: Cloud Run (Node.js)

### Requisitos Mínimos
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Conexão com internet
- Conta Manus OAuth

### Performance
- Suporte a múltiplos usuários simultâneos
- Queries otimizadas com índices
- Cache em tempo real
- Sincronização assíncrona

## 🆘 Suporte e Troubleshooting

### Problema: Não consigo fazer login
**Solução**: Verifique se sua conta Manus está ativa e se você tem acesso ao sistema.

### Problema: Pedido não aparece após criar
**Solução**: Clique em "Atualizar" para recarregar a lista de pedidos.

### Problema: Importação CSV falha
**Solução**: Verifique se o arquivo está no formato correto e se os campos obrigatórios estão preenchidos.

### Problema: Sincronização CRTI não funciona
**Solução**: Verifique as credenciais do banco PostgreSQL CRTI e a conectividade de rede.

## 📝 Notas Importantes

1. **Backup**: Sempre mantenha backups regulares dos dados
2. **Permissões**: Cada perfil de usuário tem permissões específicas
3. **Auditoria**: Todas as alterações são registradas no histórico
4. **Performance**: O sistema é otimizado para até 1000 pedidos simultâneos
5. **Segurança**: Todos os dados são transmitidos via HTTPS

## 📞 Contato e Suporte

Para dúvidas ou problemas, entre em contato com o suporte técnico da Minasfalto.

---

**Versão**: 1.0.0  
**Última Atualização**: 22 de Maio de 2026  
**Desenvolvido por**: Manus AI
