#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.devdata',
  '.cache',
  'ir_local_report'
]);

const IOC_PATTERNS = [
  { id: 'xmrig', regex: /xmrig/i, note: 'Crypto miner indicator', critical: true },
  { id: 'c3pool', regex: /c3pool/i, note: 'Known mining pool', critical: true },
  { id: 'hashvault', regex: /hashvault/i, note: 'Known mining pool', critical: true },
  { id: 'auto.c3pool.org', regex: /auto\.c3pool\.org/i, note: 'Known mining endpoint', critical: true },
  { id: 'pool.hashvault.pro', regex: /pool\.hashvault\.pro/i, note: 'Known mining endpoint', critical: true },
  { id: 'watcher.js reference', regex: /watcher\.js/i, note: 'Dropper/persistence reference', critical: true },
  { id: 'test -f .env', regex: /test\s+-f\s+\.env/i, note: 'Possible env probing', critical: true },
  { id: 'base64 -w 0', regex: /base64\s+-w\s+0/i, note: 'Potential exfil command', critical: true },
  { id: 'child_process.exec', regex: /child_process\.exec/i, note: 'Dynamic command execution', critical: false },
  { id: 'spawn', regex: /\bspawn\b/i, note: 'Dynamic command execution', critical: false },
  { id: 'curl', regex: /\bcurl\b/i, note: 'Remote download', critical: false },
  { id: 'wget', regex: /\bwget\b/i, note: 'Remote download', critical: false }
];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const args = process.argv.slice(2);
let reportPath = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--report' && args[i + 1]) {
    reportPath = path.resolve(args[i + 1]);
    i += 1;
  }
}

const SAFE_CODE_PATHS = [
  /^scripts[\\/](ir_scan|ir_hooks_audit)\.mjs$/i,
  /^security-check\.sh$/i,
  /^scripts[\\/]collect_diagnostics\.sh$/i,
  /^scripts[\\/]storage-smoke\.ps1$/i,
  /^scripts[\\/]verify-bundle\.sh$/i,
  /^deploy.*\.sh$/i
];

const findings = [];

function classifyFile(filePath) {
  const lower = filePath.toLowerCase();
  if (
    lower.endsWith('.md') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.txt') ||
    lower.includes(path.join('ir_local_report').toLowerCase())
  ) {
    return 'documentation';
  }
  return 'code';
}

function isSafeCodePath(filePath) {
  return SAFE_CODE_PATHS.some((regex) => regex.test(filePath));
}

async function walk(dir) {
  let dirEntries;
  try {
    dirEntries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of dirEntries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walk(entryPath);
    } else if (entry.isFile()) {
      await scanFile(entryPath);
    }
  }
}

async function scanFile(filePath) {
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    return;
  }
  if (stats.size === 0 || stats.size > MAX_FILE_SIZE) return;

  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return;
  }
  if (buffer.includes(0)) return;
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);

  const relPath = path.relative(ROOT, filePath);
  const fileType = classifyFile(relPath);
  const safeCode = isSafeCodePath(relPath);
  IOC_PATTERNS.forEach((pattern) => {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (pattern.regex.test(line)) {
        const contextStart = Math.max(0, lineIndex - 1);
        const contextEnd = Math.min(lines.length, lineIndex + 2);
        const snippet = lines.slice(contextStart, contextEnd).join('\n');
        findings.push({
          pattern: pattern.id,
          note: pattern.note,
          file: relPath,
          line: lineIndex + 1,
          snippet,
          fileType,
          safeCode,
          critical: pattern.critical
        });
        break;
      }
    }
  });
}

async function main() {
  await walk(ROOT);
  let output = '# IOC Scan Results\n';
  const severeFindings = findings.filter(
    (f) => f.fileType !== 'documentation' && !f.safeCode && f.critical
  );
  if (findings.length === 0) {
    output += '\nNije pronađen nijedan pogodak za definirane IOC stringove.\n';
  } else {
    findings.sort((a, b) => a.file.localeCompare(b.file));
    findings.forEach((result) => {
      output += `\n## ${result.pattern}\n- Datoteka: ${result.file}:${result.line}\n- Vrsta: ${result.fileType}\n- Rizik: ${result.note}\n\n\`\`\`\n${result.snippet}\n\`\`\`\n`;
    });
  }

  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, output, 'utf8');
  } else {
    process.stdout.write(output);
  }

  if (severeFindings.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('IR scan error:', err);
  process.exitCode = 2;
});
