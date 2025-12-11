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

const de = require('./messages/de.json');
const flat = flatten(de);

console.log('Has discount.title:', !!flat['Ambassador.page.discount.title']);
console.log('discount.title value:', flat['Ambassador.page.discount.title']);
console.log('Has calculator.title:', !!flat['Ambassador.page.calculator.title']);
console.log('calculator.title value:', flat['Ambassador.page.calculator.title']);
console.log('\nAll Ambassador keys:');
Object.keys(flat).filter(k => k.startsWith('Ambassador.page.')).slice(0, 10).forEach(k => {
    console.log(`  ${k}: ${flat[k].substring(0, 50)}`);
});
