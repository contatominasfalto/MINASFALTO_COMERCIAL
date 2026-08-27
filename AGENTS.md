# Instruções operacionais para agentes Codex

Estas regras se aplicam a todo o repositório.

## Ambiente de produção

- A aplicação final roda em um servidor local/on-premises da Minasfalto.
- O GitHub é usado para versionar e distribuir o código; enviar commits ao GitHub não conclui a implantação.
- O fluxo oficial é: desenvolver em branch, validar, revisar, publicar no GitHub, executar `git pull` no servidor local, instalar dependências, validar configuração, compilar, reiniciar o serviço e testar no próprio ambiente de produção.
- Não presuma Cloud Run, Render, A2 Hosting ou outro provedor como runtime oficial apenas porque existem referências históricas ou bibliotecas de plataforma no repositório.

## Regras para mudanças e publicação

- Preserve o `.env` do servidor e nunca versione ou substitua credenciais.
- Antes de orientar `git pull`, confirme que não há alterações manuais não salvas no servidor.
- Mudanças de banco exigem backup, autorização, validação em dry-run/homologação quando disponível e plano de rollback.
- Execute `npm run check`, `npm test` e `npm run build` antes de publicar no GitHub.
- No servidor, execute `npm install`, `npm run env:check`, `npm run check` e `npm run build` antes do reinício.
- Use o gerenciador de processos/serviço já configurado; não inicie uma segunda instância concorrente.
- Após reiniciar, faça smoke tests em produção local: autenticação, permissões, módulos alterados, MySQL, CRTI quando aplicável, documentos e acesso pela URL/base path da rede.
- Não declare a implantação concluída antes dessa validação final. Se não houver acesso ao servidor, registre explicitamente que a validação de produção continua pendente.

Consulte `PROJECT_OVERVIEW.md`, seção “Ambiente oficial e processo de publicação”, para o fluxo completo.
