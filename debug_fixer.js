
const fs = require('fs');
const path = require('path');

const adjacentJsxRegex =
    /((?:['"][^'"]+['"]|[\w$]+)\s*:\s*)(\(?\s*)((?:<[a-zA-Z0-9]+[^>]*\/>\s*){2,})(\s*\)?)(,|})/g;

const imgSrcRegex = /(img\.src\s*=\s*[`"'])(\/)([^`"'])/g;

async function run() {
    const abs = 'c:\\thesara_RollBack\\sky-sentinel(3)\\game\\engine.ts';
    let content = fs.readFileSync(abs, 'utf8');
    console.log('Original length:', content.length);

    let next = content.replace(
        adjacentJsxRegex,
        (match, key, before, nodes, after, suffix) => {
            console.log('Matched adjacentJsxRegex!');
            const trimmedNodes = nodes.trimStart();
            if (trimmedNodes.startsWith('<>') || trimmedNodes.startsWith('<React.Fragment')) {
                return match;
            }
            return `${key}${before}<>${nodes}</>${after}${suffix}`;
        },
    );

    next = next.replace(imgSrcRegex, (match, p1, p2, p3) => {
        console.log('Matched imgSrcRegex!');
        return p1 + p3;
    });

    if (next !== content) {
        console.log('Content changed!');
        console.log('New length:', next.length);
        fs.writeFileSync('c:\\thesara_RollBack\\sky-sentinel(3)\\game\\engine_fixed.ts', next, 'utf8');
    } else {
        console.log('No changes.');
    }
}

run();
