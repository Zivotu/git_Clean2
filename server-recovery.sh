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

# 2. Ubij sve zombi procese na portovima
echo ""
echo "🧹 Cleaning zombie processes..."
sudo fuser -k 3000/tcp 2>/dev/null || echo "  Port 3000 is clean"
sudo fuser -k 8788/tcp 2>/dev/null || echo "  Port 8788 is clean"

# 3. Provjeri PM2 status
echo ""
echo "📦 Checking PM2 processes..."
if pm2 list | grep -q "online"; then
    echo "✅ PM2 processes are running"
    pm2 status
else
    echo "⚠️  PM2 processes not running, starting..."
    cd /srv/thesara/app
    pm2 start ecosystem.config.cjs
    sleep 5
    pm2 save
    echo "✅ PM2 processes started"
fi

# 4. Provjeri je li web dostupan
echo ""
echo "🌐 Testing web server..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "✅ Web server is responding"
else
    echo "⚠️  Web server not responding"
    echo "   Attempting restart..."
    pm2 restart thesara-web
    sleep 5
fi

# 5. Finalni status
echo ""
echo "=================================="
echo "✨ Recovery complete!"
echo ""
pm2 status
echo ""
free -h | grep -E "Mem:|Swap:"
