
import { useState, useEffect, useRef } from 'react';

export type BuildStatus = 'queued' | 'bundling' | 'verifying' | 'success' | 'failed';

export interface BuildState {
  status: BuildStatus | null;
  reason: string | null;
  listingId: string | null;
}

export function useBuildEvents(buildId: string | null) {
  const [buildState, setBuildState] = useState<BuildState>({ status: null, reason: null, listingId: null });
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!buildId) {
      return;
    }

    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/build/${buildId}/events`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        reconnectAttemptsRef.current = 0; // Reset on successful connection
      };

      es.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        setBuildState((prevState) => ({ ...prevState, status: data.status, reason: data.reason }));
      });

      es.addEventListener('final', (event) => {
        const data = JSON.parse(event.data);
        setBuildState({ status: data.status, reason: data.reason, listingId: data.listingId });
        es.close();
      });

      es.onerror = () => {
        es.close();
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * 2 ** attempts, 30000); // Exponential backoff up to 30s
        setTimeout(connect, delay);
        reconnectAttemptsRef.current = attempts + 1;
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [buildId]);

  return buildState;
}
