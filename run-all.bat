@echo off
cd /d "%~dp0"
title BigPickle Article Writer Launcher

cls
echo ============================================================
echo  BigPickle ChatGPT Article Writer Launcher
echo ============================================================
echo.

:: 1) Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ERROR: Node.js is not installed on this computer!
  echo.
  echo To fix this:
  echo 1. Download and install Node.js from: https://nodejs.org/
  echo 2. After installing, re-run this run-all.bat file.
  echo.
  pause
  exit /b 1
)

:: 2) Check dependencies
if not exist "%~dp0node_modules\vite" (
  echo [Info] Installing required dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm install failed. Please check your internet connection.
    pause
    exit /b 1
  )
)

:: 3) Locate Chrome
set CHROME_PATH=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if "%CHROME_PATH%"=="" (
  echo ERROR: Google Chrome was not found on this computer.
  echo Please install Google Chrome from https://www.google.com/chrome/ and try again.
  pause
  exit /b 1
)

set CDP_PORT=19321
set BRIDGE_PORT=19322
set VITE_PORT=19323
set SESSION_DIR=%~dp0server\sessions\chrome-cdp-19321

cls
echo ============================================================
echo  BigPickle ChatGPT Article Writer Launcher
echo ============================================================
echo.
echo Choose Chrome mode:
echo.
echo  1. Visible browser window  [RECOMMENDED]
echo     - Opens Chrome so you can log into ChatGPT.
echo.
echo  2. Headless browser  [BACKGROUND]
echo     - Runs Chrome in background (must be logged in already).
echo.
set /p MODE_CHOICE="Select mode [1 or 2]: "

if "%MODE_CHOICE%"=="2" (
  set CHROME_MODE=headless
  set CHROME_FLAGS=--headless=new --remote-debugging-port=%CDP_PORT% --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check --disable-features="OptimizationGuideModelDownloading,OptimizationHintsFetching"
  echo [Mode] HEADLESS selected.
) else (
  set CHROME_MODE=visible
  set CHROME_FLAGS=--remote-debugging-port=%CDP_PORT% --user-data-dir="%SESSION_DIR%" --no-first-run --no-default-browser-check --disable-features="OptimizationGuideModelDownloading,OptimizationHintsFetching"
  echo [Mode] VISIBLE selected.
)

echo.
echo Do you want a PUBLIC INTERNET link (so anyone in the world can access)?
echo.
echo  1. NO  - Only usable on this PC and same WiFi  [DEFAULT]
echo  2. YES - Generate a public internet link via tunnel
echo.
set /p TUNNEL_CHOICE="Select [1 or 2]: "

if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"

:: Remove stale Chrome lock files
del /f /q "%SESSION_DIR%\SingletonLock" 2>nul
del /f /q "%SESSION_DIR%\SingletonSocket" 2>nul

:: 4) Launch Chrome
echo.
echo [1/3] Launching Chrome on port %CDP_PORT%...
start "" %CHROME_PATH% %CHROME_FLAGS% "https://chatgpt.com"

:: 5) Get LAN IP for sharing
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
  set LAN_IP=%%a
  goto :got_ip
)
:got_ip
set LAN_IP=%LAN_IP: =%

:: 6) Open Browser UI after 6 seconds
start /b cmd /c "timeout /t 6 /nobreak >nul && start http://127.0.0.1:%VITE_PORT%/"

:: 7) If tunnel selected, start localtunnel in a separate window
if "%TUNNEL_CHOICE%"=="2" (
  echo [3/3] Starting public internet tunnel...
  echo NOTE: Your public URL will appear in the new window that opens.
  echo       Copy that URL and send it to your users anywhere in the world.
  echo.
  start "Public Internet Tunnel" cmd /k "npx -y localtunnel --port %VITE_PORT% && pause"
)

echo [2/3] Starting servers...
echo.
echo ============================================================
echo  READY! Here are your access links:
echo.
echo  >> YOU (this PC):
echo     http://127.0.0.1:%VITE_PORT%/
echo.
echo  >> SAME WiFi users:
echo     http://%LAN_IP%:%VITE_PORT%/
echo.
if "%TUNNEL_CHOICE%"=="2" (
  echo  >> INTERNET users (anyone in world):
  echo     Check the "Public Internet Tunnel" window for your link.
  echo     It looks like: https://abc123.loca.lt
  echo.
)
echo  IMPORTANT: Keep this window OPEN while the app is in use.
echo  IMPORTANT: Log into ChatGPT in the Chrome window if prompted.
echo ============================================================
echo.

:: 8) Start Servers
node server/startAll.js

if %errorlevel% neq 0 (
  echo.
  echo [Notice] Server process exited with code %errorlevel%.
)

pause
