# Licitações com até cinco itens

O cadastro e a edição permitem selecionar de 1 a 5 itens, cada um em um painel expansível no padrão de Entrega. Cada item mantém tipo, quantidade de sacos, valor unitário, lance limite, valor adjudicado e quantidade de toneladas. O valor total usa **quantidade de sacos × valor unitário**, com arredondamento ao centavo por item. O valor inicial do contrato é a soma desses totais. Toneladas é uma informação independente, sem conversão automática.

## Preservação dos dados

- A migração acrescenta somente `licitacoes.itensJson TEXT NULL`. Não executa UPDATE, DELETE nem conversão dos registros existentes.
- Registros antigos são apresentados como um item com os valores existentes. O rótulo anterior (por exemplo, “ÚNICO”) aparece no aviso. O valor inicial histórico permanece intacto enquanto os itens não forem editados, mesmo que seja diferente do cálculo novo.
- Salvar apenas observações, status, órgão, vendedor ou outros dados gerais não regrava os campos financeiros nem o JSON dos itens. Essa proteção também está no servidor.
- Editar explicitamente os itens atualiza a numeração, as quantidades agregadas e o valor do contrato ao salvar. O formulário avisa sobre o recálculo. Cancelar fecha a edição sem gravar.
- Reduzir a quantidade de itens preenchidos exige a confirmação dupla já usada no sistema.
- Os cálculos são repetidos no servidor; totais enviados pelo navegador não são aceitos como fonte de verdade.
- A listagem, os saldos por licitação e os relatórios continuam usando quantidades e valor total agregados. Com vários itens, preço unitário, lance limite e valor adjudicado aparecem como “POR ITEM” na listagem. Os valores individuais ficam na edição. Vínculos de pedidos e adesões continuam por licitação; esta mudança não os distribui automaticamente por item.

## Atualização no servidor Windows

### Correção direta de `Unknown column 'itensJson'`

Se o código já foi atualizado, execute na pasta da aplicação:

```powershell
node scripts/backup-e-corrigir-itens.mjs --apply
```

Esse comando usa o `.env`, localiza a ferramenta de dump, cria um backup completo com nome exclusivo em `C:\Backups\Minasfalto`, verifica o código de saída, o tamanho e o marcador de conclusão do dump e só então acrescenta a coluna pelo script de migração. A senha não é exibida nem passada nos argumentos do processo. Qualquer falha no backup impede a migração. Sem `--apply`, somente verifica o ambiente. `MINASFALTO_BACKUP_DIR` permite escolher outro diretório. Tabelas fora do InnoDB interrompem o procedimento para exigir backup apropriado em manutenção.

A verificação automática do arquivo não equivale a um teste de restauração em produção. O fluxo foi validado com restauração em uma base local descartável. O backup e um resumo da verificação permanecem no diretório indicado. Não é necessário reiniciar a aplicação para a inclusão dessa coluna; após a conclusão, salvar e reabrir a licitação para validar.

A publicação no GitHub não atualiza o servidor. Execute os passos abaixo na pasta real da aplicação no servidor, em janela de manutenção. Preserve o `.env` existente.

### 1. Conferir a instalação

```powershell
Get-Location
git status --short
git branch --show-current
git remote -v
```

Se `git status --short` mostrar arquivos, revise e salve as alterações manuais antes de continuar. Não use `reset --hard`, `clean` ou substituição do `.env`.

Esta cópia não contém a configuração do processo em background. `INICIAR_MINASFALTO_LOCAL.cmd` chama um iniciador em primeiro plano e não identifica o serviço de produção. Para localizar o mecanismo existente, use consultas somente de leitura no PowerShell do servidor:

```powershell
Get-CimInstance Win32_Service |
  Where-Object { $_.Name -match 'minasfalto|node|pm2|nssm' -or $_.DisplayName -match 'minasfalto' -or $_.PathName -match 'minasfalto|nssm|winsw|pm2' } |
  Select-Object Name, DisplayName, State, ProcessId

Get-ScheduledTask |
  Where-Object { $_.TaskName -match 'minasfalto|node|pm2' -or ($_.Actions.Execute -join ' ') -match 'node|npm|minasfalto' -or ($_.Actions.Arguments -join ' ') -match 'minasfalto' } |
  Select-Object TaskName, TaskPath, State

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, ParentProcessId, ExecutablePath
```

Identifique o processo que atende a URL/porta da aplicação e seu serviço ou tarefa. Se houver PM2, consulte a lista na conta que já administra o processo. Não inicie um novo daemon/processo para tentar localizar a aplicação. Não execute um segundo `npm start`.

### 2. Backup antes da mudança de banco

Faça e valide um backup MySQL completo com o procedimento já adotado pela TI. Exemplo, substituindo os dados entre `<...>` pelos dados reais do servidor, sem colocar a senha no comando:

```powershell
$backupLicitacoes = 'C:\Backups\minasfalto-antes-itens.sql'
& '<CAMINHO_DO_MYSQLDUMP.EXE>' --host='<HOST_MYSQL>' --port=3306 --user='<USUARIO_MYSQL>' -p --single-transaction --routines --triggers --events "--result-file=$backupLicitacoes" '<BANCO_MYSQL>'
if ($LASTEXITCODE -ne 0) { throw 'Backup falhou. Não prossiga.' }
Get-Item -LiteralPath $backupLicitacoes | Select-Object FullName, Length, LastWriteTime
```

Use nome de arquivo exclusivo para não substituir backups anteriores. A pasta deve existir. Confirme a integridade/restauração do backup conforme o procedimento da TI; um arquivo não vazio, por si só, não garante um backup restaurável. O script de migração exige o caminho desse arquivo, mas não substitui essa validação.

### 3. Baixar e validar

Com a árvore limpa e o backup concluído:

```powershell
if (git status --porcelain) { throw 'Há alterações locais. Revisar antes de atualizar.' }
if ($LASTEXITCODE -ne 0) { throw 'Falha ao verificar o repositório.' }
$versaoAnteriorMinasfalto = git rev-parse HEAD
Write-Host "Guarde o commit anterior para rollback: $versaoAnteriorMinasfalto"

git pull --ff-only origin feat/licitacao-multiplos-itens
if ($LASTEXITCODE -ne 0) { throw 'Git pull falhou. Não prossiga.' }
npm install
if ($LASTEXITCODE -ne 0) { throw 'Instalação de dependências falhou.' }
npm run env:check
if ($LASTEXITCODE -ne 0) { throw 'Configuração inválida.' }
npm run check
if ($LASTEXITCODE -ne 0) { throw 'Verificação TypeScript falhou.' }
node scripts/migrate-licitacao-itens.mjs
if ($LASTEXITCODE -ne 0) { throw 'Dry-run da migração falhou.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Compilação falhou.' }
```

O `pull --ff-only` interrompe em caso de divergência. Não force a atualização. O dry-run consulta a base e mostra a alteração prevista, sem executá-la.

### 4. Aplicar a migração autorizada e reiniciar

Após conferir o destino mostrado pelo dry-run e o backup, pare o processo **pelo gerenciador já configurado**, aplique a migração e inicie o mesmo processo:

```powershell
# Defina o caminho do backup realmente realizado e validado.
$backupLicitacoes = 'C:\Backups\minasfalto-antes-itens.sql'
node scripts/migrate-licitacao-itens.mjs --apply --backup "$backupLicitacoes"
if ($LASTEXITCODE -ne 0) { throw 'Migração falhou. Não iniciar a versão nova.' }
node scripts/migrate-licitacao-itens.mjs
if ($LASTEXITCODE -ne 0) { throw 'Validação da coluna falhou.' }
# Inicie o mesmo serviço/processo, pelo mecanismo identificado no passo 1.
```

O nome real do serviço/tarefa/PM2 deve ser confirmado no servidor antes de preencher o comando de parada e início. Nenhum serviço pode ser deduzido apenas da informação “roda em background”.

### 5. Aceite em produção

1. Acessar pela URL e base path habituais da rede, autenticar e verificar permissões.
2. Abrir uma licitação antiga e comparar os valores com o backup/registro anterior; cancelar não deve gravar nada.
3. Em um registro de teste autorizado, salvar somente observações e confirmar que os valores históricos permanecem iguais.
4. Criar uma licitação de teste com dois itens, conferir os totais, salvar e reabrir; testar até cinco itens e a confirmação ao reduzir.
5. Conferir documentos, listagem, saldos e relatórios. A integração CRTI permanece dependente da restauração/liberação de rede e deve ser validada quando voltar a estar disponível.

Não considerar a implantação concluída antes desse aceite no servidor.

## Rollback

Guarde o commit anterior e o backup fora do repositório. Se a nova versão falhar, pare o processo pelo gerenciador existente, retorne ao commit anterior em uma branch de recuperação, reinstale dependências, valide e compile, e só então reinicie o mesmo serviço. Não use comandos destrutivos sobre alterações locais.

A coluna nova pode permanecer: o código anterior não a consulta. **Não remova a coluna**, pois pode conter itens já cadastrados. Se já houver registros com múltiplos itens, mantenha a edição de licitações indisponível no código antigo até retornar à versão nova ou definir uma recuperação dos dados. Restaurar o backup pode apagar lançamentos posteriores e exige autorização específica.

## Validação desta versão

- `npm run check` e `npm run build`.
- Suíte completa: `npm test -- --fileParallelism=false`, com MySQL/MariaDB descartável e CRTI apontado para uma porta local sem serviço. Isso testa o tratamento de indisponibilidade, não a integração CRTI real.
- Testes novos de cálculos, validação, leitura de legado e persistência real. Os testes de banco exigem `LICITACAO_ITENS_TEST_DATABASE_URL` na base descartável `codex_licitacao_itens_test`, em `127.0.0.1:33317`; nunca apontar testes à produção.
- Dry-run, backup da base fictícia, aplicação, reaplicação e comparação de todos os campos históricos antes/depois.
- Chromium com a tela real e APIs simuladas: carregamento do legado, edição de observações sem envio de itens, 1–5 itens, soma, expansão, cancelamento da redução, gravação e tamanhos desktop/mobile.

A migração e a validação da instalação de produção permanecem a cargo do procedimento acima.
