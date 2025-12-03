#!/usr/bin/env node
/*
 Publishes a tiny test mini-app to the local API and verifies that the generated
 player HTML (index.html) contains the sandbox form-submit prevention script.
*/

import fs from 'node:fs/promises';
import path from 'node:path';

const diagPortFile = path.join(process.cwd(), '.diag', 'api-port.txt');

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getApiPort(defaultPort = 8788, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const txt = await fs.readFile(diagPortFile, 'utf8');
      const p = parseInt(String(txt).trim(), 10);
      if (!isNaN(p) && p > 0) return p;
    } catch {}
    await wait(500);
  }
  return defaultPort;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const port = await getApiPort();
  const base = `http://127.0.0.1:${port}`;
  console.log(`[dev-publish] Using API base: ${base}`);

  const inlineCode = `
import React, { useState } from 'react';

export default function App(){
  const [items, setItems] = useState([]);
  function onSubmit(e){ e.preventDefault(); setItems(prev => [...prev, 'stavka '+(prev.length+1)]); }
  return (
    <div style={{padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto'}}>
      <h3>Sandbox submit test</h3>
      <form onSubmit={onSubmit}>
        <input placeholder="Naziv" />
        <button type="submit">Dodaj</button>
      </form>
      <ul>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}
`;

  console.log('[dev-publish] Publishing test app...');
  const pub = await postJson(`${base}/api/publish`, {
    id: 'sandbox-submit-test',
    title: 'Sandbox submit test',
    description: 'Auto-published test to verify sandbox protections',
    inlineCode,
    visibility: 'unlisted'
  });
  if (!pub.ok) {
    console.error('[dev-publish] Publish failed:', pub.status, pub.data);
    process.exit(1);
  }
  const { buildId, listingId } = pub.data || {};
  console.log(`[dev-publish] Published. buildId=${buildId}, listingId=${listingId}`);

  // Wait for builder to complete and write final index.html
  const statusUrl = `${base}/build/${buildId}/status`;
  console.log('[dev-publish] Waiting for build to complete...');
  let state = 'queued';
  let tries = 0;
  while (tries++ < 120) { // up to ~60s
    const st = await getJson(statusUrl).catch(() => ({ ok: false }));
    if (st.ok) {
      state = st.data?.state || state;
      const pubUrl = st.data?.public;
      const artifacts = Array.isArray(st.data?.artifacts) ? st.data.artifacts : [];
      const hasIndex = artifacts.some(a => String(a?.path || '').endsWith('/index.html'));
      console.log(`  - state=${state}${pubUrl ? ' public='+pubUrl : ''}${hasIndex ? ' (index ready)' : ''}`);
      if (state === 'completed' && hasIndex) break;
    }
    await wait(500);
  }

  // Fetch local index.html from explicit /builds route
  const idxUrl = `${base}/builds/${buildId}/build/index.html`;
  const idx = await getText(idxUrl);
  if (!idx.ok) {
    console.error('[dev-publish] Failed to fetch index.html:', idx.status);
    process.exit(2);
  }

  const marker = 'Global sandbox form-submit prevention';
  const hasMarker = idx.text.includes(marker);
  console.log(`[dev-publish] Template marker present: ${hasMarker}`);
  if (!hasMarker) {
    console.error('[dev-publish] ERROR: Sandbox submit-prevention snippet not found in index.html');
    process.exit(3);
  }

  console.log('\nSUCCESS: Sandbox protections are present in the built HTML.');
  console.log('Try it:');
  console.log(`  ${base}/builds/${buildId}/build/`);
}

main().catch(err => { console.error(err); process.exit(1); });
