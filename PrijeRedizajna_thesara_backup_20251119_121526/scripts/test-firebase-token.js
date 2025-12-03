const fs = require('fs');
const https = require('https');
const querystring = require('querystring');
const path = require('path');
const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function encode(obj) {
  return base64url(JSON.stringify(obj));
}

function sign(payload, privateKey) {
  // Use crypto.sign for consistent signature behavior
  const sig = crypto.sign('RSA-SHA256', Buffer.from(payload), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  return base64url(sig);
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = typeof data === 'string' ? data : querystring.stringify(data);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const defaultPath = path.join(__dirname, '..', 'apps', 'api', 'keys', 'createx-e0ccc-firebase-adminsdk-fbsvc-9279f55b6b.json');
    const keyPath = envPath && fs.existsSync(envPath) ? envPath : fs.existsSync(defaultPath) ? defaultPath : null;
    if (!keyPath) {
      console.error('No service account JSON found. Set GOOGLE_APPLICATION_CREDENTIALS or place the JSON at', defaultPath);
      process.exitCode = 2;
      return;
    }
    console.log('Using service account file:', keyPath);
    const raw = fs.readFileSync(keyPath, 'utf8');
    const cred = JSON.parse(raw);
    if (!cred.client_email || !cred.private_key || !cred.project_id) {
      console.error('Service account JSON missing required fields (client_email/private_key/project_id)');
      process.exitCode = 3;
      return;
    }

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const scope = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform';
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: cred.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat,
    };
  const normalizedPrivateKey = (cred.private_key || '').replace(/\\n/g, '\n');
  console.log('private_key startsWith -----BEGIN:', normalizedPrivateKey.trim().startsWith('-----BEGIN'));
  console.log('private_key length:', normalizedPrivateKey.length);
  // show a short prefix/suffix for debugging
  console.log('private_key prefix:', normalizedPrivateKey.slice(0, 40).replace(/\n/g, '\\n'));
  console.log('private_key suffix:', normalizedPrivateKey.slice(-40).replace(/\n/g, '\\n'));
  const unsigned = `${encode(header)}.${encode(claim)}`;
  const signature = sign(unsigned, normalizedPrivateKey);
    const jwt = `${unsigned}.${signature}`;
    // Verify signature locally using the public key derived from the private key
    try {
      const publicKey = crypto.createPublicKey(normalizedPrivateKey).export({ type: 'spki', format: 'pem' });
      const b64 = signature.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const sigBuf = Buffer.from(padded, 'base64');
      const verified = crypto.verify('RSA-SHA256', Buffer.from(unsigned), { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, sigBuf);
      console.log('Local signature verification result:', verified);
    } catch (e) {
      console.log('Local signature verification failed (error):', e && e.message ? e.message : e);
    }

    // If firebase-admin is installed in the project, try initializeApp to see what happens
    try {
      const admin = require('firebase-admin');
      console.log('firebase-admin version:', require('firebase-admin/package.json').version);
      try {
        const normalizedKey = Object.assign({}, cred);
        normalizedKey.private_key = normalizedPrivateKey;
        admin.initializeApp({ credential: admin.credential.cert(normalizedKey) });
        const dbInfo = admin.firestore && admin.firestore()._settings ? 'firestore available' : 'firestore loaded';
        console.log('firebase-admin initialized:', dbInfo);
        // Try listing collections (may require network)
        const colls = await admin.firestore().listCollections();
        console.log('listCollections length:', (colls && colls.length) || 0);
      } catch (e) {
        console.error('firebase-admin initialize/listCollections failed:', e && e.message ? e.message : e);
      }
    } catch (e) {
      console.log('firebase-admin not installed in this environment (skipping)');
    }

    console.log('Requesting OAuth2 token...');
    const tokenResp = await post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });
    console.log('Token response status:', tokenResp.statusCode);
    console.log('Token response body:', tokenResp.body);
    if (!tokenResp.body || !tokenResp.body.access_token) {
      console.error('Failed to obtain access token');
      process.exitCode = 4;
      return;
    }
    const token = tokenResp.body.access_token;
    console.log('Got access token (length):', token.length);

    // Try a simple Firestore REST API call: list documents (requires correct project)
    const proj = cred.project_id;
    const url = `https://firestore.googleapis.com/v1/projects/${proj}/databases/(default)/documents?pageSize=1`;
    console.log('Calling Firestore REST API:', url);
    const apiResp = await get(url, token);
    console.log('Firestore response status:', apiResp.statusCode);
    console.log('Firestore response body:', apiResp.body);
  } catch (err) {
    console.error('Error during test:', err && err.message ? err.message : err);
    process.exitCode = 1;
  }
})();
