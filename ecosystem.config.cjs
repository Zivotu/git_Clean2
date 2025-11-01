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
      args: '--openssl-legacy-provider dist/server.cjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8788,
      },
      max_memory_restart: '512M',
      restart_delay: 5000,
    },
    {
      name: 'thesara-web',
      cwd: path.join(rootDir, 'apps/web'),
      script: 'pnpm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3000 },
      max_memory_restart: '512M',
      restart_delay: 5000,
    },
  ],
};
