#!/bin/bash
# Deployment script za thesara.space
# Koristi se za deployment nakon git push
# Updated: 2025-12-11 - Added cache busting and proper restart sequence

set -e  # Zaustavi script ako bilo koja komanda faila

echo "🚀 Starting deployment..."

# Navigate to root
cd /srv/thesara/app

# Stash any local changes (npr. next-env.d.ts)
echo "📦 Stashing local changes..."
git stash

# Fetch latest changes
echo "🔄 Fetching latest changes from origin..."
git fetch origin main

# Checkout main branch
echo "🌿 Checking out main branch..."
git checkout main

# Reset to match remote exactly (najsigurniji način)
echo "⬇️  Pulling latest changes..."
git reset --hard origin/main

# Show last 3 commits to confirm
echo "✅ Latest commits:"
git log -3 --oneline

# Build and restart API
echo "🔧 Building API..."
cd apps/api
pnpm install --frozen-lockfile
pnpm build

echo "🔄 Restarting API..."
pm2 stop thesara-api || true  # Don't fail if not running
pm2 start dist/server.cjs --name thesara-api --update-env || pm2 restart thesara-api --update-env

# Build and restart Web
echo "🌐 Building Web..."
cd ../web

# Clean old build to prevent chunk conflicts
echo "🧹 Cleaning old Next.js build..."
rm -rf .next

pnpm install --frozen-lockfile

# Build with production settings
echo "📦 Building Next.js application..."
NODE_ENV=production \
NEXT_PUBLIC_API_URL=https://api.thesara.space/api \
NEXT_PUBLIC_APP_URL=https://thesara.space \
pnpm build

echo "🔄 Restarting Web..."
pm2 restart thesara-web --update-env

# Wait for services to stabilize
echo "⏳ Waiting for services to stabilize..."
sleep 5

echo "✨ Deployment complete!"
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "🔍 Health checks:"
echo "API: http://127.0.0.1:8788/health"
curl -s http://127.0.0.1:8788/health && echo " ✅" || echo " ❌"

echo ""
echo "💡 If you're still seeing chunk errors in browser:"
echo "   1. Hard refresh: Ctrl+Shift+R (Chrome) or Ctrl+F5"
echo "   2. Clear browser cache completely"
echo "   3. Check nginx config: sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "📝 Recent logs:"
echo "   pm2 logs thesara-web --lines 20"
echo "   pm2 logs thesara-api --lines 20"
