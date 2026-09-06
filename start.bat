@echo off
cd /d "%~dp0"
echo Starting minecraft-schematic-lab preview server...
echo.
node bundle\server.mjs
echo.
echo Server stopped (exit code %ERRORLEVEL%).
pause
