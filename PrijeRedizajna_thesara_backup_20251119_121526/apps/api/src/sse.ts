import { EventEmitter } from 'node:events';

export type BuildEventName =
  | 'status'
  | 'progress'
  | 'log'
  | 'final'
  | 'ping';

export interface BuildSseEvent {
  buildId: string;
  event: BuildEventName | string; // dopuštamo custom stringove
  payload?: any;
  id?: string | number;
}

class SseEmitter extends EventEmitter {
  emitBuild(buildId: string, event: BuildEventName | string, payload?: any, id?: string | number | null) {
    const evt: BuildSseEvent = { buildId, event, payload, id: id ?? undefined };
    this.emit('build_event', evt);
  }
}

const sseBus = new SseEmitter();

export const sseEmitter = {
  on: (event: string, listener: (...args: any[]) => void) =>
    sseBus.on(event, listener),
  off: (event: string, listener: (...args: any[]) => void) =>
    sseBus.off(event, listener),
  emit: (buildId: string, event: BuildEventName | string, payload?: any, id?: string | number | null) =>
    sseBus.emitBuild(buildId, event, payload, id),
};

// Jednostavan helper za noviji stil poziva u kodu (npr. review.ts)
export const sse = {
  emit: (buildId: string, event: BuildEventName | string, payload?: any, id?: string | number | null) =>
    sseBus.emitBuild(buildId, event, payload, id),
  on: (...args: Parameters<SseBus['on']>) => sseBus.on(...args),
  off: (...args: Parameters<SseBus['off']>) => sseBus.off(...args),
};