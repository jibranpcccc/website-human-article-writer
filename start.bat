@echo off
title AI Article Writer - Starting...
color 0A

echo.
echo  =========================================
echo   AI Article Writer - Local Launcher
echo  =========================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from https://nodejs.org
    echo  Download the LTS version and run the installer.
    echo.
    pause
    start https://nodejs.org
    exit /b 1
)

echo  [OK] Node.js found: 
node --version

:: Install dependencies if node_modules missing
if not exist "node_modules" (
    echo.
    echo  [SETUP] First-time setup - installing dependencies...
    echo  This will take about 30 seconds. Please wait...
    echo.
    npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Failed to install dependencies.
        echo  Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies installed successfully!
)

echo.
echo  [STARTING] Launching AI Article Writer...
echo  The app will open in your browser automatically.
echo  To stop the app, close this window.
echo.
echo  =========================================
echo.

npm run dev
