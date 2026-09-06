@echo off
cd /d "%~dp0"
echo Building web app...
cd apps\web
D:\nodejs\node.exe node_modules\vite\bin\vite.js build
if %ERRORLEVEL% neq 0 (
  cd ..\..
  echo Web build failed. Aborting.
  pause
  exit /b 1
)
cd ..\..
echo Bundling server...
D:\nodejs\node.exe scripts\bundle.mjs
if %ERRORLEVEL% neq 0 (
  echo Bundle failed. Aborting.
  pause
  exit /b 1
)
echo Done. You can now run start.bat.
pause
