#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const gitDir = path.join(ROOT, '.git');
const configPath = path.join(gitDir, 'config');
const hooksDir = path.join(gitDir, 'hooks');

const args = process.argv.slice(2);
let reportPath = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--report' && args[i + 1]) {
    reportPath = path.resolve(args[i + 1]);
    i += 1;
  }
}

async function loadText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function listHooks() {
  try {
    const entries = await fs.readdir(hooksDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function detectHooksPath(configText) {
  if (!configText) return 'N/A (konfiguracija nije dostupna)';
  const match = configText.match(/core\.hookspath\s*=\s*(.+)/i);
  return match ? match[1].trim() : 'core.hooksPath nije definiran';
}

async function summarizeHook(fileName) {
  const filePath = path.join(hooksDir, fileName);
  const text = await loadText(filePath);
  if (!text) return { file: fileName, summary: 'Nije moguće čitati' };

  const lines = text.split(/\r?\n/).slice(0, 30);
  const suspicious = lines.filter((line) =>
    /(curl|wget|nc |socat|scp|ssh|base64|openssl|python -c|node -e)/i.test(line)
  );
  let summary = 'Bez očitih riskantnih naredbi';
  if (suspicious.length > 0) {
    summary = `Sumnjive linije: ${suspicious.join(' || ')}`;
  }
  return { file: fileName, summary };
}

async function main() {
  const configText = await loadText(configPath);
  const hooksPathStatus = detectHooksPath(configText);
  const hooks = await listHooks();
  const hookSummaries = [];
  for (const hook of hooks) {
    hookSummaries.push(await summarizeHook(hook));
  }

  let output = '# Hooks audit\n';
  output += `- core.hooksPath: ${hooksPathStatus}\n`;
  if (hooks.length === 0) {
    output += '\nNema hook datoteka.\n';
  } else {
    output += '\n## Hook datoteke\n';
    hookSummaries.forEach((hook) => {
      output += `- ${hook.file}: ${hook.summary}\n`;
    });
  }

  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, output, 'utf8');
  } else {
    console.log(output);
  }
}

main().catch((err) => {
  console.error('IR hooks audit error:', err);
  process.exitCode = 2;
});
