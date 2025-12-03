export type RawEntitlement = {
  id?: string
  userId?: string
  feature?: string
  active?: boolean
  data?: Record<string, any>
  expiresAt?: string | number | null
  [key: string]: any
}

export type EarlyAccessState = {
  campaignId: string
  startedAt: number
  expiresAt: number
  subscribedAt?: number
}

export type EntitlementSummary = {
  gold: boolean
  noAds: boolean
  purchases: string[]
  entitlements: RawEntitlement[]
  earlyAccess?: EarlyAccessState | null
}

function toStringId(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function parseExpiry(raw: unknown): number | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isActive(ent: RawEntitlement, now: number): boolean {
  if (ent && ent.active === false) return false
  const data = (ent && ent.data) || {}
  const expiries: Array<number | undefined> = [
    parseExpiry(ent?.expiresAt),
    parseExpiry((data as any)?.expiresAt),
    parseExpiry((data as any)?.currentPeriodEnd),
  ]
  const valid = expiries.filter((value): value is number => typeof value === 'number')
  if (!valid.length) return true
  const expiry = Math.max(...valid)
  return expiry > now
}

function normalizeEarlyAccess(input: unknown): EarlyAccessState | undefined {
  if (!input || typeof input !== 'object') return undefined
  const obj = input as Record<string, any>
  const campaignId =
    typeof obj.campaignId === 'string' && obj.campaignId.trim() ? obj.campaignId.trim() : undefined
  if (!campaignId) return undefined
  const startedAt =
    typeof obj.startedAt === 'number' && Number.isFinite(obj.startedAt) ? obj.startedAt : undefined
  const expiresAt =
    typeof obj.expiresAt === 'number' && Number.isFinite(obj.expiresAt) ? obj.expiresAt : undefined
  if (!startedAt || !expiresAt) return undefined
  const subscribedAt =
    typeof obj.subscribedAt === 'number' && Number.isFinite(obj.subscribedAt)
      ? obj.subscribedAt
      : undefined
  return { campaignId, startedAt, expiresAt, subscribedAt }
}

export function summarizeEntitlementArray(list: RawEntitlement[]): EntitlementSummary {
  const now = Date.now()
  const purchases = new Set<string>()
  const entitlements: RawEntitlement[] = []
  let gold = false
  let noAds = false

  for (const raw of list || []) {
    if (!raw || typeof raw !== 'object') continue
    if (!isActive(raw, now)) continue
    entitlements.push(raw)
    const feature = String((raw as any).feature ?? '')
    const data = (raw as any).data ?? {}

    switch (feature) {
      case 'isGold':
        gold = true
        break
      case 'noAds':
        noAds = true
        break
      case 'app-subscription': {
        purchases.add('app-subscription')
        const appId = toStringId((data as any).appId)
        if (appId) {
          purchases.add(appId)
          purchases.add(`app-subscription:${appId}`)
        }
        break
      }
      case 'creator-all-access': {
        purchases.add('creator-all-access')
        const creatorId = toStringId((data as any).creatorId)
        if (creatorId) {
          purchases.add(`creator-all-access:${creatorId}`)
        }
        break
      }
      case 'purchase': {
        const listingId = toStringId((data as any).listingId)
        if (listingId) {
          purchases.add(listingId)
          purchases.add(`purchase:${listingId}`)
        }
        break
      }
      case 'app-trial': {
        purchases.add('app-trial')
        const trialId =
          toStringId((data as any).appId) ?? toStringId((data as any).listingId)
        if (trialId) {
          purchases.add(trialId)
          purchases.add(`app-trial:${trialId}`)
        }
        break
      }
      default:
        break
    }
  }

  return {
    gold,
    noAds,
    purchases: [...purchases],
    entitlements,
  }
}

export function summarizeEntitlementResponse(input: unknown): EntitlementSummary | null {
  if (Array.isArray(input)) {
    return summarizeEntitlementArray(input as RawEntitlement[])
  }
  if (!input || typeof input !== 'object') return null

  const obj = input as Record<string, any>
  const entList =
    Array.isArray(obj.entitlements) && obj.entitlements
      ? obj.entitlements
      : Array.isArray(obj.items) && obj.items
        ? obj.items
        : null

  const base = entList ? summarizeEntitlementArray(entList) : null
  const gold =
    typeof obj.gold === 'boolean'
      ? obj.gold
      : base
        ? base.gold
        : false
  const noAds =
    typeof obj.noAds === 'boolean'
      ? obj.noAds
      : base
        ? base.noAds
        : false

  const purchases = Array.isArray(obj.purchases)
    ? obj.purchases.map((value) => String(value))
    : base
      ? base.purchases
      : []

  const entitlements =
    entList && Array.isArray(entList)
      ? (entList as RawEntitlement[])
      : base
        ? base.entitlements
        : []

  const earlyAccess = normalizeEarlyAccess(obj.earlyAccess)

  return { gold, noAds, purchases, entitlements, earlyAccess }
}
