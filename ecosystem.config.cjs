// PM2 ecosystem configuration for Thesara
// Works both locally (Windows) and on Linux server
const path = require('path');
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--env=production');
const rootDir = isProduction ? '/srv/thesara/app' : __dirname;

module.exports = {
  apps: [
    {
      name: 'thesara-api',
      cwd: path.join(rootDir, 'apps/api'),
      script: 'node',
      args: '--openssl-legacy-provider -r dotenv/config dist/server.cjs',
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
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Ensure Next.js rewrites proxy to the local API service on port 8788
        // next.config.mjs expects the base to include the /api prefix
        INTERNAL_API_URL: 'http://127.0.0.1:8788/api',
      },
      max_memory_restart: '512M',
      restart_delay: 5000,
    },
  ],
};
