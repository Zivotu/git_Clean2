const fs = require('fs');
const path = require('path');

const root = process.cwd();
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist directory not found, run build first.');
  process.exit(2);
}

const files = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
let found = [];
for (const f of files) {
  const p = path.join(distDir, f);
  const content = fs.readFileSync(p, 'utf8');
  if (content.includes('batch.update(') || /\.update\(/.test(content)) {
    found.push(p);
  }
}

if (found.length) {
  console.error('ERROR: Found forbidden update() occurrences in built files:');
  for (const f of found) console.error(' - ' + f);
  console.error('\nThis means the build still contains non-merge Firestore updates; please fix source and rebuild.');
  process.exit(1);
}

console.log('OK: dist verification passed (no update() occurrences)');
process.exit(0);
