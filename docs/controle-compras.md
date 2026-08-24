# Controle de Compras

## Implantação

Execute no diretório da aplicação, antes de reiniciar o servidor:

```powershell
npm run compras:schema
npm run compras:schema -- --apply
npm run compras:migrate -- --file "C:\caminho\COTAÇÃO MATERIAIS DE CONSTRUÇÃO (version 1).xlsb.xlsx"
npm run compras:migrate -- --file "C:\caminho\COTAÇÃO MATERIAIS DE CONSTRUÇÃO (version 1).xlsb.xlsx" --apply
```

O primeiro comando de cada par é apenas diagnóstico. A carga é idempotente: o hash SHA-256 do arquivo impede que a mesma versão da planilha seja importada duas vezes.

## Dados importados

- Todas as células preenchidas e fórmulas são preservadas nas tabelas de carga histórica.
- Fornecedores e candidatos a materiais são organizados nos respectivos cadastros.
- Cada execução aplicada registra arquivo, hash, responsável, data, situação e resumo.

## Permissões

O módulo aparece no Controle de Usuários com permissões separadas para acessar, consultar, criar, editar, excluir, exportar, importar e gerenciar cadastros. O acesso inicial permanece negado aos usuários comuns até que o `admfull` faça a liberação.
