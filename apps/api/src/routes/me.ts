import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireRole } from '../middleware/auth.js'
import { db, listEntitlements, readApps } from '../db.js'
import type { Entitlement } from '../entitlements/service.js'
import type { AppRecord } from '../types.js'
import { sendTemplateToUser } from '../notifier.js'
import { getConfig } from '../config.js'
import { readTermsStatus, recordTermsAcceptance } from '../lib/terms.js'

type EntitlementSummary = {
  entitlements: Entitlement[]
  gold: boolean
  noAds: boolean
  purchases: string[]
  appIds: Set<string>
  creatorIds: Set<string>
}

const config = getConfig()

function toStringId(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined
  }
  return undefined
}

function parseExpiry(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isEntitlementActive(ent: Entitlement, now: number): boolean {
  if ((ent as any)?.active === false) return false
  const data = (ent as any)?.data ?? {}
  const expiryCandidates = [
    parseExpiry((data as any).expiresAt),
    parseExpiry((data as any).currentPeriodEnd),
    parseExpiry((ent as any).expiresAt),
  ].filter((x): x is number => typeof x === 'number')
  if (!expiryCandidates.length) return true
  const expiry = Math.max(...expiryCandidates)
  return expiry > now
}

function normalizeLang(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const norm = value.trim().toLowerCase()
  if (!norm) return undefined
  return norm.slice(0, 2)
}

function localizeApp(record: AppRecord, lang?: string): AppRecord {
  if (!lang) return record
  const translations = (record as any).translations as
    | Record<string, { title?: string; description?: string }>
    | undefined
  if (!translations) return record
  const tr = translations[lang]
  if (!tr) return record
  const next: AppRecord = {
    ...record,
    title: tr.title ?? record.title,
    description: tr.description ?? record.description,
  }
  return next
}

async function buildEntitlementSummary(uid: string): Promise<EntitlementSummary> {
  const raw = await listEntitlements(uid)
  const now = Date.now()
  const gold = raw.some((ent) => ent.feature === 'isGold' && isEntitlementActive(ent as any, now))
  const noAds = raw.some((ent) => ent.feature === 'noAds' && isEntitlementActive(ent as any, now))

  const purchases = new Set<string>()
  const appIds = new Set<string>()
  const creatorIds = new Set<string>()
  const entitlements: Entitlement[] = []

  for (const ent of raw) {
    if (!isEntitlementActive(ent as any, now)) continue
    entitlements.push(ent)
    const data = (ent as any)?.data ?? {}

    switch (ent.feature) {
      case 'app-subscription': {
        purchases.add('app-subscription')
        const appId = toStringId((data as any).appId)
        if (appId) {
          appIds.add(appId)
          purchases.add(appId)
          purchases.add(`app-subscription:${appId}`)
        }
        break
      }
      case 'creator-all-access': {
        purchases.add('creator-all-access')
        const creatorId = toStringId((data as any).creatorId)
        if (creatorId) {
          creatorIds.add(creatorId)
          purchases.add(`creator-all-access:${creatorId}`)
        }
        break
      }
      case 'purchase': {
        const listingId = toStringId((data as any).listingId)
        if (listingId) {
          appIds.add(listingId)
          purchases.add(listingId)
          purchases.add(`purchase:${listingId}`)
        }
        break
      }
      case 'app-trial': {
        purchases.add('app-trial')
        const trialAppId = toStringId((data as any).appId ?? (data as any).listingId)
        if (trialAppId) {
          appIds.add(trialAppId)
          purchases.add(`app-trial:${trialAppId}`)
        }
        break
      }
      default: {
        break
      }
    }
  }

  return {
    entitlements,
    gold,
    noAds,
    purchases: [...purchases],
    appIds,
    creatorIds,
  }
}

function matchesAppTarget(app: AppRecord, targets: Set<string>): boolean {
  if (!targets.size) return false
  const id = toStringId((app as any).id)
  if (id && targets.has(id)) return true
  const slug = toStringId(app.slug)
  if (slug && targets.has(slug)) return true
  const legacyId = toStringId((app as any).listingId)
  if (legacyId && targets.has(legacyId)) return true
  return false
}

function matchesCreator(app: AppRecord, creatorTargets: Set<string>): boolean {
  if (!creatorTargets.size) return false
  const authorUid = toStringId(app.author?.uid) ?? toStringId((app as any).ownerUid)
  return authorUid ? creatorTargets.has(authorUid) : false
}

function countUserApps(apps: AppRecord[], uid: string): number {
  return apps.filter((app) => {
    const owner =
      toStringId(app.author?.uid) ??
      toStringId((app as any).ownerUid) ??
      toStringId((app as any).authorUid)
    if (!owner || owner !== uid) return false
    if ((app as any).deletedAt) return false
    const state = (app as any).state
    if (state === 'inactive' || state === 'quarantined') return false
    return true
  }).length
}

function sumStorageUsageMb(apps: AppRecord[], uid: string): number {
  let total = 0
  for (const app of apps) {
    const owner =
      toStringId(app.author?.uid) ??
      toStringId((app as any).ownerUid) ??
      toStringId((app as any).authorUid)
    if (!owner || owner !== uid) continue

    const candidates = [
      (app as any)?.storageUsageMb,
      (app as any)?.storageUsage,
      (app as any)?.metrics?.storageUsageMb,
      (app as any)?.metrics?.storageUsage,
      (app as any)?.usage?.storageMb,
    ]
    for (const raw of candidates) {
      const value = Number(raw)
      if (Number.isFinite(value) && value > 0) {
        total += value
        break
      }
    }
  }
  return Math.max(0, Math.round(total * 100) / 100)
}

export default async function meRoutes(app: FastifyInstance) {
  const secureGet = (
    url: string,
    handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  ) => {
    app.get(url, { preHandler: requireRole(['user', 'admin']) }, handler)
  }

  const usageHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    try {
      const summary = await buildEntitlementSummary(uid)
      const apps = await readApps()
      const plan = summary.gold ? 'Gold' : 'Free'
      const appsUsed = countUserApps(apps as AppRecord[], uid)
      const appLimit = summary.gold
        ? config.GOLD_MAX_APPS_PER_USER
        : config.MAX_APPS_PER_USER
      const storageLimit = summary.gold
        ? config.GOLD_MAX_STORAGE_MB_PER_USER
        : config.MAX_STORAGE_MB_PER_USER
      const storageUsed = sumStorageUsageMb(apps as AppRecord[], uid)

      return reply.send({
        plan,
        apps: { used: appsUsed, limit: appLimit },
        storage: { used: storageUsed, limit: storageLimit },
      })
    } catch (err) {
      req.log.error({ err, uid }, 'me_usage_failed')
      return reply.code(500).send({ error: 'failed_to_load_usage' })
    }
  }

  for (const prefix of ['', '/api']) {
    secureGet(`${prefix}/me/usage`, usageHandler)
  }

  const entitlementsFullHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    try {
      const raw = await listEntitlements(uid)
      return reply.send({ items: raw })
    } catch (err) {
      req.log.error({ err, uid }, 'me_entitlements_full_failed')
      return reply.code(500).send({ error: 'failed_to_load_entitlements' })
    }
  }

  for (const prefix of ['', '/api']) {
    secureGet(`${prefix}/me/entitlements-full`, entitlementsFullHandler)
  }

  const entitlementsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    try {
        const summary = await buildEntitlementSummary(uid)
        return reply.send({
          gold: summary.gold,
          noAds: summary.noAds,
          purchases: summary.purchases,
          entitlements: summary.entitlements,
        })
    } catch (err) {
      req.log.error({ err, uid }, 'me_entitlements_failed')
      return reply.code(500).send({ error: 'failed_to_load_entitlements' })
    }
  }

  for (const prefix of ['', '/api']) {
    secureGet(`${prefix}/me/entitlements`, entitlementsHandler)
  }

  const subscribedHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    try {
        const summary = await buildEntitlementSummary(uid)
        if (!summary.appIds.size && !summary.creatorIds.size) {
          return reply.send({ items: [], count: 0, total: 0 })
        }

        const lang = normalizeLang((req.query as any)?.lang)
        const apps = await readApps()
        const items: AppRecord[] = []
        const seen = new Set<string>()

        for (const item of apps) {
          if ((item as any).deletedAt) continue
          const isPublished =
            (item as any).status === 'published' || (item as any).state === 'active'
          if (!isPublished) continue

          const matches =
            matchesAppTarget(item, summary.appIds) || matchesCreator(item, summary.creatorIds)
          if (!matches) continue

          const key = toStringId((item as any).id) ?? item.slug ?? Math.random().toString(16)
          if (seen.has(key)) continue
          seen.add(key)
          items.push(localizeApp(item, lang))
        }

        return reply.send({ items, count: items.length, total: items.length })
    } catch (err) {
      req.log.error({ err, uid }, 'me_subscribed_apps_failed')
      return reply.code(500).send({ error: 'failed_to_load_subscribed_apps' })
    }
  }

  for (const prefix of ['', '/api']) {
    secureGet(`${prefix}/me/subscribed-apps`, subscribedHandler)
  }

  const termsGetHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    try {
      const status = await readTermsStatus(uid)
      return reply.send(status)
    } catch (err) {
      req.log.error({ err, uid }, 'me_terms_status_failed')
      return reply.code(500).send({ error: 'terms_status_failed' })
    }
  }

  const termsAcceptHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    const body = ((req.body as any) || {}) as Record<string, unknown>
    const source =
      typeof body.source === 'string' && body.source.trim()
        ? body.source.trim()
        : 'client'
    const metadataCandidate = body.metadata
    const metadata =
      metadataCandidate && typeof metadataCandidate === 'object' && !Array.isArray(metadataCandidate)
        ? (metadataCandidate as Record<string, unknown>)
        : undefined
    try {
      const status = await recordTermsAcceptance(uid, {
        source,
        metadata,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] as string | undefined,
      })
      return reply.send({ ok: true, status })
    } catch (err) {
      req.log.error({ err, uid }, 'me_terms_accept_failed')
      return reply.code(500).send({ ok: false, error: 'terms_accept_failed' })
    }
  }

  for (const prefix of ['', '/api']) {
    app.get(
      `${prefix}/me/terms`,
      { preHandler: requireRole('user') },
      termsGetHandler,
    )

    app.post(
      `${prefix}/me/terms/accept`,
      { preHandler: requireRole('user') },
      termsAcceptHandler,
    )
  }

  app.post(
    '/me/welcome-email',
    { preHandler: requireRole(['user']) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const uid = req.authUser?.uid
      if (!uid) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' })
      }

      const body = (req.body as any) || {}
      const explicitEmail = typeof body.email === 'string' ? body.email : undefined
      const displayName = typeof body.displayName === 'string' ? body.displayName : undefined

      try {
        const userRef = db.collection('users').doc(uid)
        const snap = await userRef.get()
        if (!snap.exists) {
          return reply.code(404).send({ ok: false, error: 'user_not_found' })
        }

        const data = (snap.data() as any) || {}
        const alreadySent =
          Boolean(data?.emails?.welcome?.sentAt) || Boolean(data?.welcomeEmailSentAt)
        if (alreadySent) {
          return reply.send({ ok: true, sent: false })
        }

        const subject = 'Dobrodošli u Thesaru'
        const lines = [
          displayName ? `Bok ${displayName},` : 'Bok,',
          '',
          'Dobrodošli u Thesaru! Spremni smo pomoći vam u stvaranju i objavi vaših aplikacija.',
          '',
          'Ako trebate pomoć, javite nam se na welcome@thesara.space.',
          '',
          'THESARA tim',
        ]

        await sendTemplateToUser('welcome', uid, {
          displayName: displayName ?? data?.displayName,
          supportEmail: 'welcome@thesara.space',
          // ensure email override if provided
          email: explicitEmail ?? data?.email,
        })

        const now = Date.now()
        await userRef.set(
          {
            emails: {
              welcome: {
                sentAt: now,
              },
            },
            welcomeEmailSentAt: now,
          },
          { merge: true },
        )

        return reply.send({ ok: true, sent: true })
      } catch (err) {
        req.log.error({ err, uid }, 'welcome_email_failed')
        return reply.code(500).send({ ok: false, error: 'welcome_email_failed' })
      }
    },
  )
}
