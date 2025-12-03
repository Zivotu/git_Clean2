import fs from 'node:fs';
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const cwd = process.cwd();

const envCandidates = [
  path.resolve(repoRoot, '.env'),
  path.resolve(repoRoot, '.env.local'),
  path.resolve(packageRoot, '.env'),
  path.resolve(packageRoot, '.env.local'),
  path.resolve(cwd, '.env'),
  path.resolve(cwd, '.env.local'),
];

const seen = new Set<string>();

for (const candidate of envCandidates) {
  if (seen.has(candidate) || !fs.existsSync(candidate)) {
    continue;
  }
  seen.add(candidate);
  dotenvConfig({ path: candidate, override: false });
}
