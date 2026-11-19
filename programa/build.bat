@echo off
cd /d "%~dp0"
python -m pip install --upgrade pyinstaller
python -m PyInstaller --onefile --noconsole --add-data "web;web" --name ConquistasManager conquistas_app.py
xcopy /E /I /Y gabaritos dist\gabaritos
echo Pronto: dist\ConquistasManager.exe
pause
