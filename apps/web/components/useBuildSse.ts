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
  const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'done' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!endpoint) {
      setStatus('idle');
      return;
    }
    setStatus('connecting');
    setError(null);

    const es = new EventSource(endpoint);
    esRef.current = es;

    const push = (type: BuildPhase, payload?: any) =>
      setEvents((prev) => [...prev, { type, payload, at: Date.now() }]);

    const handle = (event: MessageEvent, forced?: BuildPhase) => {
      try {
        const data = event.data ? JSON.parse(event.data) : null;
        const type = (forced ?? (data?.status as BuildPhase)) || 'status_update';
        push(type, data);
        if (type === 'final' || type === 'published' || type === 'failed') {
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

    const handleMessage = (event: MessageEvent) => handle(event);
    const handleStatusUpdate = (event: MessageEvent) => handle(event, 'status_update');
    const handleFinal = (event: MessageEvent) => handle(event, 'final');

    es.addEventListener('message', handleMessage);
    es.addEventListener('status_update', handleStatusUpdate);
    es.addEventListener('final', handleFinal);
    es.onerror = () => {
      setError('SSE connection error');
      setStatus('error');
      es.close();
      esRef.current = null;
    };

    return () => {
      es.removeEventListener('message', handleMessage);
      es.removeEventListener('status_update', handleStatusUpdate);
      es.removeEventListener('final', handleFinal);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [endpoint]);

  return { events, status, error };
}
