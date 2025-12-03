'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';

type ViewerStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

type ViewerEvent = {
  id: string | null;
  event: string;
  data: unknown;
  receivedAt: number;
};

export default function SSEViewerClient({ buildId }: { buildId: string }) {
  const apiBase = useMemo(() => getApiBase(), []);
  const sseUrl = useMemo(
    () => (apiBase ? `${apiBase}/build/${encodeURIComponent(buildId)}/events` : null),
    [apiBase, buildId],
  );

  const [status, setStatus] = useState<ViewerStatus>('connecting');
  const [events, setEvents] = useState<ViewerEvent[]>([]);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000);

  const storageKey = useMemo(() => (sseUrl ? `sse:lastId:${sseUrl}` : null), [sseUrl]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!sseUrl) {
      setStatus('closed');
      return;
    }

    let isActive = true;

    const getStoredLastId = () => {
      try {
        return storageKey ? sessionStorage.getItem(storageKey) : null;
      } catch {
        return null;
      }
    };

    const setStoredLastId = (value: string | null) => {
      if (!storageKey) return;
      try {
        if (value) {
          sessionStorage.setItem(storageKey, value);
        } else {
          sessionStorage.removeItem(storageKey);
        }
      } catch {
        // ignore storage failures
      }
    };

    setLastEventId(getStoredLastId());
    setStatus('connecting');

    const clearReconnect = () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const closeSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.onopen = null;
        eventSourceRef.current.onerror = null;
        eventSourceRef.current.onmessage = null;
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isActive) return;
      setStatus('reconnecting');
      clearReconnect();
      const delay = reconnectDelayRef.current;
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, delay);
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
    };

    const pushEvent = (event: Omit<ViewerEvent, 'receivedAt'>) => {
      const newEvent = { ...event, receivedAt: Date.now() };
      setEvents((prev) => [newEvent, ...prev].slice(0, 50));

      if (newEvent.id) {
        setStoredLastId(newEvent.id);
        setLastEventId(newEvent.id);
      }
    };

    const handleGenericEvent = (event: MessageEvent) => {
      if (!isActive) return;
      setLastHeartbeatAt(Date.now());
      let data: unknown = event.data;
      try {
        data = JSON.parse(event.data);
      } catch {}
      pushEvent({ id: event.lastEventId || null, event: event.type, data });
    };

    const connect = () => {
      if (!isActive || !sseUrl) {
        return;
      }

      closeSource();

      let url = sseUrl;
      const lastId = getStoredLastId();
      if (lastId) {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}lastEventId=${encodeURIComponent(lastId)}`;
      }

      try {
        const source = new EventSource(url, { withCredentials: false });
        eventSourceRef.current = source;

        source.onopen = () => {
          if (!isActive) return;
          reconnectDelayRef.current = 1000;
          clearReconnect();
          setStatus('connected');
        };

        source.onerror = () => {
          if (!isActive) return;
          closeSource();
          scheduleReconnect();
        };

        // Default handler for unnamed events
        source.onmessage = (event: MessageEvent) => {
          if (!isActive) return;
          const payload = typeof event.data === 'string' ? event.data : '';
          const trimmed = payload.trimStart();

          // This is our comment-based heartbeat, ignore it for the event list
          if (payload && trimmed.startsWith(':')) {
            setLastHeartbeatAt(Date.now());
            return;
          }

          handleGenericEvent(event);
        };

        // Add listeners for our named events
        source.addEventListener('ping', handleGenericEvent);
        source.addEventListener('status', handleGenericEvent);
        source.addEventListener('llm_report', handleGenericEvent);
        source.addEventListener('final', handleGenericEvent);
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      isActive = false;
      setStatus('closed');
      clearReconnect();
      closeSource();
    };
  }, [sseUrl, storageKey]);

  const handleCopy = async () => {
    const latest = events.slice(0, 20).map((event) => ({
      id: event.id,
      event: event.event,
      receivedAt: new Date(event.receivedAt).toISOString(),
      data: event.data,
    }));

    try {
      await navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
      setCopyFeedback('Kopirano!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (error) {
      setCopyFeedback('Ne mogu kopirati (clipboard nije dostupan).');
      setTimeout(() => setCopyFeedback(null), 4000);
    }
  };

  const heartbeatInfo = lastHeartbeatAt
    ? `${Math.round((now - lastHeartbeatAt) / 1000)}s ago`
    : 'N/A';

  if (!apiBase) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem' }}>
        <h1>SSE Viewer</h1>
        <p style={{ color: '#b91c1c' }}>
          Nije postavljen NEXT_PUBLIC_API_BASE_URL. Postavi varijablu okruzenja (npr. http://127.0.0.1:8788) i ponovno ucitaj stranicu.
        </p>
      </div>
    );
  }

  const statusColor: Record<ViewerStatus, string> = {
    connected: '#16a34a',
    reconnecting: '#f97316',
    closed: '#6b7280',
    connecting: '#2563eb',
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>SSE Viewer</h1>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#f1f5f9',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: statusColor[status],
                }}
              />
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{status}</span>
            </span>
          </div>
          <div>Build ID: <code>{buildId}</code></div>
          <div>API: <code>{sseUrl}</code></div>
        </div>
      </header>

      <section style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
        <div>Last Event ID: <strong>{lastEventId ?? 'N/A'}</strong></div>
        <div>Zadnji heartbeat: <strong>{heartbeatInfo}</strong></div>
      </section>

      <section style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #cbd5f5',
            backgroundColor: '#1d4ed8',
            color: '#fff',
            cursor: 'pointer',
          }}
          disabled={events.length === 0}
        >
          Copy latest 20 events (JSON)
        </button>
        {copyFeedback && <span>{copyFeedback}</span>}
      </section>

      <section>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Events (last 50)</h2>
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '1rem',
            maxHeight: '480px',
            overflowY: 'auto',
            backgroundColor: '#0f172a',
            color: '#e2e8f0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        >
          {events.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>Cekam dogadaje...</p>
          ) : (
            events.map((event, index) => (
              <article
                key={`${event.receivedAt}-${index}`}
                style={{
                  borderBottom: index === events.length - 1 ? 'none' : '1px solid rgba(148, 163, 184, 0.2)',
                  paddingBottom: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ marginBottom: '0.25rem' }}>
                  <strong>ID:</strong> {event.id ?? '-'} | <strong>Event:</strong> {event.event}
                </div>
                <div style={{ marginBottom: '0.25rem' }}>
                  <strong>Primljeno:</strong> {new Date(event.receivedAt).toLocaleTimeString()}
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {typeof event.data === 'object' ? JSON.stringify(event.data, null, 2) : String(event.data ?? '')}
                </pre>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
