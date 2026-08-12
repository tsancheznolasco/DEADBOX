@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required.
  exit /b 1
)

npm install
if errorlevel 1 exit /b 1
npm run verify
if errorlevel 1 exit /b 1
npm test
if errorlevel 1 exit /b 1

echo Setup complete. Run start-windows.bat
