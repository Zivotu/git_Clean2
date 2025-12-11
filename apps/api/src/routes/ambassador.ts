
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FieldValue } from 'firebase-admin/firestore';
import type { Query, DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db, upsertEntitlement, logBillingEvent } from '../db.js';
import { requireRole, requireAmbassador } from '../middleware/auth.js';
import { notifyUser, notifyAdmins } from '../notifier.js';
import type { User, AmbassadorInfo, PromoCode, ReferredByInfo, Payout, AmbassadorPost } from '../types.js';

/**
 * Generates a unique promo code for an ambassador.
 */
async function generateUniquePromoCode(handle: string): Promise<string> {
  const baseCode = handle.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  let promoCode = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 20) {
    const suffix = Math.floor(Math.random() * 900) + 100;
    promoCode = `${baseCode}${suffix}`;
    const existingCode = await db.collection('promoCodes').doc(promoCode).get();
    if (!existingCode.exists) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    promoCode = `AMB${Date.now().toString().slice(-8)}`;
  }

  return promoCode;
}

const DEFAULT_PAYOUT_THRESHOLD = 50;
const PAYOUT_THRESHOLD_EUR = (() => {
  const raw = Number(process.env.AMBASSADOR_PAYOUT_THRESHOLD_EUR);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PAYOUT_THRESHOLD;
})();
const AMBASSADOR_DASHBOARD_URL =
  process.env.AMBASSADOR_DASHBOARD_URL ||
  `${process.env.WEB_BASE || 'https://thesara.space'}/ambassador/dashboard`;
const AMBASSADOR_MARKETING_KIT_URL =
  process.env.AMBASSADOR_MARKETING_KIT_URL ||
  `${process.env.WEB_BASE || 'https://thesara.space'}/ambassador-kit`;

const MIN_POSTS_PER_MONTH = (() => {
  const raw = Number(process.env.AMBASSADOR_MIN_POSTS_PER_MONTH);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 20) : 2;
})();

function monthKeyFrom(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}


export default async function ambassadorRoutes(app: FastifyInstance) {
  // Apply for the Ambassador Program
  app.post(
    '/api/ambassador/apply',
    { preHandler: [requireRole(['user'])], config: { rateLimit: { max: 3, timeWindow: '1 day' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { uid } = req.authUser!;
      const schema = z.object({
        socialLinks: z.record(z.string().url()).optional(),
        motivation: z.string().min(10).max(1000),
        primaryPlatform: z.string().max(120).optional(),
        audienceSize: z.string().max(120).optional(),
        commissionModel: z.enum(['turbo', 'partner']).optional().default('turbo'),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });
      }

      const { socialLinks, motivation, primaryPlatform, audienceSize, commissionModel } = parsed.data;
      const userRef = db.collection('users').doc(uid);

      try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
          return reply.code(404).send({ error: 'user_not_found' });
        }

        const userData = userDoc.data() as User;
        if (userData.ambassador && userData.ambassador.status !== 'rejected') {
          return reply.code(409).send({ error: 'already_applied' });
        }

        const application: AmbassadorInfo = {
          status: 'pending',
          appliedAt: Date.now(),
          commissionModel,
          socialLinks: socialLinks || {},
          motivation: motivation || '',
          primaryPlatform,
          audienceSize,
          earnings: { currentBalance: 0, totalEarned: 0 },
        };

        await userRef.set({ ambassador: application }, { merge: true });

        try {
          await Promise.all([
            notifyUser(
              uid,
              'Thesara Ambasador program · prijava zaprimljena',
              [
                'Hvala ti na interesu za Thesara Ambasador program!',
                '',
                'Tvoj zahtjev je uspješno zaprimljen i naš tim će ga pregledati u narednih nekoliko dana.',
                'Javit ćemo ti se čim donesemo odluku.',
                '',
                'Srdačno,',
                'Thesara tim',
              ].join('\n')
            ),
            notifyAdmins(
              'Nova ambasador prijava',
              [
                `UID: ${uid}`,
                `Email: ${userData.email ?? 'n/a'}`,
                `Ime: ${userData.displayName ?? 'n/a'}`,
                `Linkovi: ${JSON.stringify(socialLinks || {})}`,
              ].join('\n')
            ),
          ]);
        } catch (notifyErr) {
          req.log.warn({ notifyErr }, 'ambassador_application_notifications_failed');
        }
        return reply.code(201).send({ status: 'application_received' });
      } catch (error) {
        req.log.error(error, 'Failed to apply for ambassador program');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // Ambassador dashboard data
  app.get(
    '/api/ambassador/dashboard',
    { preHandler: [requireAmbassador()] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const uid = req.authUser!.uid;

      try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
          return reply.code(404).send({ error: 'user_not_found' });
        }

        const userData = userDoc.data() as User;
        const ambassador = userData.ambassador;
        if (!ambassador || ambassador.status !== 'approved') {
          return reply.code(403).send({ error: 'not_an_ambassador' });
        }

        let promoCodeDoc: PromoCode | null = null;
        if (ambassador.promoCode) {
          const promoSnap = await db.collection('promoCodes').doc(ambassador.promoCode).get();
          if (promoSnap.exists) {
            promoCodeDoc = promoSnap.data() as PromoCode;
          }
        }

        const payoutQuery = await db
          .collection('payouts')
          .where('ambassadorUid', '==', uid)
          .orderBy('requestedAt', 'desc')
          .limit(25)
          .get();
        const payouts = payoutQuery.docs.map((doc) => doc.data() as Payout);

        // Load recent content submissions for current month
        const now = Date.now();
        const currentMonth = monthKeyFrom(now);
        const postsSnap = await db
          .collection('ambassadorPosts')
          .where('ambassadorUid', '==', uid)
          .where('monthKey', '==', currentMonth)
          .orderBy('submittedAt', 'desc')
          .limit(25)
          .get();
        const posts = postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AmbassadorPost[];
        const monthlySubmitted = posts.length;
        const monthlyVerified = posts.filter((p) => p.status === 'verified').length;

        return reply.send({
          ambassador: {
            status: ambassador.status,
            promoCode: ambassador.promoCode ?? null,
            socialLinks: ambassador.socialLinks ?? {},
            motivation: ambassador.motivation ?? '',
            earnings: ambassador.earnings ?? { currentBalance: 0, totalEarned: 0 },
            dashboardUrl: ambassador.dashboardUrl || AMBASSADOR_DASHBOARD_URL,
            marketingKitUrl: ambassador.marketingKitUrl || AMBASSADOR_MARKETING_KIT_URL,
            payoutEmail: ambassador.payoutEmail ?? userData.email ?? null,
          },
          promoCode: promoCodeDoc,
          payouts,
          payoutThreshold: PAYOUT_THRESHOLD_EUR,
          activity: {
            minPostsPerMonth: MIN_POSTS_PER_MONTH,
            monthKey: currentMonth,
            submitted: monthlySubmitted,
            verified: monthlyVerified,
            recentPosts: posts,
          },
        });
      } catch (error) {
        req.log.error(error, 'Failed to load ambassador dashboard');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // Ambassador payout request
  app.post(
    '/api/ambassador/payout-request',
    { preHandler: [requireAmbassador()], config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const uid = req.authUser!.uid;
      const schema = z.object({
        amount: z.number().positive().optional(),
        paypalEmail: z.string().email().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });
      }
      const { amount: requestedAmount, paypalEmail } = parsed.data;

      try {
        const payoutId = await db.runTransaction(async (t) => {
          const userRef = db.collection('users').doc(uid);
          const userDoc = await t.get(userRef);
          if (!userDoc.exists) throw new Error('user_not_found');
          const userData = userDoc.data() as User;
          const ambassador = userData.ambassador;
          if (!ambassador || ambassador.status !== 'approved') throw new Error('not_an_ambassador');

          // Enforce monthly content requirement before payout
          if (MIN_POSTS_PER_MONTH > 0) {
            const now = Date.now();
            const currentMonth = monthKeyFrom(now);
            const postsQuery = await db
              .collection('ambassadorPosts')
              .where('ambassadorUid', '==', uid)
              .where('monthKey', '==', currentMonth)
              .where('status', '==', 'verified')
              .get();
            if (postsQuery.size < MIN_POSTS_PER_MONTH) throw new Error('insufficient_activity');
          }

          const currentBalance = ambassador.earnings?.currentBalance ?? 0;
          const amount = requestedAmount ?? currentBalance;
          if (!amount || amount <= 0) throw new Error('invalid_amount');
          if (amount > currentBalance + 1e-6) throw new Error('insufficient_balance');
          if (amount < PAYOUT_THRESHOLD_EUR) throw new Error('below_threshold');

          const activePayoutsSnap = await t.get(
            db
              .collection('payouts')
              .where('ambassadorUid', '==', uid)
              .where('status', 'in', ['pending', 'processing'])
              .limit(1)
          );
          if (!activePayoutsSnap.empty) throw new Error('payout_in_progress');

          const payoutRef = db.collection('payouts').doc();
          const payoutEmail = paypalEmail || ambassador.payoutEmail || userData.email || '';
          const newPayout: Payout = {
            payoutId: payoutRef.id,
            ambassadorUid: uid,
            amount,
            status: 'pending',
            requestedAt: Date.now(),
            method: 'PayPal',
            transactionId: undefined,
            paypalEmail: payoutEmail || undefined,
          };

          t.set(payoutRef, newPayout);
          t.update(userRef, {
            'ambassador.earnings.currentBalance': currentBalance - amount,
            ...(payoutEmail ? { 'ambassador.payoutEmail': payoutEmail } : {}),
          });

          return payoutRef.id;
        });

        // Audit log: payout requested
        try {
          await logBillingEvent({
            userId: uid,
            eventType: 'ambassador.payout.requested',
            amount: requestedAmount || undefined,
            ts: Date.now(),
            details: { payoutId },
          });
        } catch { }

        try {
          await Promise.all([
            notifyUser(
              uid,
              'Thesara Ambasador program · zahtjev za isplatu zaprimljen',
              [
                'Zaprimili smo tvoj zahtjev za isplatu.',
                'Administracija će ga obraditi u okviru redovnog mjesečnog ciklusa.',
                '',
                'Status možeš pratiti u svom ambassador dashboardu.',
                '',
                'Hvala na promociji Thesare!',
                'Thesara tim',
              ].join('\n')
            ),
            notifyAdmins(
              'Novi zahtjev za ambasador isplatu',
              `UID: ${uid}\nPayout ID: ${payoutId}`
            ),
          ]);
        } catch (notifyErr) {
          req.log.warn({ notifyErr }, 'ambassador_payout_request_notify_failed');
        }

        return reply.code(201).send({ status: 'payout_requested', payoutId });
      } catch (error: any) {
        req.log.error(error, 'Failed to request ambassador payout');
        const clientErrors = [
          'user_not_found',
          'not_an_ambassador',
          'invalid_amount',
          'insufficient_balance',
          'below_threshold',
          'payout_in_progress',
          'insufficient_activity',
        ];
        if (clientErrors.includes(error.message)) {
          return reply.code(400).send({ error: error.message });
        }
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // Ambassador submits social proof (content link)
  app.post(
    '/api/ambassador/content-submit',
    { preHandler: [requireAmbassador()], config: { rateLimit: { max: 10, timeWindow: '1 day' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const uid = req.authUser!.uid;
      const schema = z.object({
        url: z.string().url(),
        platform: z.string().max(40).optional(),
        caption: z.string().max(300).optional(),
        postedAt: z.number().int().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });

      const { url, platform, caption, postedAt } = parsed.data;
      try {
        const now = Date.now();
        const ref = db.collection('ambassadorPosts').doc();
        const post: AmbassadorPost = {
          id: ref.id,
          ambassadorUid: uid,
          url,
          platform,
          caption,
          postedAt,
          submittedAt: now,
          monthKey: monthKeyFrom(now),
          status: 'pending',
        };
        await ref.set(post);
        return reply.code(201).send({ status: 'submitted', id: ref.id });
      } catch (error) {
        req.log.error(error, 'content_submit_failed');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    },
  );

  // Admin: list submitted posts
  app.get(
    '/api/admin/ambassador/posts',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({
        status: z.enum(['pending', 'verified', 'rejected', 'all']).optional().default('pending'),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        limit: z
          .preprocess((v) => (v == null || v === '' ? undefined : Number(v)), z.number().int().min(1).max(200))
          .optional(),
      });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
      const { status, month, limit } = parsed.data;

      try {
        let q: Query<DocumentData> = db.collection('ambassadorPosts');
        if (status !== 'all') q = (q as any).where('status', '==', status);
        if (month) q = (q as any).where('monthKey', '==', month);
        q = q.orderBy('submittedAt', 'desc');
        if (limit) q = q.limit(limit);
        const snap = await q.get();
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        return reply.send({ items });
      } catch (error) {
        req.log.error(error, 'list_posts_failed');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    },
  );

  // Admin: verify/reject a post
  app.post(
    '/api/admin/ambassador/posts/verify',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({
        id: z.string(),
        status: z.enum(['verified', 'rejected']),
        adminNote: z.string().max(300).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });
      const { id, status, adminNote } = parsed.data;
      try {
        const ref = db.collection('ambassadorPosts').doc(id);
        const updates: any = { status };
        if (status === 'verified') updates.verifiedAt = Date.now();
        if (status === 'rejected') updates.rejectedAt = Date.now();
        if (adminNote) updates.adminNote = adminNote;
        await ref.set(updates, { merge: true });
        return reply.send({ status: 'updated', id });
      } catch (error) {
        req.log.error(error, 'verify_post_failed');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    },
  );

  // (Admin) Approve an ambassador application
  app.post(
    '/api/admin/ambassadors/approve',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({ uid: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });
      }

      const { uid } = parsed.data;
      const userRef = db.collection('users').doc(uid);
      let userEmail: string | undefined;
      let displayName: string | undefined;
      let promoCode: string | undefined;

      try {
        promoCode = await db.runTransaction(async (t) => {
          const userDoc = await t.get(userRef);
          if (!userDoc.exists) throw new Error('user_not_found');

          const userData = userDoc.data() as User;
          if (userData.ambassador?.status !== 'pending') throw new Error('application_not_pending');

          const handle = userData.handle || userData.displayName || 'user';
          const newPromoCode = await generateUniquePromoCode(handle);

          const updatedAmbassadorInfo: AmbassadorInfo = {
            ...userData.ambassador,
            status: 'approved',
            approvedAt: Date.now(),
            promoCode: newPromoCode,
            dashboardUrl: userData.ambassador?.dashboardUrl || AMBASSADOR_DASHBOARD_URL,
            marketingKitUrl: userData.ambassador?.marketingKitUrl || AMBASSADOR_MARKETING_KIT_URL,
          };
          t.set(userRef, { ambassador: updatedAmbassadorInfo }, { merge: true });

          const promoCodeRef = db.collection('promoCodes').doc(newPromoCode);
          const promoCodeDoc: PromoCode = {
            code: newPromoCode,
            ambassadorUid: uid,
            benefit: { type: 'discount', discount1stMonth: 0.40, discount2ndMonth: 0.50 }, // 40% + 50%
            isActive: true,
            usageCount: 0,
            paidConversionsCount: 0,
            totalRevenueGenerated: 0,
          };
          t.set(promoCodeRef, promoCodeDoc);

          userEmail = userData.email;
          displayName =
            userData.displayName || userData.handle || userData.email || userData.uid || uid;

          return newPromoCode;
        });

        try {
          await notifyUser(
            uid,
            'Thesara Ambasador program · dobrodošlica',
            [
              `Čestitamo ${displayName ?? ''}!`,
              '',
              'Tvoja prijava je odobrena i sad si dio Thesara Ambasador programa.',
              `Tvoj promotivni kod: ${promoCode}`,
              '',
              `Ambasador dashboard: ${AMBASSADOR_DASHBOARD_URL}`,
              `Marketing kit: ${AMBASSADOR_MARKETING_KIT_URL}`,
              '',
              'Prvi koraci:',
              '- podijeli kod sa svojom publikom',
              '- prati statistiku i zatraži isplatu kad dosegneš prag',
              '',
              'Ako trebaš pomoć, odgovori na ovaj email.',
              '',
              'Sretno i hvala na podršci!',
              'Thesara tim',
            ].join('\n')
          );
        } catch (notifyErr) {
          req.log.warn({ notifyErr }, 'ambassador_approval_notification_failed');
        }

        return reply.send({ status: 'approved', uid, promoCode });
      } catch (error: any) {
        req.log.error(error, `Failed to approve ambassador ${uid}`);
        if (error.message === 'user_not_found' || error.message === 'application_not_pending') {
          return reply.code(409).send({ error: error.message });
        }
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // (Admin) Reject an ambassador application
  app.post(
    '/api/admin/ambassadors/reject',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({
        uid: z.string(),
        reason: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });
      }

      const { uid, reason } = parsed.data;
      const userRef = db.collection('users').doc(uid);
      let displayName: string | undefined;

      try {
        let expiresAtOut: number | undefined;
        let trialDaysOut: number | undefined;
        await db.runTransaction(async (t) => {
          const userDoc = await t.get(userRef);
          if (!userDoc.exists) throw new Error('user_not_found');

          const userData = userDoc.data() as User;
          const ambassador = userData.ambassador;
          if (!ambassador) throw new Error('no_application');
          if (ambassador.status === 'rejected') throw new Error('already_rejected');

          const updatedAmbassador: AmbassadorInfo = {
            ...ambassador,
            status: 'rejected',
            rejectedAt: Date.now(),
            adminNotes: reason || ambassador.adminNotes,
          };

          t.set(userRef, { ambassador: updatedAmbassador }, { merge: true });

          if (ambassador.promoCode) {
            const promoRef = db.collection('promoCodes').doc(ambassador.promoCode);
            t.set(promoRef, { isActive: false }, { merge: true });
          }

          displayName =
            userData.displayName || userData.handle || userData.email || userData.uid || uid;
        });

        try {
          await notifyUser(
            uid,
            'Thesara Ambasador program · odluka o prijavi',
            [
              `Pozdrav ${displayName ?? ''},`,
              '',
              'Zahvaljujemo na prijavi u Thesara Ambasador program.',
              'Nažalost, ovaj put ne možemo odobriti tvoju prijavu.',
              reason ? `Razlog: ${reason}` : '',
              '',
              'Veselimo se budućoj suradnji i slobodno se prijavi ponovno kad ojačaš svoju zajednicu.',
              '',
              'Thesara tim',
            ]
              .filter(Boolean)
              .join('\n')
          );
        } catch (notifyErr) {
          req.log.warn({ notifyErr }, 'ambassador_rejection_notify_failed');
        }

        return reply.send({ status: 'rejected', uid });
      } catch (error: any) {
        req.log.error(error, `Failed to reject ambassador ${uid}`);
        const clientErrors = ['user_not_found', 'no_application', 'already_rejected'];
        if (clientErrors.includes(error.message)) {
          return reply.code(409).send({ error: error.message });
        }
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // (Admin) List ambassador applications
  app.get(
    '/api/admin/ambassadors/applications',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('pending'),
        limit: z
          .preprocess(
            (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
            z.number().int().min(1).max(200)
          )
          .optional(),
      });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
      }

      const { status, limit } = parsed.data;
      const max = limit ?? 100;

      try {
        const results: User[] = [];
        const statuses =
          status === 'all' ? (['pending', 'approved', 'rejected'] as const) : ([status] as const);

        for (const s of statuses) {
          if (!s) continue;
          const snap = await db
            .collection('users')
            .where('ambassador.status', '==', s)
            .limit(max)
            .get();
          snap.docs.forEach((doc) => {
            const data = doc.data() as User;
            results.push({ ...data, uid: data.uid || doc.id });
          });
        }

        return reply.send({
          items: results.slice(0, max).map((user) => ({
            uid: user.uid,
            email: user.email ?? null,
            displayName: user.displayName ?? null,
            handle: (user as any).handle ?? null,
            photoURL: user.photoURL ?? null,
            ambassador: user.ambassador,
          })),
        });
      } catch (error) {
        req.log.error(error, 'Failed to list ambassador applications');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // (Admin) List payout requests
  app.get(
    '/api/admin/payouts',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({
        status: z.enum(['pending', 'processing', 'paid', 'rejected', 'all']).optional().default('pending'),
        limit: z
          .preprocess(
            (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
            z.number().int().min(1).max(200)
          )
          .optional(),
      });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
      }

      const { status, limit } = parsed.data;
      const col = db.collection('payouts');
      let query: Query<DocumentData> = col;
      if (status !== 'all') {
        query = query.where('status', '==', status);
      }
      query = query.orderBy('requestedAt', 'desc');
      if (limit) {
        query = query.limit(limit);
      }

      try {
        const snap = await query.get();
        const items = snap.docs.map((doc) => doc.data() as Payout);
        return reply.send({ items });
      } catch (error) {
        req.log.error(error, 'Failed to list payout requests');
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // (Admin) Process payout status updates
  app.post(
    '/api/admin/payouts/process',
    { preHandler: [requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const schema = z.object({
        payoutId: z.string(),
        status: z.enum(['processing', 'paid', 'rejected']),
        transactionId: z.string().max(200).optional(),
        note: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', details: parsed.error.issues });
      }

      const { payoutId, status, transactionId, note } = parsed.data;
      const payoutRef = db.collection('payouts').doc(payoutId);
      let ambassadorUid: string | undefined;

      try {
        await db.runTransaction(async (t) => {
          const payoutDoc = await t.get(payoutRef);
          if (!payoutDoc.exists) throw new Error('payout_not_found');

          const payout = payoutDoc.data() as Payout;
          ambassadorUid = payout.ambassadorUid;
          const updates: Record<string, any> = {
            status,
            ...(note
              ? { note }
              : { note: FieldValue.delete() }),
          };

          if (transactionId) {
            updates.transactionId = transactionId;
          } else {
            updates.transactionId = FieldValue.delete();
          }

          if (status === 'paid') {
            updates.paidAt = Date.now();
          } else if (status === 'rejected') {
            updates.rejectedAt = Date.now();
            const userRef = db.collection('users').doc(payout.ambassadorUid);
            t.update(userRef, {
              'ambassador.earnings.currentBalance': FieldValue.increment(payout.amount),
            });
          }

          t.update(payoutRef, updates);
        });

        if (ambassadorUid) {
          try {
            if (status === 'paid') {
              await notifyUser(
                ambassadorUid,
                'Thesara Ambasador program · isplata obrađena',
                [
                  'Tvoj zahtjev za isplatu je obrađen i označen kao plaćen.',
                  transactionId ? `PayPal transakcija: ${transactionId}` : '',
                  '',
                  'Hvala na promociji Thesare!',
                  'Thesara tim',
                ]
                  .filter(Boolean)
                  .join('\n')
              );
            } else if (status === 'rejected') {
              await notifyUser(
                ambassadorUid,
                'Thesara Ambasador program · isplata odbijena',
                [
                  'Nažalost, tvoj zahtjev za isplatu je odbijen.',
                  note ? `Napomena: ${note}` : '',
                  '',
                  'Iznos je vraćen na tvoj balans i možeš ponovno zatražiti isplatu kada bude spremno.',
                  '',
                  'Thesara tim',
                ]
                  .filter(Boolean)
                  .join('\n')
              );
            }
          } catch (notifyErr) {
            req.log.warn({ notifyErr }, 'ambassador_payout_process_notify_failed');
          }
        }

        return reply.send({ status: 'updated', payoutId, newStatus: status });
      } catch (error: any) {
        req.log.error(error, `Failed to update payout ${payoutId}`);
        if (error.message === 'payout_not_found') {
          return reply.code(404).send({ error: 'payout_not_found' });
        }
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );

  // Redeem a promotional code
  app.post(
    '/promo-codes/redeem',
    { preHandler: [requireRole(['user'])], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { uid } = req.authUser!;
      const schema = z.object({ code: z.string().min(3) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input' });
      }

      const { code } = parsed.data;
      const userRef = db.collection('users').doc(uid);
      const promoCodeRef = db.collection('promoCodes').doc(code);

      let trialDaysOut: number | undefined;
      let expiresAtOut: number | undefined;

      try {
        await db.runTransaction(async (t) => {
          const userDoc = await t.get(userRef);
          const promoCodeDoc = await t.get(promoCodeRef);

          if (!promoCodeDoc.exists) throw new Error('code_not_found');
          if (!userDoc.exists) throw new Error('user_not_found');

          const promoCodeData = promoCodeDoc.data() as PromoCode;
          const userData = userDoc.data() as User;

          if (!promoCodeData.isActive) throw new Error('code_inactive');
          if (userData.referredBy) throw new Error('already_referred');
          if (promoCodeData.ambassadorUid === uid) throw new Error('cannot_redeem_own_code');

          // 1. Update user with referral info
          const referralInfo: ReferredByInfo = {
            ambassadorUid: promoCodeData.ambassadorUid,
            promoCode: code,
            redeemedAt: Date.now(),
          };
          t.set(userRef, { referredBy: referralInfo }, { merge: true });

          // 2. Increment promo code usage count
          t.update(promoCodeRef, { usageCount: (promoCodeData.usageCount || 0) + 1 });

          // 3. Grant benefit based on type
          if (promoCodeData.benefit.type === 'free_gold_trial') {
            // Legacy: Grant 'isGold' entitlement for N days
            const trialDays = promoCodeData.benefit.durationDays || 30;
            const expiresAt = Date.now() + trialDays * 24 * 60 * 60 * 1000;
            trialDaysOut = trialDays;
            expiresAtOut = expiresAt;
            await upsertEntitlement({
              id: `ambassador-trial-${uid}`,
              userId: uid,
              feature: 'isGold',
              active: true,
              data: { expiresAt, redeemedFrom: code },
            });
          } else if (promoCodeData.benefit.type === 'discount') {
            // New discount model: Store discount info in user metadata
            // The billing logic will read this when processing the payment
            const discountData = {
              discount1stMonth: promoCodeData.benefit.discount1stMonth,
              discount2ndMonth: promoCodeData.benefit.discount2ndMonth,
              appliedAt: Date.now(),
              promoCode: code,
            };
            t.set(userRef, { ambassadorDiscount: discountData }, { merge: true });
          }
        });

        // Audit log for promo redeem
        try {
          await logBillingEvent({
            userId: uid,
            eventType: 'promo.redeem',
            ts: Date.now(),
            details: { code, expiresAt: expiresAtOut, trialDays: trialDaysOut },
          });
        } catch { }

        return reply.send({
          status: 'redeemed',
          message: trialDaysOut ? 'Gold trial activated!' : 'Discount applied!',
          expiresAt: expiresAtOut,
          trialDays: trialDaysOut
        });

      } catch (error: any) {
        req.log.error(error, `Failed to redeem code ${code} for user ${uid}`);
        const clientErrors = ['code_not_found', 'code_inactive', 'already_referred', 'cannot_redeem_own_code'];
        if (clientErrors.includes(error.message)) {
          return reply.code(400).send({ error: error.message });
        }
        return reply.code(500).send({ error: 'internal_server_error' });
      }
    }
  );
}
