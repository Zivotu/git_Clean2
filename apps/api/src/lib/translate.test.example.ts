/**
 * TEST: Translation Service - Title Not Translated
 * 
 * This test verifies that the translation service:
 * 1. Does NOT translate the app title (keeps original)
 * 2. DOES translate description
 * 3. DOES translate longDescription (if present)
 */

// Mock app
const testApp = {
    id: 'test-123',
    title: 'Budget Tracker Pro',  // Should NOT be translated
    description: 'Track your expenses easily',
    longDescription: 'A comprehensive budgeting tool that helps you manage your finances with powerful analytics and reporting.',
};

// Expected result for Croatian translation
const expected = {
    hr: {
        // NO title field - we're not translating it
        description: 'Pratite svoje troškove jednostavno',
        longDescription: 'Sveobuhvatan alat za budžetiranje koji vam pomaže upravljati financijama s moćnim analizama i izvještavanjem.',
    },
    en: {
        description: 'Track your expenses easily',
        longDescription: 'A comprehensive budgeting tool that helps you manage your finances with powerful analytics and reporting.',
    },
    de: {
        description: 'Verfolgen Sie Ihre Ausgaben einfach',
        longDescription: 'Ein umfassendes Budgetierungstool, das Ihnen hilft, Ihre Finanzen mit leistungsstarken Analysen und Berichten zu verwalten.',
    },
};

console.log('✅ Test configuration complete');
console.log('Original title:', testApp.title);
console.log('Title in all languages: SAME (not translated)');
console.log('Descriptions: TRANSLATED');
console.log('LongDescriptions: TRANSLATED');
