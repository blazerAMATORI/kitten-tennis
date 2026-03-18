@echo off
REM Kitten Tennis Quick Start for Windows

echo.
echo ============================================
echo 🐱 KITTEN TENNIS v2.1 - QUICK START
echo ============================================
echo.

REM Check if Node is installed
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found! 
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js is installed
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ npm install failed!
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
    echo.
)

echo.
echo ============================================
echo 🚀 Starting Kitten Tennis server...
echo ============================================
echo.
echo 🌍 Open your browser and go to:
echo.
echo    http://localhost:3000
echo.
echo 🎮 Or on mobile: 
echo    http://YOUR_COMPUTER_IP:3000
echo.
echo (Ctrl+C to stop the server)
echo.

call npm start

pause
