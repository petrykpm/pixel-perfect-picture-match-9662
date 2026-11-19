@echo off
set "D=%~dp0"
set "V=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\conquistas.vbs"
> "%V%" echo CreateObject("Wscript.Shell").Run "pythonw ""%D%conquistas_app.py"" --sem-navegador", 0
echo Pronto: vai iniciar sozinho com o Windows.
pause
