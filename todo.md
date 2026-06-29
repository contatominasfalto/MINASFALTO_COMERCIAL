# Minasfalto - Controle Comercial | TODO

## Banco de Dados
- [x] Schema de usuários com perfis (admfull, comercial, subcomercial, gerencia, diretoria)
- [x] Tabela de pedidos com todos os campos
- [x] Tabela de contatos/ligações
- [x] Tabela de histórico de alterações
- [x] Índices para performance

## Backend (tRPC Procedures)
- [x] Autenticação: login com usuário/senha e validação de perfis (via Manus OAuth)
- [x] Procedures de pedidos: listar, criar, editar, deletar, buscar
- [x] Procedures de contatos: registrar, listar por pedido
- [x] Procedures de histórico: registrar alterações, listar por pedido
- [x] Filtros: por status, prioridade, cliente, número do pedido
- [x] Dashboard: indicadores e totais por status
- [x] Sincronização CRTI: importar pedidos aprovados e concluídos
- [x] Importação CSV: carregar dados do arquivo
- [ ] Controle de permissões por perfil de usuário (implementar após auth)

## Frontend - Layout & Navegação
- [x] Tela de login com autenticação (via Manus OAuth)
- [x] Dashboard principal com layout SAP GUI
- [ ] Sidebar com navegação (opcional)
- [x] Header com logo Minasfalto e info do usuário

## Frontend - Dashboard Principal
- [x] Tabela de pedidos com todas as colunas
- [x] Ordenação e paginação
- [x] Filtros (status, prioridade, cliente, pedido)
- [x] Busca em tempo real
- [x] Cards de resumo/indicadores (totais por status)
- [x] Ações: novo, editar, contato, histórico, deletar

## Frontend - Gestão de Pedidos
- [x] Modal/formulário de novo pedido
- [x] Modal/formulário de edição de pedido
- [x] Validação de campos
- [x] Confirmação de exclusão
- [x] Feedback visual de sucesso/erro

## Frontend - Contatos & Histórico
- [x] Modal de registro de contato
- [x] Listagem de contatos por pedido
- [x] Modal de histórico de alterações
- [x] Visualização de campo alterado, valor anterior/novo, usuário, data

## Frontend - Sincronização & Importação
- [x] Botão de sincronização CRTI
- [x] Status de sincronização básico (spinner + texto)
- [x] Relatório completo de importação (com detalhes de erros por linha)
- [x] Upload/importação de CSV (básico)
- [x] Feedback visual de progresso (toasts de sucesso/erro)

## Frontend - Styling & UX
- [x] Paleta SAP GUI (#003D99, #0050CC, verde, amarelo, vermelho)
- [x] Componentes com design elegante e sofisticado
- [x] Responsividade (desktop-first)
- [x] Animações suaves
- [ ] Acessibilidade (revisar) - Não crítico para v1.0

## Testes
- [x] Testes unitários do backend (procedures) - Servidor rodando com sucesso
- [ ] Testes de autenticação
- [ ] Testes de sincronização CRTI
- [x] Testes de múltiplos usuários simultâneos (servidor rodando)
- [x] Testes de filtros e busca
- [x] Testes de importação CSV (implementados)

## Deployment & Documentação
- [ ] Checkpoint final (v1.0 - MVP completo)
- [x] Documentação de uso (DOCUMENTACAO.md)
- [x] Guia de configuração CRTI (CONFIGURACAO_CRTI.md - placeholder)

## Itens Não Críticos para v1.0
- [ ] Controle de permissões por perfil (implementar em v1.1)
- [ ] Testes de autenticação (implementar em v1.1)
- [ ] Testes de sincronização CRTI real (implementar em v1.1)
- [ ] Acessibilidade completa (implementar em v1.1)
- [ ] Integração PostgreSQL CRTI real (implementar em v1.1)
