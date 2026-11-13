@echo off
REM PUPPERDRAW - arranca el servidor (puerto 5124, base /pupperdraw)
cd /d "%~dp0"
set PORT=5124
set BASE_PATH=/pupperdraw

echo Liberando el puerto %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo.
echo  PUPPERDRAW en http://localhost:%PORT%%BASE_PATH%/
echo.
node server.js
pause
