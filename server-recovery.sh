#!/bin/bash
# Thesara Server Recovery Script
# Koristi se ako server bude resetiran i aplikacije nisu pale

set -e

echo "🔧 Thesara Server Recovery Script"
echo "=================================="

# 1. Provjeri SWAP
echo ""
echo "📊 Checking SWAP..."
if swapon --show | grep -q "/swapfile"; then
    echo "✅ SWAP is active"
else
    echo "⚠️  SWAP not active, activating..."
    sudo swapon /swapfile
    echo "✅ SWAP activated"
fi

# 2. Provjeri PM2 status prvo (PRIJE čišćenja zombija)
echo ""
echo "📦 Checking PM2 processes..."
if pm2 list | grep -q "online"; then
    echo "✅ PM2 processes are running"
    pm2 status
else
    echo "⚠️  PM2 processes not running"
    echo "   Cleaning zombie processes first..."
    sudo fuser -k -9 3000/tcp 2>/dev/null || true
    sudo fuser -k -9 8788/tcp 2>/dev/null || true
    sleep 2
    echo "   Starting PM2..."
    cd /srv/thesara/app
    pm2 start ecosystem.config.cjs
    sleep 5
    pm2 save
    echo "✅ PM2 processes started"
fi

# 3. Provjeri je li web dostupan
echo ""
echo "🌐 Testing web server..."
if netstat -tuln | grep -q ":3000 "; then
    echo "✅ Web server is listening on port 3000"
else
    echo "⚠️  Web server not listening on port 3000"
    echo "   Check PM2 logs with: pm2 logs thesara-web --lines 30"
fi

# 4. Finalni status
echo ""
echo "=================================="
echo "✨ Recovery complete!"
echo ""
pm2 status
echo ""
free -h | grep -E "Mem:|Swap:"
