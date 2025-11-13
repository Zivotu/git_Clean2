import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { getConfig } from '../config.js';
import {
  getDonationByPaymentIntent,
  listDonations,
  updateDonationAlias,
} from '../db.js';
import { stripe } from '../billing.js';

const ANON_LABEL = 'Anonimni Donator';

const toMillis = (value: any): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function') {
      const ms = value.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    if (typeof value.seconds === 'number') {
      const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
      return value.seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return Date.now();
};

function sanitizeAlias(raw: string): string {
  return raw
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim();
}

function normalizePaymentIntent(raw?: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!/^pi_[A-Za-z0-9]+$/i.test(value)) return null;
  return value;
}

export default async function donationsRoutes(app: FastifyInstance) {
  const campaignConfig = getConfig().GOLDEN_BOOK;

  const aliasHandler = async (req: any, reply: any) => {
    const body = (req.body as any) || {};
    const paymentIntentId =
      normalizePaymentIntent(
        body.paymentIntentId || body.payment_intent || body.pi,
      ) || null;
    if (!paymentIntentId) {
      return reply.code(400).send({ error: 'invalid_payment_intent' });
    }
    const donation = await getDonationByPaymentIntent(paymentIntentId);
    if (!donation) {
      return reply.code(404).send({ error: 'donation_not_found' });
    }
    const rawAlias = typeof body.alias === 'string' ? body.alias : '';
    const sanitized = sanitizeAlias(rawAlias);
    const anonymous = sanitized.length === 0;
    if (!anonymous) {
      if (sanitized.length < 2) {
        return reply.code(400).send({ error: 'alias_too_short' });
      }
      if (sanitized.length > 40) {
        return reply.code(400).send({ error: 'alias_too_long' });
      }
    }
    const updated = await updateDonationAlias(
      paymentIntentId,
      anonymous ? null : sanitized,
      anonymous ? 'anonymous' : 'confirmed',
    );
    return {
      ok: true,
      alias: updated.alias ?? ANON_LABEL,
      aliasStatus: updated.aliasStatus,
    };
  };

  for (const url of ['/donations/alias', '/api/donations/alias']) {
    app.post(url, aliasHandler);
  }

  const listHandler = async (req: any) => {
    const query = (req.query as any) || {};
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 200));
    const campaignId =
      typeof query.campaignId === 'string' && query.campaignId.trim()
        ? query.campaignId.trim()
        : undefined;
    const paymentIntentId =
      normalizePaymentIntent(
        query.paymentIntentId ||
          query.payment_intent ||
          query.pi ||
          query.id,
      ) || null;
    const records = [];
    if (paymentIntentId) {
      const record = await getDonationByPaymentIntent(paymentIntentId);
      if (record) records.push(record);
    } else {
      records.push(...(await listDonations({ limit, campaignId })));
    }
    return {
      donations: records.map((record) => ({
        id: record.id,
        alias: record.alias ?? ANON_LABEL,
        aliasStatus: record.aliasStatus,
        campaignId: record.campaignId,
        createdAt: toMillis(record.createdAt),
      })),
      campaign: campaignConfig
        ? {
            id: campaignConfig.campaignId,
            enabled: campaignConfig.enabled,
            startMs: campaignConfig.campaignStartMs,
            endMs: campaignConfig.campaignEndMs,
          }
        : undefined,
    };
  };

  for (const url of ['/donations', '/api/donations']) {
    app.get(url, listHandler);
  }

  const resolveHandler = async (req: any, reply: any) => {
    const query = (req.query as any) || {};
    const sessionId = String(
      query.sessionId || query.session_id || query.session || '',
    ).trim();
    if (!sessionId) {
      return reply.code(400).send({ error: 'missing_session_id' });
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent'],
      });
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent as Stripe.PaymentIntent | null)?.id;
      if (!paymentIntentId) {
        return reply.code(404).send({ error: 'payment_intent_not_found' });
      }
      return { paymentIntentId };
    } catch (err: any) {
      req.log?.error?.({ err, sessionId }, 'donation_session_lookup_failed');
      return reply.code(400).send({ error: 'invalid_session_id' });
    }
  };

  for (const url of ['/donations/resolve-session', '/api/donations/resolve-session']) {
    app.get(url, resolveHandler);
  }
}
