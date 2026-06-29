@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js e tente novamente.
  echo.
  pause
  exit /b 1
)

node scripts\launch-local.mjs --demo
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo A inicializacao nao foi concluida.
  echo Corrija o erro mostrado acima e execute este arquivo novamente.
  echo.
  pause
)

exit /b %EXIT_CODE%
