@echo off
cd /d "%~dp0"
chcp 65001 >nul
setlocal enabledelayedexpanded

set CDP_PORT=19321
set BRIDGE_PORT=19322
set VITE_PORT=19323
set SESSION_DIR=%~dp0server\sessions\chrome-cdp-19321
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist %CHROME% (
  set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

cls
echo ============================================================
echo  BigPickle ChatGPT Browser Bridge Launcher

echo ============================================================
echo.
echo Ports: CDP=%CDP_PORT%  Bridge=%BRIDGE_PORT%  UI=%VITE_PORT%
echo.

if not exist %CHROME% (
  echo ERROR: Could not find chrome.exe. Please install Google Chrome.
  pause
  exit /b 1
)

:choose_mode
cls
echo ============================================================
echo  BigPickle ChatGPT Browser Bridge Launcher

echo ============================================================
echo.
echo Choose how Chrome should run:
echo.
echo  1) Visible browser window  ^(recommended^)
echo     - Easiest for logging in to ChatGPT the first time.
echo     - You can see the prompt being sent and the reply typing.
echo.
echo  2) Headless browser  ^(advanced^)
echo     - Runs Chrome in the background with no window.
echo     - Only works if you are ALREADY logged in to ChatGPT
echo       in the session folder, otherwise it will fail.
echo.
choice /c 12 /n /m "Select mode [1/2]: "
if errorlevel 2 (
  set CHROME_MODE=headless
  set CHROME_FLAGS=--headless=new --remote-debugging-port=%CDP_PORT% --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check
  echo.
  echo [Mode] HEADLESS selected.
) else if errorlevel 1 (
  set CHROME_MODE=visible
  set CHROME_FLAGS=--remote-debugging-port=%CDP_PORT% --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check
  echo.
  echo [Mode] VISIBLE browser selected.
) else (
  goto choose_mode
)

if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"

:: 1) Launch Chrome with CDP
echo [1/2] Launching Chrome ^(%CHROME_MODE%^) on port %CDP_PORT%...
start "" %CHROME% %CHROME_FLAGS% "https://chat.openai.com"
timeout /t 2 /nobreak >nul

:: 2) Set Environment Variables
set BIGPICKLE_PORT=%BRIDGE_PORT%
set BIGPICKLE_CDP_HOST=http://127.0.0.1:%CDP_PORT%
set VITE_BIGPICKLE_BRIDGE=http://127.0.0.1:%BRIDGE_PORT%
if "%CHROME_MODE%"=="headless" (
  set BIGPICKLE_HEADLESS=true
) else (
  set BIGPICKLE_HEADLESS=false
)

:: 3) Open browser UI
echo Opening http://127.0.0.1:%VITE_PORT%/
start "" "http://127.0.0.1:%VITE_PORT%/"

:: 4) Run both services concurrently in the same terminal window
echo [2/2] Starting bridge server and Vite UI concurrently...
npx concurrently --kill-others -n "Bridge,Vite-UI" -c "magenta,blue" "node server/index.js" "npx vite --host 127.0.0.1 --port %VITE_PORT% --strictPort"

endlocal

