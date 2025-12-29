#!/bin/bash
set -euo pipefail

echo "🚀 Starting SYSTEMD deployment..."
cd /srv/thesara/app

echo "📦 Stashing local changes..."
git stash || true

echo "🔄 Fetching latest changes..."
git fetch origin main

echo "🌿 Checking out main..."
git checkout main

echo "⬇️  Reset to origin/main..."
git reset --hard origin/main

echo "✅ Latest commits:"
git log -3 --oneline

# Update nginx config if present
if [ -f "nginx-thesara.conf" ]; then
  echo "🔧 Updating nginx configuration..."
  sudo cp nginx-thesara.conf /etc/nginx/sites-available/thesara
  sudo nginx -t
  sudo systemctl reload nginx
  echo "✅ Nginx reloaded"
fi

# Build API
echo "🔧 Building API..."
cd apps/api
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack pnpm install --frozen-lockfile
corepack pnpm build

echo "🔄 Restarting API (systemd)..."
sudo systemctl restart thesara-api
sudo systemctl status thesara-api --no-pager | sed -n '1,25p'

# Build Web
echo "🌐 Building Web..."
cd ../web

echo "🧹 Cleaning old Next.js build..."
rm -rf .next

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack pnpm install --frozen-lockfile

echo "📦 Building Next.js..."
NODE_ENV=production \
NEXT_PUBLIC_API_URL="https://thesara.space/api" \
corepack pnpm build

echo "🔄 Restarting Web (systemd)..."
sudo systemctl restart thesara-web
sudo systemctl status thesara-web --no-pager | sed -n '1,25p'

echo "⏳ Waiting a moment..."
sleep 3

echo "🔍 Health checks:"
curl -fsS http://127.0.0.1:8788/health >/dev/null && echo "API ✅" || echo "API ❌"
curl -fsS http://127.0.0.1:3000 >/dev/null && echo "WEB ✅" || echo "WEB ❌"

echo "✨ SYSTEMD deployment script finished."