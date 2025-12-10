// PM2 ecosystem configuration for Thesara
// Works both locally (Windows) and on Linux server
const path = require('path');
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--env=production');
const rootDir = isProduction ? '/srv/thesara/app' : __dirname;

module.exports = {
  apps: [
    {
      name: 'thesara-api',
      // Ensure Node resolves modules like 'dotenv/config' from the API package's node_modules
      cwd: path.join(rootDir, 'apps/api'),
      // Use absolute script path to avoid any CWD/relative path issues
      script: path.join(rootDir, 'apps/api/dist/server.cjs'),
      // Explicitly set the node interpreter and args
      interpreter: 'node',
      interpreter_args: '--openssl-legacy-provider -r dotenv/config',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8788,
        DOTENV_CONFIG_PATH: path.join(rootDir, 'apps/api/.env'),
        CREATEX_WORKER_ENABLED: 'true',
        // Allow static preview of review builds (serve /review/builds/:id/)
        ALLOW_REVIEW_PREVIEW: 'true',
      },
      max_memory_restart: '512M',
      restart_delay: 5000,
    },
    {
      name: 'thesara-web',
      cwd: path.join(rootDir, 'apps/web'),
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Ensure Next.js rewrites proxy to the local API service on port 8788
        // next.config.mjs expects the base to include the /api prefix
        INTERNAL_API_URL: 'http://127.0.0.1:8788/api',
        // Also expose the client-facing URL at build time for Next.js
        NEXT_PUBLIC_INTERNAL_API_URL: 'http://127.0.0.1:8788/api',
      },
      max_memory_restart: '512M',
      restart_delay: 5000,
      kill_timeout: 5000,  // Wait 5s for graceful shutdown before SIGKILL
      listen_timeout: 10000,  // Wait 10s for app to bind to port
      max_restarts: 5,  // Don't restart infinitely if it keeps failing
      min_uptime: 10000,  // Must run 10s to be considered "started"
    },
  ],
};
