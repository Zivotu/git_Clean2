const https = require('https');
const http = require('http');
const fs = require('fs');

// Lista linkova pronađenih u kodu
const links = [
    // Footer social links
    'https://www.tiktok.com/@thesara_repository?is_from_webapp=1&sender_device=pc',
    'https://x.com/THESARA_SPACE',
    'https://www.linkedin.com/company/thesara-repository/',
    'https://www.instagram.com/thesara.space/',

    // Tutorial links
    'https://aistudio.google.com/',

    // Layout video
    'https://youtube.com/shorts/esSpiQr63WE?feature=share',

    // Google Analytics & Clarity
    'https://www.googletagmanager.com/gtag/js?id=G-Q5LEE6M2QB',
    'https://www.clarity.ms/tag/',

    // Stripe
    'https://js.stripe.com/v3',

    // API & Apps
    'https://api.thesara.space',
    'https://apps.thesara.space',

    // External images (oglasi)
    'https://images.unsplash.com/photo-1522199794611-8e3563d8a6c4?auto=format&fit=crop&w=900&q=60',
    'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=60',

    // Test URLs  
    'https://www.infozagreb.hr',
    'https://www.google.com',

    // Side panel
    'https://aistudio.google.com/apps',

    // Schema.org
    'https://schema.org',
];

async function checkLink(url, index) {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const options = {
                method: 'HEAD',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            };

            const req = protocol.request(url, options, (res) => {
                // Redirects (3xx) and Success (2xx) are OK
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve({ url, status: res.statusCode, ok: true, index });
                } else {
                    resolve({ url, status: res.statusCode, ok: false, index });
                }
            });

            req.on('error', (err) => {
                resolve({ url, status: 'ERROR', ok: false, error: err.message, index });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ url, status: 'TIMEOUT', ok: false, error: 'Request timeout', index });
            });

            req.end();
        } catch (err) {
            resolve({ url, status: 'INVALID', ok: false, error: err.message, index });
        }
    });
}

async function checkAllLinks() {
    const output = [];

    output.push(`\n${'='.repeat(80)}`);
    output.push(`🔍 PROVERA LINKOVA NA THESARA STRANICI`);
    output.push(`${'='.repeat(80)}\n`);
    output.push(`Ukupno linkova za proveru: ${links.length}\n`);

    const results = [];

    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        process.stdout.write(`Proveravam ${i + 1}/${links.length}...\r`);
        const result = await checkLink(link, i + 1);
        results.push(result);

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n');

    // Sort by status
    const goodLinks = results.filter(r => r.ok);
    const badLinks = results.filter(r => !r.ok);

    output.push(`\n✅ ISPRAVNI LINKOVI (${goodLinks.length}):`);
    output.push(`${'─'.repeat(80)}`);
    goodLinks.forEach(link => {
        output.push(`  [${link.index}] ${link.status} - ${link.url}`);
    });

    if (badLinks.length > 0) {
        output.push(`\n\n❌ NEISPRAVNI LINKOVI (${badLinks.length}):`);
        output.push(`${'─'.repeat(80)}`);
        badLinks.forEach(link => {
            output.push(`  [${link.index}] ${link.status} - ${link.url}`);
            if (link.error) {
                output.push(`      Error: ${link.error}`);
            }
        });
    }

    output.push(`\n\n${'='.repeat(80)}`);
    output.push(`📊 REZIME:`);
    output.push(`${'='.repeat(80)}`);
    output.push(`Ukupno linkova:    ${links.length}`);
    output.push(`✅ Ispravni:       ${goodLinks.length} (${Math.round(goodLinks.length / links.length * 100)}%)`);
    output.push(`❌ Neispravni:     ${badLinks.length} (${Math.round(badLinks.length / links.length * 100)}%)`);
    output.push(`${'='.repeat(80)}\n`);

    const fullOutput = output.join('\n');
    console.log(fullOutput);

    // Save to file
    fs.writeFileSync('link_check_results.txt', fullOutput, 'utf-8');
    console.log('📝 Rezultati sačuvani u: link_check_results.txt\n');
}

checkAllLinks().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
