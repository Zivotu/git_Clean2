const fs = require('fs');

console.log('='.repeat(80));
console.log('AMBASSADOR TRANSLATION DEEP ANALYSIS');
console.log('='.repeat(80));

// Load all JSON files
const deMain = require('./apps/web/messages/de.json');
const enMain = require('./apps/web/messages/en.json');
const hrMain = require('./apps/web/messages/hr.json');

const deAmb = require('./apps/web/messages/ambassador.de.json');
const enAmb = require('./apps/web/messages/ambassador.en.json');
const hrAmb = require('./apps/web/messages/ambassador.hr.json');

// Flatten function
function flatten(obj, prefix = '') {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(out, flatten(v, key));
        } else {
            out[key] = String(v);
        }
    }
    return out;
}

// Flatten all
const deFlat = flatten(deMain);
const enFlat = flatten(enMain);
const hrFlat = flatten(hrMain);

console.log('\n1. CHECKING AMBASSADOR OBJECT IN MAIN FILES');
console.log('-'.repeat(80));
console.log('DE has Ambassador:', !!deMain.Ambassador);
console.log('EN has Ambassador:', !!enMain.Ambassador);
console.log('HR has Ambassador:', !!hrMain.Ambassador);

if (deMain.Ambassador) {
    console.log('\nDE Ambassador keys:', Object.keys(deMain.Ambassador));
    if (deMain.Ambassador.page) {
        console.log('DE Ambassador.page keys:', Object.keys(deMain.Ambassador.page).slice(0, 10));
    }
}

console.log('\n2. COUNTING FLATTENED KEYS');
console.log('-'.repeat(80));
const deAmbKeys = Object.keys(deFlat).filter(k => k.startsWith('Ambassador.'));
const enAmbKeys = Object.keys(enFlat).filter(k => k.startsWith('Ambassador.'));
const hrAmbKeys = Object.keys(hrFlat).filter(k => k.startsWith('Ambassador.'));

console.log(`DE Ambassador keys: ${deAmbKeys.length}`);
console.log(`EN Ambassador keys: ${enAmbKeys.length}`);
console.log(`HR Ambassador keys: ${hrAmbKeys.length}`);

console.log('\n3. SAMPLE KEYS FROM EACH LANGUAGE');
console.log('-'.repeat(80));
console.log('\nDE keys (first 15):');
deAmbKeys.slice(0, 15).forEach(k => console.log(`  ${k}`));

console.log('\nEN keys (first 15):');
enAmbKeys.slice(0, 15).forEach(k => console.log(`  ${k}`));

console.log('\nHR keys (first 15):');
hrAmbKeys.slice(0, 15).forEach(k => console.log(`  ${k}`));

console.log('\n4. SPECIFIC KEY CHECKS');
console.log('-'.repeat(80));
const testKeys = [
    'Ambassador.page.discount.title',
    'Ambassador.page.calculator.title',
    'Ambassador.page.howItWorks.title',
    'Ambassador.page.models.title',
    'Ambassador.page.stats.commission'
];

testKeys.forEach(key => {
    console.log(`\n${key}:`);
    console.log(`  DE: ${deFlat[key] ? '✓ ' + deFlat[key].substring(0, 50) : '✗ MISSING'}`);
    console.log(`  EN: ${enFlat[key] ? '✓ ' + enFlat[key].substring(0, 50) : '✗ MISSING'}`);
    console.log(`  HR: ${hrFlat[key] ? '✓ ' + hrFlat[key].substring(0, 50) : '✗ MISSING'}`);
});

console.log('\n5. COMPARING MAIN vs AMBASSADOR FILES');
console.log('-'.repeat(80));
const deAmbFlat = flatten(deAmb);
const deAmbOnlyKeys = Object.keys(deAmbFlat);
console.log(`Ambassador.de.json has ${deAmbOnlyKeys.length} keys`);
console.log(`de.json has ${deAmbKeys.length} Ambassador keys`);

if (deAmbKeys.length !== deAmbOnlyKeys.length) {
    console.log('⚠️  KEY COUNT MISMATCH!');
    console.log('Keys in ambassador.de.json but NOT in de.json:');
    deAmbOnlyKeys.slice(0, 10).forEach(k => {
        if (!deFlat[k]) {
            console.log(`  ✗ ${k}`);
        }
    });
}

console.log('\n6. ANALYZING page.tsx T() CALLS');
console.log('-'.repeat(80));
const pageTsx = fs.readFileSync('./apps/web/app/ambassador/page.tsx', 'utf8');
const tCalls = pageTsx.match(/t\(['"]([^'"]+)['"]/g) || [];
console.log(`Found ${tCalls.length} t() calls in page.tsx`);

const uniqueKeys = [...new Set(tCalls.map(c => c.match(/t\(['"]([^'"]+)['"]/)[1]))];
console.log(`Unique keys: ${uniqueKeys.length}`);

console.log('\nKeys WITHOUT "page." prefix:');
const withoutPage = uniqueKeys.filter(k => !k.startsWith('page.'));
withoutPage.forEach(k => console.log(`  ✗ ${k}`));

console.log('\n7. MISSING TRANSLATIONS');
console.log('-'.repeat(80));
const allNeededKeys = uniqueKeys.map(k => {
    if (k.startsWith('page.')) return `Ambassador.${k}`;
    return `Ambassador.page.${k}`;
});

console.log('\nMissing in DE:');
allNeededKeys.slice(0, 20).forEach(k => {
    if (!deFlat[k]) console.log(`  ✗ ${k}`);
});

console.log('\n' + '='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
