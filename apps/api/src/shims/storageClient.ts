export const STORAGE_CLIENT_SHIM = `// Thesara Storage Bridge (ESM)
// Intercepts postMessage calls and proxies to platform /api/storage

const base = (() => {
  try {
    return new URL(window.location.origin).origin;
  } catch {
    return '';
  }
})();

// Listen for postMessage storage requests from app
window.addEventListener('message', async (event) => {
  const { type, key, value, id } = event.data || {};
  
  // Only handle thesara:storage:* messages (but NOT responses)
  if (!type || !type.startsWith('thesara:storage:')) return;
  if (type === 'thesara:storage:response') return; // Ignore own responses

  const operation = type.replace('thesara:storage:', '');
  
  try {
    let result;
    
    switch (operation) {
      case 'get':
        if (!key) throw new Error('key required for storage:get');
        const getRes = await fetch(base + '/api/storage?ns=' + encodeURIComponent(key), {
          credentials: 'include',
        });
        if (getRes.ok) {
          const data = await getRes.json();
          result = { success: true, value: data };
        } else if (getRes.status === 404) {
          result = { success: true, value: null };
        } else {
          throw new Error('Storage GET failed: ' + getRes.statusText);
        }
        break;
        
      case 'set':
        if (!key) throw new Error('key required for storage:set');
        // Get current etag first
        const etagRes = await fetch(base + '/api/storage?ns=' + encodeURIComponent(key), {
          credentials: 'include',
        });
        let etag = '*';
        if (etagRes.ok) {
          etag = etagRes.headers.get('ETag') || '*';
        }
        
        const setRes = await fetch(base + '/api/storage?ns=' + encodeURIComponent(key), {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'If-Match': etag,
            'X-Thesara-App-Id': 'postmessage-bridge'
          },
          credentials: 'include',
          body: JSON.stringify([{ op: 'set', key: 'value', value: value }]),
        });
        if (!setRes.ok) {
          throw new Error('Storage SET failed: ' + setRes.statusText);
        }
        result = { success: true };
        break;
        
      case 'delete':
        if (!key) throw new Error('key required for storage:delete');
        const delEtagRes = await fetch(base + '/api/storage?ns=' + encodeURIComponent(key), {
          credentials: 'include',
        });
        let delEtag = '*';
        if (delEtagRes.ok) {
          delEtag = delEtagRes.headers.get('ETag') || '*';
        }
        
        const delRes = await fetch(base + '/api/storage?ns=' + encodeURIComponent(key), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': delEtag,
            'X-Thesara-App-Id': 'postmessage-bridge'
          },
          credentials: 'include',
          body: JSON.stringify([{ op: 'clear' }]),
        });
        if (!delRes.ok && delRes.status !== 404) {
          throw new Error('Storage DELETE failed: ' + delRes.statusText);
        }
        result = { success: true };
        break;
        
      case 'list':
        const listRes = await fetch(base + '/api/storage/list', {
          credentials: 'include',
        });
        if (!listRes.ok) {
          throw new Error('Storage LIST failed: ' + listRes.statusText);
        }
        const listData = await listRes.json();
        result = { success: true, keys: listData.keys || [] };
        break;
        
      default:
        throw new Error('Unknown storage operation: ' + operation);
    }
    
    // Send response back to app
    window.postMessage({
      type: 'thesara:storage:response',
      id,
      operation,
      ...result,
    }, '*');
    
  } catch (error) {
    console.error('[Thesara Storage Bridge] Error:', error);
    window.postMessage({
      type: 'thesara:storage:response',
      id,
      operation,
      success: false,
      error: error.message || String(error),
    }, '*');
  }
});

console.log('[Thesara Storage Bridge] Ready - listening for postMessage storage requests');
`;
