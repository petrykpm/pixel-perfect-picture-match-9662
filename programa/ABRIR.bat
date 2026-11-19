@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul || (echo Python nao encontrado & pause & exit /b)
python -m pip install --quiet pystray pillow
start "" pythonw conquistas_app.py
