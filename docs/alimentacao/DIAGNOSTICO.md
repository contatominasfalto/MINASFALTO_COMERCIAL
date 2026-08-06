# Diagnóstico técnico — Controle de Alimentação

## Origem analisada

O projeto de referência é uma aplicação Flask/PyMySQL independente, com autenticação, sessão e banco próprios. A aplicação principal é React/Vite, Express/tRPC e MySQL, com autenticação e perfis centralizados. Por isso, o código antigo não foi copiado como uma segunda aplicação: suas regras e dimensões visuais foram reinterpretadas como módulo nativo.

## Decisões de integração

- rota nativa: `/alimentacao`;
- autenticação: sessão já fornecida por `protectedProcedure`;
- acesso: perfis administrativos/gestão que já podem acessar painéis de custo (`admfull`, `gerencia` e `diretoria`);
- banco: mesmo `DATABASE_URL` MySQL da aplicação principal;
- tabelas novas com prefixo `alimentacao_`;
- funcionários e fornecedores permanecem cadastros próprios do módulo. `users` representa usuários do sistema, não colaboradores que recebem refeições, e os dados CRTI são transacionais, não um cadastro mestre equivalente;
- exclusão lógica e auditada para lançamentos/custos; cadastros com histórico são inativados, não apagados;
- valores monetários usam `DECIMAL`, datas de negócio usam `DATE`.

## Referência visual preservada

Foram mantidas as proporções funcionais do sistema legado: formulários com campos de pelo menos 42 px, lançamento em duas áreas, lista de itens com altura útil de 260 px, histórico com rolagem e largura mínima de 860 px, cartões do painel em quatro colunas e rankings em duas. Cores, tipografia, navegação e botões seguem a identidade SAP-like do sistema principal.

## Riscos e controles

- A migração não cria tabelas durante a execução normal da aplicação.
- A importação é `dry-run` por padrão e só grava com `--apply`.
- Nenhuma credencial do projeto legado foi incorporada.
- O banco legado não é removido pelo procedimento.
- Publicação e migração em produção dependem de backup e autorização formal.

