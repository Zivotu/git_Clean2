export const ROOMS_CLIENT_SHIM = `// createx rooms client (ESM)
// Minimal wrapper around platform /rooms API. Works in the browser.

const base = (() => {
  try {
    // Use same-origin API base
    const u = new URL(window.location.origin);
    return u.origin;
  } catch (e) {
    return '';
  }
})();

function getInjectedAppId() {
  try {
    if (typeof window.__THESARA_APP_ID__ === 'string' && window.__THESARA_APP_ID__) {
      return window.__THESARA_APP_ID__;
    }
    const hintedNs = (window.__THESARA_APP_NS || '').toString();
    if (hintedNs.startsWith('app:')) {
      const trimmed = hintedNs.slice(4);
      if (trimmed) return trimmed;
    }
    if (window.thesara && window.thesara.app && window.thesara.app.id) {
      return window.thesara.app.id;
    }
  } catch (e) {}
  return null;
}

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || null;
  } catch (e) {
    return null;
  }
}

async function j(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    ...opts,
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error((body && (body.error||body.message)) || res.statusText);
    err.status = res.status; // @ts-ignore
    err.body = body; // @ts-ignore
    throw err;
  }
  return body;
}

/**
 * Host: create a room for this app.
 * @param {string} appId
 * @param {string} idToken - Firebase ID token (or platform session bearer if applicable)
 */
export async function createRoom(appIdOrOptions, idToken) {
  let appId = appIdOrOptions;
  let pin = null;
  let token = idToken;
  if (appIdOrOptions && typeof appIdOrOptions === 'object') {
    const opts = appIdOrOptions;
    appId = opts.appId || opts.id || opts.listingId || opts.app || null;
    pin = typeof opts.pin === 'string' ? opts.pin : opts.joinToken || null;
    token = opts.token || opts.idToken || token || null;
  }
  if (!appId) {
    appId = getInjectedAppId();
  }
  if (!appId) throw new Error('appId required');
  const url = base + '/rooms/create';
  const body = { appId };
  if (pin) body.pin = pin;
  const headers = {};
  const bearer = token || getQueryParam('token');
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  return j(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Player: join by roomId + joinToken issued by host.
 */
export async function joinRoom(roomId, options = {}) {
  const name = options?.name || '';
  const joinToken = options?.joinToken || options?.pin || options?.token;
  if (!roomId) throw new Error('roomId required');
  if (!joinToken) throw new Error('joinToken required');
  const url = base + '/rooms/' + encodeURIComponent(roomId) + '/join';
  return j(url, {
    method: 'POST',
    body: JSON.stringify({ name: name || '', joinToken }),
  });
}

export async function listPlayers(roomId) {
  const url = base + '/rooms/' + encodeURIComponent(roomId) + '/players';
  return j(url);
}

/**
 * Host-only: append an event. Requires Authorization bearer.
 */
export async function postEvent(roomId, event, idToken) {
  const url = base + '/rooms/' + encodeURIComponent(roomId) + '/events';
  const token = idToken || getQueryParam('token');
  return j(url, {
    method: 'POST',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: JSON.stringify(event || {}),
  });
}

export async function getEvents(roomId, since) {
  const q = since ? ('?since=' + encodeURIComponent(String(since))) : '';
  const url = base + '/rooms/' + encodeURIComponent(roomId) + '/events' + q;
  return j(url);
}

/**
 * Simple polling helper: calls onEvents with new events.
 */
export function pollEvents(roomId, { intervalMs = 1000, onEvents } = {}) {
  let since = 0;
  let stop = false;
  async function tick() {
    if (stop) return;
    try {
      const res = await getEvents(roomId, since);
      const evs = Array.isArray(res?.events) ? res.events : [];
      if (evs.length) {
        since = Math.max(since, ...evs.map(e => e.createdAt || 0));
        onEvents && onEvents(evs);
      }
    } catch (e) {}
    setTimeout(tick, intervalMs);
  }
  tick();
  return () => { stop = true; };
}

const roomsV1 = {
  create: (options) => createRoom(options),
  join: (roomId, options) => joinRoom(roomId, options || {}),
  listPlayers,
  postEvent: (roomId, event, token) => postEvent(roomId, event, token),
  getEvents,
  pollEvents,
};

if (typeof window !== 'undefined') {
  window.roomsV1 = roomsV1;
  window.thesara = window.thesara || {};
  window.thesara.rooms = roomsV1;
}
`;
