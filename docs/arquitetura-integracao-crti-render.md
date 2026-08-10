# Arquitetura futura — Integração CRTI com Render

## Situação da decisão

Documento de referência para discussão e implementação futura. Nenhuma alteração funcional foi realizada no sistema com base neste desenho.

## Objetivo

Permitir que o novo Sistema de Gestão da Minasfalto, hospedado no Render, utilize dados originados no CRTI sem expor o banco local à internet e sem depender de conexão iniciada pela nuvem.

## Arquitetura acordada

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           RENDER — CLOUD                             │
│                                                                      │
│  ┌──────────────────┐       ┌───────────────────────┐                │
│  │ Frontend         │──────▶│ API do Sistema Novo  │                │
│  └──────────────────┘       └───────────┬───────────┘                │
│                                         │ leitura/gravação           │
│                              ┌──────────▼───────────┐                │
│                              │ PostgreSQL Render   │                │
│                              │ Dados sincronizados │                │
│                              └──────────────────────┘                │
│                                         ▲                            │
│                              ┌──────────┴───────────┐                │
│                              │ API de integração   │                │
│                              │ CRTI — autenticada  │                │
│                              └──────────────────────┘                │
└─────────────────────────────────────────▲────────────────────────────┘
                                          │
                          HTTPS + HMAC + idempotência
                                          │
┌─────────────────────────────────────────┴────────────────────────────┐
│                    AMBIENTE LOCAL/ON-PREMISES                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Agente de Sincronização CRTI                                  │  │
│  │ - Executa automaticamente                                     │  │
│  │ - Consulta alterações incrementais                            │  │
│  │ - Mantém cursor de sincronização                              │  │
│  │ - Mantém fila local em caso de indisponibilidade              │  │
│  │ - Envia lotes autenticados para o Render                      │  │
│  │ - Repete falhas sem duplicar registros                        │  │
│  └───────────────────────────────▲────────────────────────────────┘  │
│                                  │ somente leitura                    │
│  ┌───────────────────────────────┴────────────────────────────────┐  │
│  │ Banco CRTI — PostgreSQL                                      │  │
│  │ - pedidos_venda_material                                     │  │
│  │ - vendas_saida_material_analitico                            │  │
│  │ - contas_pagar_receber                                       │  │
│  │ - demais tabelas autorizadas                                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Fluxo oficial proposto

```text
PostgreSQL CRTI
      ↓ somente leitura
Agente local independente
      ↓ HTTPS autenticado
API de integração no Render
      ↓ transação e UPSERT
PostgreSQL Render
      ↓
API do novo sistema
      ↓
Frontend
```

O CRTI atual é acessado diretamente como PostgreSQL. Portanto, o agente não “consome um endpoint CRTI”; ele consulta o banco CRTI em modo somente leitura e envia os dados para a API do Render.

## Responsabilidades

### Agente local

- Funcionar independentemente do navegador e de usuário logado.
- Consultar o CRTI usando credencial de somente leitura.
- Fazer sincronização incremental por data de atualização e chave primária.
- Manter cursor individual por tabela.
- Persistir uma fila local durável para períodos sem internet.
- Enviar dados em lotes com identificadores únicos.
- Avançar o cursor somente após confirmação do Render.
- Repetir falhas com espera progressiva.
- Executar reconciliação completa periódica.

### API de integração no Render

- Disponibilizar endpoint exclusivo e versionado, por exemplo `POST /api/integracoes/crti/v1/lotes`.
- Validar autenticação, assinatura, timestamp e identificador da requisição.
- Rejeitar repetições maliciosas e aceitar reenvios idempotentes.
- Validar rigorosamente o contrato do lote.
- Gravar cada lote em transação.
- Fazer `UPSERT` pela chave estável `origem + tabela + id_origem`.
- Registrar execuções, erros, quantidades e cursores confirmados.
- Responder somente depois do commit no PostgreSQL.

### PostgreSQL Render

- Ser a única fonte consultada pelo novo sistema para os dados sincronizados.
- Separar tabelas brutas de origem das tabelas de negócio.
- Preservar histórico e exclusões lógicas.
- Manter rastreabilidade até o registro original no CRTI.

## Segurança mínima

- Somente conexões de saída do ambiente local para o Render.
- Nenhuma porta do PostgreSQL CRTI exposta à internet.
- HTTPS obrigatório.
- Assinatura HMAC-SHA256 do corpo da requisição.
- Timestamp e nonce para impedir replay.
- Chaves separadas para homologação e produção.
- Rotação de segredos.
- Validação de tamanho, frequência e estrutura dos lotes.
- Credenciais armazenadas em variáveis/segredos, nunca no Git.
- Usuário do CRTI com privilégio exclusivo de leitura.

## Idempotência e cursores

Cada lote deve possuir `execucaoId` e `loteId` únicos. Cada registro deve possuir uma chave de origem estável. O mesmo lote pode ser reenviado sem duplicar dados.

Cursor recomendado:

```text
atualizado_em + id_origem
```

Se a origem não possuir coluna de atualização confiável, utilizar hash dos campos relevantes e executar reconciliação completa periódica.

## Estrutura inicial sugerida no Render

- `crti_sync_execucoes`
- `crti_sync_lotes`
- `crti_sync_erros`
- `crti_pedidos_raw`
- `crti_pedido_itens_raw`
- `crti_saidas_material_raw`
- `crti_contas_pagar_receber_raw`
- tabelas ou views normalizadas para consumo da aplicação

Campos de rastreabilidade sugeridos:

- `origem`
- `id_origem`
- `criado_origem_em`
- `atualizado_origem_em`
- `sincronizado_em`
- `hash_origem`
- `execucao_id`
- `dados_origem` em `JSONB`, como apoio de auditoria

## Exclusões e cancelamentos

Registros sincronizados não devem ser apagados fisicamente. Cancelamentos, exclusões ou desaparecimento da origem devem gerar marcação lógica e manter o histórico de auditoria.

## Monitoramento necessário

- Última execução iniciada e concluída.
- Última sincronização bem-sucedida.
- Cursor atual por tabela.
- Registros encontrados, inseridos, atualizados, ignorados e rejeitados.
- Lotes pendentes no ambiente local.
- Último erro e número de tentativas.
- Tempo total da execução.
- Indicador visual verde, amarelo, vermelho ou cinza.

## Estratégia de implantação

1. Criar estrutura e API de integração no Render.
2. Criar o agente local com fila durável.
3. Executar carga inicial completa.
4. Manter fluxo atual e novo em paralelo.
5. Comparar totais, quantidades, valores, situações e saldos.
6. Homologar com usuários selecionados.
7. Fazer a virada somente após estabilidade e ausência de divergências.

## Decisões a confirmar antes da implementação

- Versão e endereço definitivos do PostgreSQL CRTI.
- Tabelas e chaves primárias autorizadas.
- Existência e confiabilidade das colunas de atualização.
- Periodicidade de cada conjunto de dados.
- Volume médio e máximo diário.
- Retenção dos logs e dados brutos.
- Serviço Windows ou tarefa agendada para o agente local.
- Plano do PostgreSQL Render, backups e recuperação.
- Regras de LGPD e campos pessoais autorizados para envio à nuvem.

## Práticas não recomendadas

- Render conectar diretamente ao CRTI local.
- Expor a porta do banco local.
- Depender de login, navegador ou botão Atualizar.
- Usar o frontend como intermediário da sincronização.
- Avançar cursor antes da confirmação do Render.
- Sincronizar apenas uma janela móvel de dias como estratégia definitiva.
- Apagar fisicamente registros sincronizados.
- Substituir o fluxo atual sem período de execução paralela.
