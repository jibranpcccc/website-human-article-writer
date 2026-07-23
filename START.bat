@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title BigPickle Article Writer
color 0A

cls
echo.
echo  ============================================================
echo   BigPickle AI Article Writer - Starting Up...
echo  ============================================================
echo.

:: ── STEP 1: Kill ANYTHING already using our ports ────────────
echo  [1/6] Clearing ports 19321, 19322, 19323...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":19321 " 2^>nul') do (
  taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":19322 " 2^>nul') do (
  taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":19323 " 2^>nul') do (
  taskkill /F /PID %%a >nul 2>nul
)

:: Kill any leftover node processes from previous runs
taskkill /F /IM node.exe >nul 2>nul

timeout /t 2 /nobreak >nul
echo  [OK] Ports cleared.

:: ── STEP 2: Check Node.js ────────────────────────────────────
echo  [2/6] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
  color 0C
  echo.
  echo  ============================================================
  echo   ERROR: Node.js is NOT installed!
  echo.
  echo   Please:
  echo   1. Go to https://nodejs.org/
  echo   2. Download the LTS version
  echo   3. Install it
  echo   4. Run this file again
  echo  ============================================================
  echo.
  pause
  exit /b 1
)
echo  [OK] Node.js found.

:: ── STEP 3: Install npm packages if missing ──────────────────
echo  [3/6] Checking packages...
if not exist "%~dp0node_modules\vite" (
  echo  [..] First time setup - installing packages (1-3 min)...
  call npm install
  if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: npm install failed. Check internet connection.
    pause
    exit /b 1
  )
)
echo  [OK] Packages ready.

:: ── STEP 4: Locate Chrome ────────────────────────────────────
echo  [4/6] Locating Chrome...
set CHROME_PATH=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
)

if "%CHROME_PATH%"=="" (
  color 0C
  echo.
  echo  ERROR: Chrome not found. Install from https://www.google.com/chrome/
  pause
  exit /b 1
)
echo  [OK] Chrome found.

:: ── STEP 5: Launch Chrome ────────────────────────────────────
echo  [5/6] Launching Chrome...
set SESSION_DIR=%~dp0server\sessions\chrome-cdp-19321
if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"
del /f /q "%SESSION_DIR%\SingletonLock" 2>nul
del /f /q "%SESSION_DIR%\SingletonSocket" 2>nul
start "" "%CHROME_PATH%" --remote-debugging-port=19321 --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check "https://chatgpt.com"
echo  [OK] Chrome launched.

:: ── STEP 6: Start servers ────────────────────────────────────
echo  [6/6] Starting servers...
del /f /q "%~dp0server_log.txt" 2>nul
start "BP-Servers" /MIN cmd /c "node server/startAll.js > "%~dp0server_log.txt" 2>&1"

:: Wait for port 19323 to actually start accepting connections
echo  [..] Waiting for app server to be ready (up to 30 seconds)...
set /a TRIES=0
:wait_loop
set /a TRIES+=1
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":19323 " >nul 2>nul
if %errorlevel%==0 goto :server_ready
if !TRIES! LSS 30 goto :wait_loop

:: If we get here, server didn't start - show the log
color 0C
cls
echo.
echo  ============================================================
echo   ERROR: Server failed to start after 30 seconds!
echo  ============================================================
echo.
echo  Server log output:
echo  ------------------------------------------
type "%~dp0server_log.txt" 2>nul
echo  ------------------------------------------
echo.
echo  Common fixes:
echo  - Close any other apps using ports 19322 or 19323
echo  - Re-run this file as Administrator (right-click START.bat)
echo.
pause
exit /b 1

:server_ready
:: ── Get LAN IP ───────────────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
  set LAN_IP=%%a
  goto :got_ip
)
:got_ip
set LAN_IP=%LAN_IP: =%

:: Open browser
timeout /t 1 /nobreak >nul
start http://127.0.0.1:19323/

cls
color 0A
echo.
echo  ============================================================
echo   BigPickle AI Article Writer - RUNNING!
echo  ============================================================
echo.
echo   Your URL:     http://127.0.0.1:19323/
echo   Team WiFi:    http://%LAN_IP%:19323/
echo.
echo  ============================================================
echo.
echo   IMPORTANT: Log into ChatGPT in the Chrome window!
echo   IMPORTANT: Keep this window OPEN while using the app.
echo.
echo  ============================================================
echo.
echo  Press any key to STOP everything and exit...
pause >nul

:: Cleanup
echo.
echo  Stopping all servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":19322 " 2^>nul') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":19323 " 2^>nul') do taskkill /F /PID %%a >nul 2>nul
taskkill /F /IM node.exe >nul 2>nul
echo  Done. Goodbye!
timeout /t 2 /nobreak >nul
