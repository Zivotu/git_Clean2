'use client';

import { getApiBase } from '@/lib/apiBase';

export type AdsTelemetryEvent =
  | {
      type:
        | 'consent_prompt_shown'
        | 'consent_granted'
        | 'consent_rejected'
        | 'consent_reset'
        | 'slot_render_attempt'
        | 'slot_render_filled'
        | 'slot_closed';
      slotKey?: string;
      slotId?: string;
      placement?: string;
      surface?: string;
      status?: string;
    }
  | {
      type: string;
      slotKey?: string;
      slotId?: string;
      placement?: string;
      surface?: string;
      status?: string;
    };

type NormalizedEvent = Required<Pick<AdsTelemetryEvent, 'type'>> &
  Omit<AdsTelemetryEvent, 'type'> & {
    type: string;
    ts: number;
    path?: string;
  };

const BATCH_SIZE = 12;
const FLUSH_INTERVAL_MS = 3000;
let queue: NormalizedEvent[] = [];
let timer: number | null = null;
let listenersAttached = false;
let flushing = false;

function sanitize(value: unknown, max = 80): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function normalizeEvent(event: AdsTelemetryEvent): NormalizedEvent | null {
  const type = sanitize(event.type, 60);
  if (!type) return null;
  const ts = Date.now();
  const payload: NormalizedEvent = {
    type,
    ts,
  };
  const slotKey = sanitize(event.slotKey, 60);
  if (slotKey) payload.slotKey = slotKey;
  const slotId = sanitize(event.slotId, 64);
  if (slotId) payload.slotId = slotId;
  const placement = sanitize(event.placement, 64);
  if (placement) payload.placement = placement;
  const surface = sanitize(event.surface, 40);
  if (surface) payload.surface = surface;
  const status = sanitize(event.status, 40);
  if (status) payload.status = status;
  if (typeof window !== 'undefined') {
    payload.path = window.location?.pathname || '/';
  }
  return payload;
}

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  const flushUnload = () => {
    flushQueue('unload');
  };
  window.addEventListener('beforeunload', flushUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushQueue('unload');
    }
  });
}

function scheduleFlush() {
  if (timer || typeof window === 'undefined') return;
  timer = window.setTimeout(() => {
    timer = null;
    flushQueue('timer');
  }, FLUSH_INTERVAL_MS);
}

function resolveEndpoint(): string {
  try {
    const base = getApiBase();
    return `${base}/ads/events`;
  } catch {
    return '/api/ads/events';
  }
}

async function sendBatch(batch: NormalizedEvent[], reason: 'timer' | 'batch' | 'unload') {
  if (!batch.length) return;
  const payload = JSON.stringify({ events: batch });
  const endpoint = resolveEndpoint();

  if (reason === 'unload' && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    try {
      navigator.sendBeacon(endpoint, payload);
      return;
    } catch {
      // Fallback to fetch below
    }
  }

  try {
    flushing = true;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: reason === 'unload',
      credentials: 'omit',
    });
  } catch (err) {
    console.warn('[adsTelemetry] Failed to send batch', err);
  } finally {
    flushing = false;
  }
}

export async function flushAdsTelemetryQueue(reason: 'timer' | 'batch' | 'unload' = 'timer') {
  if (!queue.length) return;
  if (timer && typeof window !== 'undefined') {
    window.clearTimeout(timer);
    timer = null;
  }
  const batch = queue.splice(0, queue.length);
  await sendBatch(batch, reason);
}

function flushQueue(reason: 'timer' | 'batch' | 'unload') {
  if (flushing && reason !== 'unload') return;
  void flushAdsTelemetryQueue(reason);
}

export function logAdsTelemetry(event: AdsTelemetryEvent) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeEvent(event);
  if (!normalized) return;
  queue.push(normalized);
  ensureListeners();
  if (queue.length >= BATCH_SIZE) {
    flushQueue('batch');
    return;
  }
  scheduleFlush();
}
