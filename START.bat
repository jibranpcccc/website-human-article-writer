@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title BigPickle Article Writer
color 0A

cls
echo.
echo  ============================================================
echo   BigPickle AI Article Writer - Starting...
echo  ============================================================
echo.

:: ── Step 1: Check Node.js ────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
  color 0C
  echo  [ERROR] Node.js is not installed!
  echo.
  echo  Please install it from: https://nodejs.org/
  echo  Download the LTS version, install it, then run this file again.
  echo.
  pause
  exit /b 1
)
echo  [OK] Node.js found.

:: ── Step 2: Install dependencies if needed ───────────────────
if not exist "%~dp0node_modules\vite" (
  echo.
  echo  [SETUP] Installing packages for first time... (takes 1-2 minutes)
  echo  Please wait, do not close this window.
  echo.
  call npm install --silent
  if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] Package install failed. Check your internet connection.
    pause
    exit /b 1
  )
  echo  [OK] Packages installed.
)
echo  [OK] Packages ready.

:: ── Step 3: Locate Chrome ────────────────────────────────────
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
  echo  [ERROR] Google Chrome not found!
  echo  Please install Chrome from: https://www.google.com/chrome/
  pause
  exit /b 1
)
echo  [OK] Chrome found.

:: ── Step 4: Ports and paths ──────────────────────────────────
set CDP_PORT=19321
set BRIDGE_PORT=19322
set VITE_PORT=19323
set SESSION_DIR=%~dp0server\sessions\chrome-cdp-19321

if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"
del /f /q "%SESSION_DIR%\SingletonLock" 2>nul
del /f /q "%SESSION_DIR%\SingletonSocket" 2>nul

:: ── Step 5: Allow through Windows Firewall automatically ─────
echo  [OK] Configuring firewall (may ask for admin)...
netsh advfirewall firewall delete rule name="BigPickle-Vite" >nul 2>nul
netsh advfirewall firewall add rule name="BigPickle-Vite" dir=in action=allow protocol=TCP localport=%VITE_PORT% >nul 2>nul
netsh advfirewall firewall delete rule name="BigPickle-Bridge" >nul 2>nul
netsh advfirewall firewall add rule name="BigPickle-Bridge" dir=in action=allow protocol=TCP localport=%BRIDGE_PORT% >nul 2>nul

:: ── Step 6: Get LAN IP ───────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
  set LAN_IP=%%a
  goto :got_ip
)
:got_ip
set LAN_IP=%LAN_IP: =%

:: ── Step 7: Launch Chrome ────────────────────────────────────
echo  [OK] Launching Chrome with ChatGPT...
start "" "%CHROME_PATH%" --remote-debugging-port=%CDP_PORT% --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check "https://chatgpt.com"

:: ── Step 8: Start bridge + Vite in background ────────────────
echo  [OK] Starting servers...
start "BigPickle-Servers" /MIN cmd /c "node server/startAll.js > server_log.txt 2>&1"

:: ── Step 9: Wait until Vite is actually ready ────────────────
echo  [..] Waiting for app to be ready...
set READY=0
for /L %%i in (1,1,30) do (
  if !READY!==0 (
    timeout /t 1 /nobreak >nul
    curl -s http://127.0.0.1:%VITE_PORT% >nul 2>nul
    if !errorlevel!==0 (
      set READY=1
    )
  )
)

if !READY!==0 (
  :: Curl not available, just wait 10 seconds
  timeout /t 8 /nobreak >nul
)

:: ── Step 10: Open browser ────────────────────────────────────
echo  [OK] Opening app in your browser...
start http://127.0.0.1:%VITE_PORT%/

:: ── Step 11: Show info ───────────────────────────────────────
cls
color 0A
echo.
echo  ============================================================
echo   BigPickle AI Article Writer - RUNNING!
echo  ============================================================
echo.
echo   Your URL:         http://127.0.0.1:%VITE_PORT%/
echo   Team (WiFi):      http://%LAN_IP%:%VITE_PORT%/
echo.
echo  ============================================================
echo   IMPORTANT:
echo   1. In the Chrome window that opened, LOG IN to ChatGPT
echo      if you are not already logged in.
echo   2. KEEP THIS WINDOW OPEN while using the app.
echo   3. To stop, close this window.
echo  ============================================================
echo.
echo  Press any key to STOP the servers and exit.
echo.
pause >nul

:: ── Cleanup ──────────────────────────────────────────────────
taskkill /f /fi "WINDOWTITLE eq BigPickle-Servers*" >nul 2>nul
echo  Servers stopped. Goodbye!
timeout /t 2 /nobreak >nul
