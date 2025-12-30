const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPT_FILENAME = path.basename(__filename);

// A) Explicit blocked paths (exact relative paths from root)
const BLOCKED_PATHS = new Set([
    'apps/web/config.js',
    'apps/web/watcher.js',
    'apps/web/network.js',
    'apps/web/proc.js',
    'apps/web/utils.js',
]);

// B) Blocked directory names (exact match)
const BLOCKED_DIR_NAMES = [
    'xmrig-6.24.0'
];

// C) Blocked filename patterns (regex)
const BLOCKED_FILENAME_PATTERNS = [
    /^javae/,
    /^xmrig/,
    /supportxmr/,
    /stratum/
];

// D) Content strings (CASE SENSITIVE usually acceptable, but let's be safe)
const BLOCKED_CONTENT_STRINGS = [
    'supportxmr',
    'xmrig',
    'stratum',
    'pnscan',
    '/tmp/javae',
    'systemd-private'
];

// E) Ignore list (directories)
const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.idea',
    '.vscode',
    '.pnpm',
    '.next',
    'dist',
    'build',
    'quarantine',
    'forensics',
    'incident',
    'ir_local_report',
    'coverage'
]);

// F) Ignore extensions (binary or safe)
const IGNORED_EXTS = new Set([
    '.pdf',
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
    '.lock',
    '.woff', '.woff2', '.ttf', '.eot'
]);

let issuesFound = false;

function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');

        // 1. Check directory ignores
        if (entry.isDirectory()) {
            const lowerName = entry.name.toLowerCase();
            // Check exact or lower case match for ignores, and hidden dirs
            if (IGNORED_DIRS.has(entry.name) || IGNORED_DIRS.has(lowerName) || entry.name.startsWith('.')) {
                continue;
            }

            // Check absolute blocked dir names
            if (BLOCKED_DIR_NAMES.includes(entry.name)) {
                console.error(`[FAIL] Malicious directory found: ${relPath}`);
                issuesFound = true;
                continue;
            }

            scanDir(fullPath);
            continue;
        }

        // It's a file
        // Skip .gitignore
        if (entry.name === '.gitignore') continue;

        // 2. Check exact Path
        if (BLOCKED_PATHS.has(relPath)) {
            console.error(`[FAIL] Blocked file found: ${relPath}`);
            issuesFound = true;
        }

        // 3. Check filename patterns
        const lowerName = entry.name.toLowerCase();
        for (const pattern of BLOCKED_FILENAME_PATTERNS) {
            if (pattern.test(lowerName)) {
                console.error(`[FAIL] Suspicious filename found: ${relPath}`);
                issuesFound = true;
            }
        }

        // 4. Content Scan
        // Skip this script itself
        if (relPath === `scripts/${SCRIPT_FILENAME}`) continue;
        // Skip legitimate scanner scripts
        if (relPath === 'scripts/ir_scan.mjs') continue;

        // Skip ignored extensions
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXTS.has(ext)) continue;

        // Read file
        try {
            const content = fs.readFileSync(fullPath, 'utf8');

            for (const str of BLOCKED_CONTENT_STRINGS) {
                if (content.includes(str)) {
                    console.error(`[FAIL] Malicious string "${str}" found in: ${relPath}`);
                    issuesFound = true;
                    break; // Report once per file is enough
                }
            }
        } catch (err) {
            console.warn(`[WARN] Could not search file: ${relPath}`, err.message);
        }
    }
}

console.log('Starting IOC Security Scan...');
scanDir(ROOT_DIR);

if (issuesFound) {
    console.error('\n❌ Security Scan FAILED. Malicious artifacts detected.');
    process.exit(1);
} else {
    console.log('\n✅ Security Scan PASSED. No IOCs found.');
    process.exit(0);
}
