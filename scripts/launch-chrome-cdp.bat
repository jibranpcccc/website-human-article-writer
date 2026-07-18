@echo off
setlocal
chcp 65001 >nul
set CDP_PORT=19321
set SESSION_DIR=%~dp0..\server\sessions\chrome-cdp-19321
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist %CHROME% (
  set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME% (
  echo ERROR: Could not find chrome.exe. Please install Google Chrome.
  pause
  exit /b 1
)

if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"

echo Launching Chrome with remote debugging on port %CDP_PORT%...
echo Log in to ChatGPT in this window, then run run-all.bat.
echo.

start "" %CHROME% --remote-debugging-port=%CDP_PORT% --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check "https://chat.openai.com"

endlocal
