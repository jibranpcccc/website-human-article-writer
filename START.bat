@echo off
setlocal enabledelayedexpansion
title BigPickle Article Writer
color 0A

cls
echo.
echo  ============================================================
echo   BigPickle AI Article Writer - Starting...
echo  ============================================================
echo.

:: Set working directory to where this bat file is
cd /d "%~dp0"

:: ─── STEP 1: Kill anything on our ports ──────────────────────
echo  [1/7] Clearing ports...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":19321 "') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":19322 "') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":19323 "') do taskkill /F /PID %%a >nul 2>nul
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul
echo  [OK] Ports cleared.

:: ─── STEP 2: Check Node.js ───────────────────────────────────
echo  [2/7] Checking Node.js...
node --version >nul 2>nul
if errorlevel 1 goto :no_node
echo  [OK] Node.js found.
goto :check_npm_packages

:no_node
color 0C
echo.
echo  ERROR: Node.js not found!
echo  Download from: https://nodejs.org/ then run this again.
echo.
pause
exit /b 1

:: ─── STEP 3: Install packages ────────────────────────────────
:check_npm_packages
echo  [3/7] Checking packages...
if exist "node_modules\vite\package.json" goto :packages_ok
echo  [..] Installing packages (first time - 1-3 min)...
call npm install
if errorlevel 1 goto :npm_fail
:packages_ok
echo  [OK] Packages ready.
goto :find_chrome

:npm_fail
color 0C
echo.
echo  ERROR: npm install failed. Check internet connection.
echo.
pause
exit /b 1

:: ─── STEP 4: Find Chrome ─────────────────────────────────────
:find_chrome
echo  [4/7] Finding Chrome...
set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME goto :no_chrome
echo  [OK] Chrome found.
goto :start_chrome

:no_chrome
color 0C
echo.
echo  ERROR: Chrome not found!
echo  Install from: https://www.google.com/chrome/
echo.
pause
exit /b 1

:: ─── STEP 5: Launch Chrome ───────────────────────────────────
:start_chrome
echo  [5/7] Launching Chrome...
set "SESS=server\sessions\chrome-cdp-19321"
if not exist "%SESS%" mkdir "%SESS%"
del /f /q "%SESS%\SingletonLock" 2>nul
del /f /q "%SESS%\SingletonSocket" 2>nul
start "" "%CHROME%" --remote-debugging-port=19321 "--user-data-dir=%SESS%" --no-first-run --no-default-browser-check "https://chatgpt.com"
echo  [OK] Chrome launched - LOG IN to ChatGPT if asked!

:: ─── STEP 6: Start servers ───────────────────────────────────
echo  [6/7] Starting servers...
start "BP-Servers" /MIN node server/startAll.js

:: ─── STEP 7: Wait for server to be ready ─────────────────────
echo  [7/7] Waiting for app to be ready...
set READY=0
for /L %%i in (1,1,30) do (
  if !READY!==0 (
    timeout /t 1 /nobreak >nul
    netstat -ano 2>nul | findstr ":19323 " >nul
    if not errorlevel 1 set READY=1
  )
)

if !READY!==0 (
  color 0C
  echo.
  echo  ERROR: Server did not start in 30 seconds.
  echo  Try: Right-click START.bat and Run as Administrator
  echo.
  pause
  exit /b 1
)

:: ─── Open browser & show info ────────────────────────────────
timeout /t 1 /nobreak >nul
start http://127.0.0.1:19323/

for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
  set "LAN=%%a"
  goto :show_info
)
:show_info
set "LAN=%LAN: =%"

cls
color 0A
echo.
echo  ============================================================
echo   BigPickle AI Article Writer - RUNNING!
echo  ============================================================
echo.
echo   Your URL (this PC):   http://127.0.0.1:19323/
echo   Team URL (WiFi):      http://%LAN%:19323/
echo.
echo   - Log into ChatGPT in the Chrome window that opened
echo   - Keep THIS window open while using the app
echo   - Press any key here to STOP and exit
echo.
echo  ============================================================
echo.
pause >nul

:: ─── Cleanup ─────────────────────────────────────────────────
taskkill /F /FI "WINDOWTITLE eq BP-Servers*" >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":19322 "') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":19323 "') do taskkill /F /PID %%a >nul 2>nul
taskkill /F /IM node.exe >nul 2>nul
echo  Stopped. Goodbye!
timeout /t 2 /nobreak >nul
