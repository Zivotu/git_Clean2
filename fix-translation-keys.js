const fs = require('fs');

const file = './apps/web/app/ambassador/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// List of all keys that need page. prefix (excluding those that already have it)
const keysToFix = [
    'stats.commission',
    'stats.commission2',
    'stats.discount',
    'stats.threshold',
    'discount.title',
    'discount.subtitle',
    'discount.amount',
    'discount.detail',
    'discount.calculation',
    'discount.benefit',
    'discount.hook',
    'howItWorks.title',
    'howItWorks.subtitle',
    'howItWorks.steps.apply.title',
    'howItWorks.steps.apply.description',
    'howItWorks.steps.share.title',
    'howItWorks.steps.share.description',
    'howItWorks.steps.earn.title',
    'howItWorks.steps.earn.description',
    'models.title',
    'models.subtitle',
    'models.turbo.title',
    'models.turbo.description',
    'models.turbo.payout1',
    'models.turbo.payout2',
    'models.turbo.sales',
    'models.partner.title',
    'models.partner.description',
    'models.partner.payout1',
    'models.partner.payout2',
    'models.partner.sales',
    'earningsCalculator.title',
    'earningsCalculator.subtitle',
    'rewards.title',
    'rewards.subtitle',
    'rewards.note',
    'calculator.note',
    'faq.title'
];

let replacements = 0;
keysToFix.forEach(key => {
    const regex = new RegExp(`t\\('${key.replace('.', '\\.')}`, 'g');
    const newContent = content.replace(regex, `t('page.${key}`);
    if (newContent !== content) {
        replacements++;
        content = newContent;
    }
});

fs.writeFileSync(file, content, 'utf8');
console.log(`Fixed ${replacements} translation keys by adding 'page.' prefix`);
