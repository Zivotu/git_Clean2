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

// Only flag likely Firestore DocumentReference.update calls on the `apps` collection
// or specific update usages we care about (archivedVersions). The previous
// implementation flagged every `.update(` (including crypto/prisma/stripe) which
// produced false positives in compiled bundles.
const patterns = [
  // db.collection('apps').doc(...).update(...)
  /db\.collection\(\s*['"`]apps['"`]\s*\)\.doc\([^)]*\)\.update\(/,
  // appsCol.doc(...).update(...)
  /appsCol\.doc\([^)]*\)\.update\(/,
  // any .collection('apps').doc(...).update(...)
  /\.collection\(\s*['"`]apps['"`]\s*\)\.doc\([^)]*\)\.update\(/,
  // specific archivedVersions update bodies (defensive catch)
  /\.update\(\s*\{[^}]*archivedVersions[^}]*\}\s*\)/,
];

for (const f of files) {
  const p = path.join(distDir, f);
  const content = fs.readFileSync(p, 'utf8');
  for (const re of patterns) {
    if (re.test(content)) {
      found.push({ file: p, pattern: re.toString() });
      break;
    }
  }
}

if (found.length) {
  console.error('ERROR: Found forbidden Firestore update() occurrences in built files:');
  for (const f of found) console.error(` - ${f.file}    (matched ${f.pattern})`);
  console.error('\nThis means the build still contains non-merge Firestore updates; please fix source and rebuild.');
  process.exit(1);
}

console.log('OK: dist verification passed (no update() occurrences)');
process.exit(0);
