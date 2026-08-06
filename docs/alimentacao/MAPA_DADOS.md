# Mapa de dados

| Legado | Destino | Regra |
|---|---|---|
| `funcionarios` | `alimentacao_funcionarios` | preserva nome, setor, ativo e `origem_id` |
| `fornecedores` | `alimentacao_fornecedores` | preserva nome, valor da refeição, ativo e `origem_id` |
| grupo de `refeicoes` | `alimentacao_lancamentos` | agrupado por fornecedor, data e número da nota; sem nota usa o identificador legado para não unir operações distintas |
| `refeicoes` | `alimentacao_lancamento_itens` | quantidade e valor unitário por funcionário; o extra legado é consolidado uma única vez no cabeçalho |
| `custos` | `alimentacao_custos_extras` | preserva descrição, categoria, valor e data |

As chaves `origem_sistema + origem_id` garantem rastreabilidade e idempotência. Nomes não são usados como vínculo automático. Registros órfãos, duplicados ou com valores inconsistentes são apresentados no relatório da migração e não são silenciosamente corrigidos.

