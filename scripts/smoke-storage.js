#!/usr/bin/env node
const API_BASE = process.env.API_BASE || process.env.INTERNAL_API_URL || 'http://127.0.0.1:8788/api';
const namespace = process.env.THESARA_NS || 'app:smoke-storage';
(async () => {
  const scopeHeader = { 'X-Thesara-Scope': 'shared' };
  const getUrl = `${API_BASE.replace(/\/$/, '')}/storage?ns=${encodeURIComponent(namespace)}`;
  console.log('GET', getUrl);
  const getRes = await fetch(getUrl, {
    headers: scopeHeader,
  });
  if (getRes.status === 404) {
    console.log('Namespace missing, treating as empty snapshot.');
  } else if (!getRes.ok) {
    throw new Error(`GET failed ${getRes.status} - ${await getRes.text()}`);
  }
  const etag = (getRes.headers.get('ETag') || '0').replace(/"/g, '') || '0';
  const snapshot = await getRes.json().catch(() => ({}));
  console.log('Snapshot version', etag, 'payload', snapshot);

  const appId = namespace.startsWith('app:') ? namespace.slice('app:'.length) : namespace;
  const patchPayload = [
    { op: 'set', key: 'lastSmokeRun', value: new Date().toISOString() },
    { op: 'set', key: 'owner', value: 'smoke-test' },
  ];
  const patchHeaders = {
    'Content-Type': 'application/json',
    'If-Match': `"${etag}"`,
    'X-Thesara-App-Id': appId || 'smoke-test',
    ...scopeHeader,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`PATCH attempt ${attempt} (If-Match "${etag}")`);
    const patchRes = await fetch(getUrl, {
      method: 'PATCH',
      headers: patchHeaders,
      body: JSON.stringify(patchPayload),
    });
    if (patchRes.ok) {
      const body = await patchRes.json().catch(() => ({}));
      console.log('PATCH success', patchRes.status, body);
      console.log('new ETag', patchRes.headers.get('ETag'));
      return;
    }

    const text = await patchRes.text().catch(() => '');
    console.warn('PATCH failed', patchRes.status, text);
    if (patchRes.status === 412) {
      console.log('Conflict detected, refreshing snapshot...');
      const refreshed = await fetch(getUrl, { headers: scopeHeader });
      const newEtag = (refreshed.headers.get('ETag') || '0').replace(/"/g, '') || '0';
      patchHeaders['If-Match'] = `"${newEtag}"`;
      continue;
    }
    throw new Error(`PATCH failed after ${attempt} attempts: ${patchRes.status}`);
  }
  console.warn('PATCH attempts exhausted');
})();
