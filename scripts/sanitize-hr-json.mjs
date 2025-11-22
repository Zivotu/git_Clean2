import fs from 'fs';
import path from 'path';
const p = path.resolve(process.cwd(), 'apps/web/messages/hr.json');
const bak = p + '.bak';
fs.copyFileSync(p, bak);
const s = fs.readFileSync(p, 'utf8');
let out = '';
let inStr = false;
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (ch === '"') {
    // count preceding backslashes
    let esc = 0;
    let j = i - 1;
    while (j >= 0 && s[j] === '\\') { esc++; j--; }
    if (esc % 2 === 0) inStr = !inStr;
    out += ch;
    continue;
  }
  if (inStr && (ch === '\r' || ch === '\n')) {
    out += '\\n';
    continue;
  }
  out += ch;
}
fs.writeFileSync(p, out, 'utf8');
console.log('Sanitized', p);
console.log('Backup created at', bak);
