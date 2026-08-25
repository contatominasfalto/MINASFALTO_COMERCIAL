# Controle de Cotação

## Implantação automática

Execute no diretório da aplicação:

```powershell
npm run compras:setup
```

Esse único comando cria e valida as tabelas necessárias e importa a planilha-base incluída no projeto. Não é necessário copiar, localizar ou informar manualmente a planilha no servidor.

A execução é idempotente: as tabelas usam `CREATE TABLE IF NOT EXISTS` e o hash SHA-256 impede a importação duplicada da mesma versão da planilha. Portanto, o comando pode ser executado novamente com segurança após um `git pull`.

Para somente conferir a carga, sem alterar o banco:

```powershell
npm run compras:migrate
```

Uma planilha diferente ainda pode ser informada excepcionalmente:

```powershell
npm run compras:migrate -- --file "C:\caminho\planilha.xlsx" --apply
```

## Dados importados

- Todas as células preenchidas e fórmulas são preservadas nas tabelas de carga histórica.
- Fornecedores e candidatos a materiais são organizados nos respectivos cadastros.
- Cada execução aplicada registra arquivo, hash, responsável, data, situação e resumo.

## Permissões

O módulo aparece no Controle de Usuários com permissões separadas para acessar, consultar, criar, editar, excluir, exportar, importar e gerenciar cadastros. O acesso inicial permanece negado aos usuários comuns até que o `admfull` faça a liberação.
