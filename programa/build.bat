@echo off
rem Gera o executavel (pasta dist\GerenciadorConquistas) e, se o Inno Setup estiver instalado, o instalador (pasta saida).
cd /d "%~dp0"
if not exist web\_shell.html (
  echo Falta a pasta web. Na raiz do projeto rode: bun run empacotar
  pause & exit /b 1
)
python -m pip install --upgrade pyinstaller pystray pillow || (pause & exit /b 1)
python -m PyInstaller --noconfirm --clean --onedir --noconsole --name GerenciadorConquistas --icon icone.ico ^
  --add-data "web;web" --add-data "gabaritos;gabaritos" --add-data "icone.ico;." ^
  --hidden-import pystray._win32 --distpath dist --workpath build conquistas_app.py || (pause & exit /b 1)
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ISCC%" (
  "%ISCC%" instalador.iss
  echo Instalador em: saida\
) else (
  echo Executavel pronto em dist\GerenciadorConquistas. Para o instalador, instale o Inno Setup 6: https://jrsoftware.org/isdl.php
)
pause
