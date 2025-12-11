const https = require('https');

const newImageUrl = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=60';

console.log('🔍 Proveravam novu Unsplash sliku...\n');

const req = https.request(newImageUrl, { method: 'HEAD' }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
        console.log(`✅ Status: ${res.statusCode}`);
        console.log(`✅ Nova slika radi ispravno!`);
        console.log(`📸 URL: ${newImageUrl}`);
    } else {
        console.log(`❌ Status: ${res.statusCode}`);
        console.log(`❌ Problem sa novom slikom!`);
    }
});

req.on('error', (err) => {
    console.log(`❌ Error: ${err.message}`);
});

req.end();
