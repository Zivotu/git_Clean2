import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve repo root robustly on Windows and POSIX
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const webMessagesDir = path.join(repoRoot, 'apps', 'web', 'messages');
const enPath = path.join(webMessagesDir, 'en.json');
const hrPath = path.join(webMessagesDir, 'hr.json');
const backupPath = path.join(webMessagesDir, `hr.json.bak-${Date.now()}`);

function flatten(obj, prefix = '') {
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(res, flatten(v, key));
    } else {
      res[key] = v;
    }
  }
  return res;
}

function unflatten(flat) {
  const res = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.');
    let cur = res;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        cur[p] = v;
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    }
  }
  return res;
}

async function run() {
  try {
    const [enRaw, hrRaw] = await Promise.all([
      fs.readFile(enPath, 'utf8'),
      fs.readFile(hrPath, 'utf8').catch(() => null),
    ]);

    if (!enRaw) {
      console.error('Cannot find en.json at', enPath);
      process.exit(2);
    }

    const en = JSON.parse(enRaw);
    const hr = hrRaw ? JSON.parse(hrRaw) : {};

    const flatEn = flatten(en);
    const flatHr = flatten(hr);

    const missingKeys = [];
    const updatedFlatHr = { ...flatHr };

    for (const [key, value] of Object.entries(flatEn)) {
      if (!(key in flatHr) || flatHr[key] === undefined || flatHr[key] === null) {
        updatedFlatHr[key] = value;
        missingKeys.push(key);
      }
    }

    if (missingKeys.length === 0) {
      console.log('No missing keys found. `hr.json` already contains all `en.json` keys.');
      process.exit(0);
    }

    // Backup hr.json
    if (hrRaw) {
      await fs.writeFile(backupPath, hrRaw, 'utf8');
      console.log(`Backup of original hr.json saved to: ${backupPath}`);
    }

    // Write merged hr.json (pretty)
    const merged = unflatten(updatedFlatHr);
    await fs.writeFile(hrPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

    console.log(`Added ${missingKeys.length} keys to hr.json.`);
    console.log('Sample of added keys (first 30):');
    console.log(missingKeys.slice(0, 30).join('\n'));
    if (missingKeys.length > 30) console.log(`...and ${missingKeys.length - 30} more`);
  } catch (err) {
    console.error('Error during merge:', err);
    process.exit(1);
  }
}

run();
