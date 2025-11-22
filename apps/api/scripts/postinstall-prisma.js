#!/usr/bin/env node
const { execSync } = require('child_process');

function run() {
  try {
    if (process.env.SKIP_PRISMA_GENERATE === '1') {
      console.log('SKIP_PRISMA_GENERATE is set — skipping prisma generate');
      return;
    }

    console.log('Running prisma generate...');
    // Use npx to ensure local prisma binary is used
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('prisma generate completed');
  } catch (err) {
    console.warn('prisma generate failed (non-fatal). To retry later run `pnpm --filter @thesara/api exec -- prisma generate` or set SKIP_PRISMA_GENERATE=1 to skip.');
    console.warn(err && err.message ? err.message : err);
    // Do not throw; we want install to continue even if generate fails on Windows locks
  }
}

run();
