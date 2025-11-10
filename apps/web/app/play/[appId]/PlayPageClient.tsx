'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import AdSlot from '@/components/AdSlot'
import { useAds } from '@/components/AdsProvider'
import { AD_SLOT_IDS } from '@/config/ads'
import {
  getJwt,
  fetchSnapshot,
  patchStorage,
  makeNamespace,
  type BatchItem,
  applyBatchOperations,
} from '@/lib/storage/snapshot-loader'
const APPS_HOST =
  (process.env.NEXT_PUBLIC_APPS_HOST || 'https://apps.thesara.space').replace(/\/+$/, '')
const SHIM_ENABLED = process.env.NEXT_PUBLIC_SHIM_ENABLED !== 'false'

type SnapshotState = {
  snapshot: Record<string, unknown>
  version: string
}

type ShimBatchItem = {
  scope: 'local' | 'session'
  op: 'set' | 'del' | 'clear'
  key?: string
  value?: string
}

function buildIframeSrc(appId: string): string {
  const base = (APPS_HOST || '').replace(/\/$/, '')
  const encodedId = encodeURIComponent(appId)
  if (!base) {
    return `/${encodedId}/build/`
  }
  return `${base}/${encodedId}/build/`
}

function withToken(url: string, token: string | null): string {
  if (!token) return url
  try {
    const [base, rawQuery = ''] = url.split('?')
    const params = new URLSearchParams(rawQuery)
    params.set('token', token)
    const query = params.toString()
    return query ? `${base}?${query}` : base
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}token=${encodeURIComponent(token)}`
  }
}

function createCapability(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

import type { AppRecord } from '@/lib/types';

export default function PlayPageClient({ app }: { app: AppRecord }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const capRef = useRef<string | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const storageVersionRef = useRef<string>('0')
  const snapshotRef = useRef<Record<string, unknown>>({})
  const namespaceRef = useRef<string>('')
  const jwtRef = useRef<string | null>(null)

  const [bootstrap, setBootstrap] = useState<SnapshotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { id: appId, buildId, securityPolicy } = app;
  const { showAds } = useAds()
  const topAdSlot = (AD_SLOT_IDS.playTop || '').trim()
  const bottomAdSlot = (AD_SLOT_IDS.playBottom || '').trim()
  const showTopAd = showAds && topAdSlot.length > 0
  const showBottomAd = showAds && bottomAdSlot.length > 0

  const appNamespace = useMemo(() => makeNamespace(appId, undefined), [appId])
  
  // Use direct /builds/:buildId/build/ path instead of alias to get correct CSP headers
  const baseIframeSrc = useMemo(() => {
    if (!buildId) return buildIframeSrc(appId);
    const base = (APPS_HOST || '').replace(/\/$/, '');
    const encodedId = encodeURIComponent(buildId);
    if (!base) {
      return `/builds/${encodedId}/build/`;
    }
    return `${base}/builds/${encodedId}/build/`;
  }, [appId, buildId])
  // Delay setting iframe URL until we have token/snapshot to avoid first-load race
  const [iframeUrl, setIframeUrl] = useState<string>('')
  
  const sandboxFlags = useMemo(() => {
    const flags = ['allow-scripts', 'allow-forms', 'allow-same-origin'];
    if (securityPolicy?.sandbox?.allowModals) {
      flags.push('allow-modals');
    }
    return flags.join(' ');
  }, [securityPolicy]);

  const ensureJwt = useCallback(async () => {
    if (jwtRef.current) return jwtRef.current
    const jwt = await getJwt()
    jwtRef.current = jwt
    setIframeUrl((current) => withToken(baseIframeSrc, jwt))
    return jwt
  }, [baseIframeSrc])

  useEffect(() => {
    if (!SHIM_ENABLED) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function bootstrapStorage() {
      setLoading(true)
      setError(null)
      try {
        let token: string | null = null
        if (typeof window !== 'undefined') {
          const searchParams = new URLSearchParams(window.location.search)
          token = searchParams.get('token')
        }

        if (token) {
          jwtRef.current = token
          setIframeUrl(withToken(baseIframeSrc, token))
        }

        const jwt = token ?? (await getJwt())
        jwtRef.current = jwt
        setIframeUrl(withToken(baseIframeSrc, jwt))
        namespaceRef.current = appNamespace

        const { snapshot, version } = await fetchSnapshot(jwt, appNamespace)
        if (cancelled) return

        storageVersionRef.current = version || '0'
        snapshotRef.current = snapshot || {}

        setBootstrap({ snapshot: snapshot || {}, version: version || '0' })
      } catch (err: any) {
        if (cancelled) return
        console.error('[Play] bootstrap failed', err)
        setError(err?.message || 'Failed to load storage snapshot.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    bootstrapStorage()
    return () => {
      cancelled = true
    }
  }, [appId, appNamespace, baseIframeSrc])

  useEffect(() => {
    if (!bootstrap) return
    const channel = new BroadcastChannel(`thesara-storage-${appId}`)
    bcRef.current = channel

    const handleBroadcast = (event: MessageEvent) => {
      const msg = event.data
      if (!msg || typeof msg !== 'object') return
      if (msg.type !== 'thesara:storage:sync') return
      if (msg.cap && capRef.current && msg.cap === capRef.current) return

      storageVersionRef.current = msg.version || storageVersionRef.current
      snapshotRef.current = msg.snapshot || {}

      if (iframeRef.current?.contentWindow && capRef.current) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'thesara:storage:sync',
            snapshot: snapshotRef.current,
            version: storageVersionRef.current,
            cap: capRef.current,
          },
          '*',
        )
      }
    }

    channel.addEventListener('message', handleBroadcast)

    return () => {
      channel.removeEventListener('message', handleBroadcast)
      channel.close()
      if (bcRef.current === channel) bcRef.current = null
    }
  }, [appId, bootstrap])

  const projectSnapshot = useCallback(
    (batch: BatchItem[]) => applyBatchOperations(snapshotRef.current, batch),
    [],
  )

  const handleFlush = useCallback(
    async (batch: ShimBatchItem[]) => {
      if (!batch || batch.length === 0) return

      const ns = namespaceRef.current || appNamespace
      const frame = iframeRef.current?.contentWindow
      const cap = capRef.current
      if (!frame || !cap) return

      const localOps = batch.filter((item) => item.scope === 'local')
      if (localOps.length === 0) {
        frame.postMessage({ type: 'thesara:shim:ack', cap }, '*')
        return
      }

      const serverBatch: BatchItem[] = []
      for (const item of localOps) {
        if (item.op === 'set' && typeof item.key === 'string') {
          serverBatch.push({ op: 'set', key: item.key, value: item.value })
        } else if (item.op === 'del' && typeof item.key === 'string') {
          serverBatch.push({ op: 'del', key: item.key })
        } else if (item.op === 'clear') {
          serverBatch.push({ op: 'clear' })
        }
      }

      if (serverBatch.length === 0) {
        frame.postMessage({ type: 'thesara:shim:ack', cap }, '*')
        return
      }

      const maxAttempts = 3
      let attempts = 0
      let lastError: unknown

      while (attempts < maxAttempts) {
        attempts += 1
        try {
          const jwt = await ensureJwt()
          const { newVersion, newSnapshot } = await patchStorage(
            jwt,
            ns,
            storageVersionRef.current,
            serverBatch,
          )

          const finalSnapshot =
            newSnapshot ??
            projectSnapshot(serverBatch)

          storageVersionRef.current = newVersion || storageVersionRef.current
          snapshotRef.current = finalSnapshot

          frame.postMessage({ type: 'thesara:shim:ack', cap }, '*')

          bcRef.current?.postMessage({
            type: 'thesara:storage:sync',
            snapshot: finalSnapshot,
            version: storageVersionRef.current,
            namespace: namespaceRef.current,
            cap,
          })

          // Ensure our own iframe stays in sync as well.
          frame.postMessage(
            {
              type: 'thesara:storage:sync',
              snapshot: finalSnapshot,
              version: storageVersionRef.current,
              namespace: namespaceRef.current,
              token: jwtRef.current,
              cap,
            },
            '*',
          )
          return
        } catch (err: any) {
          lastError = err
          if (err instanceof ApiError || err?.status === 412) {
            try {
              const jwt = await ensureJwt()
              const latest = await fetchSnapshot(jwt, ns)
              storageVersionRef.current = latest.version || '0'
              // Re-project the pending changes onto the new snapshot
              snapshotRef.current = applyBatchOperations(latest.snapshot, serverBatch)
              continue
            } catch (refreshErr) {
              lastError = refreshErr
            }
          }
          break
        }
      }

      console.error('[Play] Failed to flush storage batch', lastError)
    },
    [appNamespace, ensureJwt, projectSnapshot],
  )

  const onMessage = useCallback(
    (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow
      if (!frame || event.source !== frame) return

      const msg = event.data
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'thesara:shim:ready') {
        const cap = createCapability()
        capRef.current = cap
        frame.postMessage(
          {
            type: 'thesara:storage:init',
            snapshot: snapshotRef.current,
            version: storageVersionRef.current,
            namespace: namespaceRef.current,
            token: jwtRef.current,
            cap,
          },
          '*',
        )
        return
      }

      if (!capRef.current || msg.cap !== capRef.current) {
        return
      }

      if (msg.type === 'thesara:storage:flush' && Array.isArray(msg.batch)) {
        const batch = (msg.batch as ShimBatchItem[]).filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item.scope === 'local' || item.scope === 'session') &&
            (item.op === 'set' || item.op === 'del' || item.op === 'clear'),
        )
        void handleFlush(batch)
      }
    },
    [handleFlush],
  )

  useEffect(() => {
    if (!SHIM_ENABLED) return
    window.addEventListener('message', onMessage)
    const frame = iframeRef.current

    const flushBeforeUnload = () => {
      if (frame?.contentWindow && capRef.current) {
        frame.contentWindow.postMessage(
          { type: 'thesara:storage:flush-now', cap: capRef.current },
          '*',
        )
      }
    }

    window.addEventListener('beforeunload', flushBeforeUnload)

    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('beforeunload', flushBeforeUnload)
      bcRef.current?.close()
      bcRef.current = null
    }
  }, [onMessage])

  if (!SHIM_ENABLED) {
    return <div className="p-6">App storage is temporarily unavailable.</div>
  }

  if (loading) {
    return <div className="p-6">Loading app...</div>
  }

  if (error) {
    return <div className="p-6">Error: {error}</div>
  }

  if (!bootstrap) {
    return <div className="p-6">Preparing app bootstrap...</div>
  }

  return (
    <iframe
      ref={iframeRef}
      src={iframeUrl}
      title="Thesara App"
      referrerPolicy="no-referrer"
      sandbox={sandboxFlags}
      style={{ border: 'none', width: '100%', height: '100vh', display: 'block' }}
    />
  )
}
