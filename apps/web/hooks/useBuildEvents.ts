import { useState, useEffect } from 'react';
import { createSSE } from '@/lib/sse';
import { buildEventsUrl } from '@/lib/build-events';

export type BuildStatus = 'queued' | 'bundling' | 'verifying' | 'success' | 'failed';

export interface BuildState {
  status: BuildStatus | null;
  reason: string | null;
  listingId: string | null;
  progress?: number;
  errorAnalysis?: string;
  errorFixPrompt?: string;
  errorCategory?: 'syntax' | 'dependency' | 'build-config' | 'runtime' | 'unknown';
}

export function useBuildEvents(buildId: string | null) {
  const [buildState, setBuildState] = useState<BuildState>({ status: null, reason: null, listingId: null, progress: undefined });

  useEffect(() => {
    if (!buildId) {
      setBuildState({ status: null, reason: null, listingId: null, progress: undefined });
      return;
    }

    const sse = createSSE(buildEventsUrl(buildId), {
      buildLastEventIdKey: `sse:lastId:build:${buildId}`,
      eventNames: ['status', 'final'],
      onMessage: (message) => {
        const { data, event: eventType } = message;

        if (eventType === 'status') {
          setBuildState((prevState) => ({
            ...prevState,
            status: data.status,
            reason: data.reason ?? null,
            progress: data.progress,
          }));
        } else if (eventType === 'final') {
          setBuildState({
            status: data.status,
            reason: data.reason ?? null,
            listingId: data.listingId,
            progress: 100,
            errorAnalysis: data.errorAnalysis,
            errorFixPrompt: data.errorFixPrompt,
            errorCategory: data.errorCategory,
          });
          sse.close();
        }
      },
      onError: (err, eventSource) => {
        console.error(`SSE connection error for build ${buildId}:`, err);
        console.error(`SSE readyState: ${eventSource?.readyState}`);
        setBuildState((prevState) => ({ ...prevState, status: 'failed', reason: 'Connection lost' }));
      },
    });

    return () => {
      sse.close();
    };
  }, [buildId]);

  return buildState;
}
