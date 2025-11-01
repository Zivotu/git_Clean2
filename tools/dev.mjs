#!/usr/bin/env node
// Simple cross-platform dev runner: starts API server, local-dev worker and web (Next.js) in parallel
// Also ensures Redis is up via separate script `pnpm run dev:redis` before running this.

import path from 'node:path';
import { spawn } from 'node:child_process';

const DATABASE_URL = `file:${path.resolve(process.cwd(), '.devdata/sqlite.db')}`;
const GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'keys/createx-e0ccc-3510ddb20df0.json');

function run(cmd, args, opts = {}) {
  opts.env = {
    ...process.env,
    DATABASE_URL,
    GOOGLE_APPLICATION_CREDENTIALS,
  };
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  p.on('exit', (code) => {
    // Only fail the orchestrator if a process exits with a non-zero numeric code.
    if (typeof code === 'number' && code !== 0) {
      console.error(`[dev] ${cmd} exited with ${code}`);
      process.exit(code || 1);
    }
  });
  return p;
}

const procs = [];

// API server
procs.push(run('pnpm', ['-C', 'apps/api', 'dev']));

// Local-dev worker
procs.push(run('pnpm', ['-C', 'apps/api', 'dev:worker']));

// Web (Next.js) dev server - ensure local API env (8789)
procs.push(run('pnpm', ['-C', 'apps/web', 'run', 'dev:local']));

function shutdown() {
  for (const p of procs) {
    try { p.kill('SIGINT'); } catch {}
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
