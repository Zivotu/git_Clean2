#!/usr/bin/env bash
set -euo pipefail

# Usage: ./collect_diagnostics.sh <TOKEN> [OUTFILE]
# Example: ./collect_diagnostics.sh eyJ... /tmp/thesara_diag.log
# If run under sudo, preserve TOKEN: sudo -E ./scripts/collect_diagnostics.sh ...

TOKEN="$1"
OUTFILE="${2:-/tmp/thesara_diagnostics_$(date +%Y%m%dT%H%M%S).log}"

echo "Writing diagnostics to: $OUTFILE"
exec > >(tee "$OUTFILE") 2>&1

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

cat <<-EOF
Thesara diagnostics
Generated: $(timestamp)
Host: $(hostname)
User: $(whoami)
CWD: $(pwd)
EOF

echo
echo "--- System info ---"
uname -a
cat /etc/os-release 2>/dev/null || true

echo
echo "--- Paths & tools ---"
which node || true; node -v 2>/dev/null || true
which pnpm || true; pnpm -v 2>/dev/null || true
which pm2 || true; pm2 -v 2>/dev/null || true

echo
echo "--- Git info (if in repo) ---"
if [ -d .git ]; then
  git rev-parse --abbrev-ref HEAD || true
  git rev-parse --short HEAD || true
fi

echo
echo "--- pm2 status ---"
pm2 status || true

echo
echo "--- pm2 show thesara-api ---"
pm2 show thesara-api || true

echo
echo "--- Processes listening on port 8788 ---"
ss -ltnp | grep 8788 || lsof -i :8788 || echo "no listener on 8788"

echo
echo "--- Last 500 lines pm2 logs (thesara-api) ---"
pm2 logs thesara-api --lines 500 || true

echo
echo "--- Last 200 lines nginx error log ---"
sudo tail -n 200 /var/log/nginx/error.log || echo "no nginx error log or insufficient rights"

echo
echo "--- Last 200 lines nginx access log ---"
sudo tail -n 200 /var/log/nginx/access.log || echo "no nginx access log or insufficient rights"

echo
echo "--- Direct backend request (127.0.0.1:8788) ---"
# show request and response headers + body
curl -svS -D - \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Thesara-Scope: shared" \
  "http://127.0.0.1:8788/api/storage?ns=room-test-1" || true

echo
echo "--- Via nginx (Host: apps.thesara.space) over HTTPS to 127.0.0.1 ---"
# use -k to ignore cert name mismatch when using 127.0.0.1
curl -vk -D - \
  -H "Host: apps.thesara.space" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Thesara-Scope: shared" \
  "https://127.0.0.1/api/storage?ns=room-test-1" || true

echo
echo "--- Via localhost:3000 (Next.js / frontend) ---"
curl -vS -D - \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Thesara-Scope: shared" \
  "http://localhost:3000/api/storage?ns=room-test-1" || true

echo
echo "--- Nginx config fragments (sites-available) ---"
sudo sed -n '1,240p' /etc/nginx/sites-available/apps.thesara.space || true
sudo sed -n '1,240p' /etc/nginx/sites-available/thesara || true

echo
echo "--- tail last 100 lines of thesara-api out/error logs files ---"
# explicit files recorded by pm2 show
PM2_ERR="/root/.pm2/logs/thesara-api-error-13.log"
PM2_OUT="/root/.pm2/logs/thesara-api-out-13.log"
[ -f "$PM2_ERR" ] && tail -n 200 "$PM2_ERR" || echo "no $PM2_ERR"
[ -f "$PM2_OUT" ] && tail -n 200 "$PM2_OUT" || echo "no $PM2_OUT"

echo
echo "--- End of diagnostics ---"

echo "Saved diagnostics to: $OUTFILE"

# also print path to stdout for convenience
printf "%s\n" "$OUTFILE"
