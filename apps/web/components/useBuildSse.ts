import { useEffect, useRef, useState } from 'react';

export type BuildPhase =
  | 'queued'
  | 'bundling'
  | 'verifying'
  | 'published'
  | 'failed'
  | 'status_update'
  | 'final';

export interface SseEvent {
  type: BuildPhase;
  payload?: any;
  at: number;
}

export function useBuildSse(endpoint: string | null) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!endpoint) {
      setStatus('idle');
      setEvents([]);
      setError(null);
      return;
    }

    setStatus('connecting');
    setError(null);
    setEvents([]);

    const es = new EventSource(endpoint);
    esRef.current = es;

    const push = (type: BuildPhase, payload?: any) =>
      setEvents((prev) => [...prev, { type, payload, at: Date.now() }]);

    const handle = (event: MessageEvent, forced?: BuildPhase) => {
      try {
        const data = event.data ? JSON.parse(event.data) : null;
        const t = (forced ?? (data?.status as BuildPhase)) || 'status_update';
        push(t, data);
        if (t === 'final' || t === 'published' || t === 'failed') {
          setStatus('done');
          es.close();
          esRef.current = null;
        } else {
          setStatus('streaming');
        }
      } catch (err: any) {
        setError(err?.message || 'SSE parse error');
        setStatus('error');
      }
    };

    es.addEventListener('message', handle as EventListener);
    es.addEventListener('status_update', (e) => handle(e as MessageEvent, 'status_update'));
    es.addEventListener('final', (e) => handle(e as MessageEvent, 'final'));
    es.onerror = () => {
      setError('SSE connection error');
      setStatus('error');
      es.close();
      esRef.current = null;
    };

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      es.close();
    };
  }, [endpoint]);

  return { events, status, error };
}
