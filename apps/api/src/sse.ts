import { EventEmitter } from 'node:events';

export type BuildEventName =
  | 'status'
  | 'ping'
  | 'final'
  | 'llm_report'
  | 'log'
  | 'progress';

export interface BuildSseEvent {
  buildId: string;
  event: BuildEventName | string; // dopuštamo custom stringove
  payload?: any;
  id?: string | number | null;
}

class SseBus extends EventEmitter {
  emitBuild(buildId: string, event: BuildEventName | string, payload?: any, id?: string | number | null) {
    const evt: BuildSseEvent = { buildId, event, payload, id: id ?? undefined };
    this.emit('build_event', evt);
  }
}

export const sseBus = new SseBus();

// Back-compat alias koji postojeći kod očekuje
export const sseEmitter = sseBus;

// Jednostavan helper za noviji stil poziva u kodu (npr. review.ts)
export const sse = {
  emit: (buildId: string, event: BuildEventName | string, payload?: any, id?: string | number | null) =>
    sseBus.emitBuild(buildId, event, payload, id),
  on: (...args: Parameters<SseBus['on']>) => sseBus.on(...args),
  off: (...args: Parameters<SseBus['off']>) => sseBus.off(...args),
};