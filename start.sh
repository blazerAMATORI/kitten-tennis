#!/bin/bash

echo ""
echo "============================================"
echo "🐱 KITTEN TENNIS v2.1 - QUICK START"
echo "============================================"
echo ""

# Check if Node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found!"
    echo ""
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    echo "Or use Homebrew (Mac):"
    echo "  brew install node"
    echo ""
    echo "Or use apt (Linux):"
    echo "  sudo apt install nodejs npm"
    echo ""
    exit 1
fi

echo "✅ Node.js is installed: $(node -v)"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ npm install failed!"
        exit 1
    fi
    echo "✅ Dependencies installed"
    echo ""
fi

echo ""
echo "============================================"
echo "🚀 Starting Kitten Tennis server..."
echo "============================================"
echo ""
echo "🌍 Open your browser and go to:"
echo ""
echo "   http://localhost:3000"
echo ""
echo "🎮 Or on mobile:"
echo "   http://YOUR_COMPUTER_IP:3000"
echo ""
echo "(Press Ctrl+C to stop the server)"
echo ""

npm start
