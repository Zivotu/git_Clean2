import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  readAdsSettings,
  writeAdsSettings,
  readAdsSlotConfig,
  writeAdsSlotConfig,
  recordAdsTelemetryEvents,
  readAdsTelemetryDays,
  type AdsTelemetryDailyDoc,
  type AdsTelemetryCounts,
} from '../db.js';
import { requireRole } from '../middleware/auth.js';

const ConfigUpdateSchema = z.object({
  disabled: z.boolean(),
});

const SlotsUpdateSchema = z.object({
  slots: z
    .array(
      z.object({
        key: z.string().min(1),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

const AdsEventSchema = z.object({
  type: z.string().min(1).max(60),
  slotKey: z.string().min(1).max(80).optional(),
  slotId: z.string().min(1).max(80).optional(),
  placement: z.string().min(1).max(80).optional(),
  surface: z.string().min(1).max(80).optional(),
});

const AdsEventsPayloadSchema = z.object({
  events: z.array(AdsEventSchema).min(1).max(50),
});

const AdsTelemetryQuerySchema = z.object({
  range: z
    .union([z.string(), z.number()])
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(30))
    .optional(),
});

type TelemetryTotalsPerKey = Record<
  string,
  {
    total: number;
    breakdown: AdsTelemetryCounts;
  }
>;

type TelemetryTotals = {
  events: {
    total: number;
    breakdown: AdsTelemetryCounts;
  };
  slots: TelemetryTotalsPerKey;
  placements: TelemetryTotalsPerKey;
};

function mergeCounts(target: AdsTelemetryCounts, source: AdsTelemetryCounts) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    target[key] = (target[key] ?? 0) + value;
  }
}

function aggregatePerKey(target: TelemetryTotalsPerKey, source: Record<string, AdsTelemetryCounts>) {
  for (const [key, counts] of Object.entries(source)) {
    if (!counts || typeof counts !== 'object') continue;
    const bucket = (target[key] ??= { total: 0, breakdown: {} });
    let hasExplicitTotal = false;
    let derivedTotal = 0;
    for (const [eventKey, value] of Object.entries(counts)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (eventKey === 'total') {
        bucket.total += value;
        hasExplicitTotal = true;
      } else {
        bucket.breakdown[eventKey] = (bucket.breakdown[eventKey] ?? 0) + value;
        derivedTotal += value;
      }
    }
    if (!hasExplicitTotal) {
      bucket.total += derivedTotal;
    }
  }
}

function buildTelemetryTotals(days: AdsTelemetryDailyDoc[]): TelemetryTotals {
  const totals: TelemetryTotals = {
    events: { total: 0, breakdown: {} },
    slots: {},
    placements: {},
  };
  for (const day of days) {
    totals.events.total += typeof day.totalEvents === 'number' ? day.totalEvents : 0;
    mergeCounts(totals.events.breakdown, day.events);
    aggregatePerKey(totals.slots, day.slots);
    aggregatePerKey(totals.placements, day.placements);
  }
  return totals;
}

export default async function adsRoutes(app: FastifyInstance) {
  const readConfigHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    const settings = await readAdsSettings();
    return reply.send(settings);
  };

  app.get('/ads/config', readConfigHandler);
  app.get('/api/ads/config', readConfigHandler);

  const updateConfigHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    try {
      const updated = await writeAdsSettings({
        disabled: parsed.data.disabled,
        updatedBy: req.authUser?.uid ?? null,
      });
      return reply.send(updated);
    } catch (err) {
      req.log.error({ err }, 'ads_config_update_failed');
      return reply.code(500).send({ error: 'ads_update_failed' });
    }
  };

  app.post(
    '/admin/ads/config',
    { preHandler: [requireRole('admin')] },
    updateConfigHandler,
  );
  app.post(
    '/api/admin/ads/config',
    { preHandler: [requireRole('admin')] },
    updateConfigHandler,
  );

  const readSlotsHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    const slots = await readAdsSlotConfig();
    return reply.send({ slots });
  };

  app.get('/ads/slots', readSlotsHandler);
  app.get('/api/ads/slots', readSlotsHandler);

  const updateSlotsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = SlotsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    try {
      const payload: Record<string, { enabled: boolean; updatedBy?: string | null }> = {};
      for (const slot of parsed.data.slots) {
        payload[slot.key] = {
          enabled: slot.enabled,
          updatedBy: req.authUser?.uid ?? null,
        };
      }
      const updated = await writeAdsSlotConfig(payload);
      return reply.send({ slots: updated });
    } catch (err) {
      req.log.error({ err }, 'ads_slots_update_failed');
      return reply.code(500).send({ error: 'ads_slots_update_failed' });
    }
  };

  app.post(
    '/admin/ads/slots',
    { preHandler: [requireRole('admin')] },
    updateSlotsHandler,
  );
  app.post(
    '/api/admin/ads/slots',
    { preHandler: [requireRole('admin')] },
    updateSlotsHandler,
  );

  const telemetryIngestHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const body =
      typeof req.body === 'string'
        ? (() => {
            try {
              return JSON.parse(req.body);
            } catch {
              return null;
            }
          })()
        : req.body;
    const parsed = AdsEventsPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    try {
      await recordAdsTelemetryEvents(parsed.data.events);
      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err }, 'ads_telemetry_failed');
      return reply.code(500).send({ error: 'ads_telemetry_failed' });
    }
  };

  app.post('/ads/events', telemetryIngestHandler);
  app.post('/api/ads/events', telemetryIngestHandler);

  const telemetryReadHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsedQuery = AdsTelemetryQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsedQuery.error.issues });
    }
    const rangeDays = parsedQuery.data.range ?? 7;
    const days = await readAdsTelemetryDays(rangeDays);
    const totals = buildTelemetryTotals(days);
    return reply.send({
      rangeDays,
      days,
      totals,
    });
  };

  app.get(
    '/admin/ads/telemetry',
    { preHandler: [requireRole('admin')] },
    telemetryReadHandler,
  );
  app.get(
    '/api/admin/ads/telemetry',
    { preHandler: [requireRole('admin')] },
    telemetryReadHandler,
  );
}
