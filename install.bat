@echo off
REM PUPPERDRAW - instala dependencias
cd /d "%~dp0"
echo Instalando dependencias de PUPPERDRAW...
call npm install
if errorlevel 1 (
  echo ERROR: npm install fallo
  pause
  exit /b 1
)
echo Listo. Ahora corre run.bat
pause
