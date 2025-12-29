#!/bin/bash
# ⚠️ LEGACY (PM2) DEPLOY SCRIPT — DO NOT USE ON CURRENT PRODUCTION
# Current production uses SYSTEMD services: thesara-api.service + thesara-web.service
# Use: deploy-server-systemd.sh
# This file is kept for historical reference only.
# Deployment script za thesara.space
# Koristi se za deployment nakon git push
# Updated: 2025-12-11 - Added nginx config, cache busting, and proper restart sequence

set -e  # Zaustavi script ako bilo koja komanda faila

echo "ðŸš€ Starting deployment..."

# Navigate to root
cd /srv/thesara/app

# Stash any local changes (npr. next-env.d.ts)
echo "ðŸ“¦ Stashing local changes..."
git stash

# Fetch latest changes
echo "ðŸ”„ Fetching latest changes from origin..."
git fetch origin main

# Checkout main branch
echo "ðŸŒ¿ Checking out main branch..."
git checkout main

# Reset to match remote exactly (najsigurniji naÄin)
echo "â¬‡ï¸  Pulling latest changes..."
git reset --hard origin/main

# Show last 3 commits to confirm
echo "âœ… Latest commits:"
git log -3 --oneline

# VAÅ½NO: Update nginx config ako postoji nova verzija
if [ -f "nginx-thesara.conf" ]; then
    echo "ðŸ”§ Updating nginx configuration..."
    sudo cp nginx-thesara.conf /etc/nginx/sites-available/thesara
    sudo nginx -t && sudo systemctl reload nginx
    echo "âœ… Nginx updated and reloaded"
fi

# Build and restart API
echo "ðŸ”§ Building API..."
cd apps/api
pnpm install --frozen-lockfile
pnpm build

echo "ðŸ”„ Restarting API..."
pm2 restart thesara-api --update-env || pm2 start dist/server.cjs --name thesara-api --update-env

# Build and restart Web
echo "ðŸŒ Building Web..."
cd ../web

# KRITIÄŒNO: Clean old build to prevent chunk conflicts!
echo "ðŸ§¹ Cleaning old Next.js build..."
rm -rf .next

pnpm install --frozen-lockfile

# Build with production settings
echo "ðŸ“¦ Building Next.js application..."
NODE_ENV=production \
NEXT_PUBLIC_API_URL=https://api.thesara.space/api \
NEXT_PUBLIC_APP_URL=https://thesara.space \
pnpm build

echo "ðŸ”„ Restarting Web..."
pm2 restart thesara-web --update-env

# Wait for services to stabilize
echo "â³ Waiting for services to stabilize..."
sleep 5

echo "âœ¨ Deployment complete!"
echo "ðŸ“Š PM2 Status:"
pm2 status

echo ""
echo "ðŸ” Health checks:"
echo "API: http://127.0.0.1:8788/health"
curl -s http://127.0.0.1:8788/health && echo " âœ…" || echo " âŒ"

echo ""
echo "ðŸ’¡ If you're still seeing chunk errors in browser:"
echo "   1. Hard refresh: Ctrl+Shift+R (Chrome) or Ctrl+F5"
echo "   2. Clear browser cache completely"
echo ""
echo "ðŸ“ Recent logs:"
echo "   pm2 logs thesara-web --lines 20"
echo "   pm2 logs thesara-api --lines 20"
