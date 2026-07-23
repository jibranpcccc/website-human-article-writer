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
echo     - Runs Chrome in background.
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

if not exist "%SESSION_DIR%" mkdir "%SESSION_DIR%"

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

echo [2/3] Starting servers...
echo.
echo ============================================================
echo  INSTRUCTIONS:
echo  1. In the Chrome window, LOG IN to ChatGPT if prompted.
echo  2. YOUR Web App URL (open on this PC):
echo     http://127.0.0.1:%VITE_PORT%/
echo.
echo  3. SHARE WITH OTHER USERS on same WiFi:
echo     http://%LAN_IP%:%VITE_PORT%/
echo     (They open this URL in their browser)
echo.
echo  4. Keep this terminal window OPEN while generating.
echo ============================================================
echo.

:: 6) Start Servers via pure Node.js launcher
node server/startAll.js

if %errorlevel% neq 0 (
  echo.
  echo [Notice] Server process exited with code %errorlevel%.
)

pause
