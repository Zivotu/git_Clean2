"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import {
  getJwt,
  setInitialJwt,
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

type BuildAssetConfig = {
  baseHref: string
  entry: string
  integrity?: string
  relaxedCsp: boolean
}

function createNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    if (typeof btoa === 'function') {
      let binary = ''
      bytes.forEach((b) => {
        binary += String.fromCharCode(b)
      })
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return Math.random().toString(36).slice(2)
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeEntry(entry: string): string {
  const trimmed = entry.trim()
  if (!trimmed) return 'app.bundle.js'
  return trimmed.replace(/^\.\//, '')
}

async function assetExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'follow' })
    if (head.ok) return true
    if (head.status === 405 || head.status === 501) {
      const probe = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' })
      return probe.ok
    }
  } catch {}
  return false
}

async function resolveBuildAsset(appId: string): Promise<BuildAssetConfig> {
  const encodedId = encodeURIComponent(appId)
  const buildBase = ensureTrailingSlash(`${APPS_HOST}/${encodedId}/build`)

  try {
    const manifestRes = await fetch(`${buildBase}manifest_v1.json`, { cache: 'no-store', redirect: 'follow' })
    if (manifestRes.ok) {
      const manifest = await manifestRes.json()
      const entryRaw = typeof manifest.entry === 'string' ? manifest.entry : ''
      const normalized = normalizeEntry(entryRaw)
      const entry = normalized || 'app.bundle.js'
      const assetUrl = `${buildBase}${entry}`
      const exists = await assetExists(assetUrl)
      if (exists) {
        const isLegacy = /app\.js$/i.test(entry)
        return {
          baseHref: buildBase,
          entry,
          integrity: !isLegacy && typeof manifest.integrity === 'string' ? manifest.integrity : undefined,
          relaxedCsp: isLegacy,
        }
      }
    }
  } catch {}

  const fallbacks = [
    { baseHref: buildBase, entry: 'app.js' },
    { baseHref: ensureTrailingSlash(`${APPS_HOST}/${encodedId}`), entry: 'app.js' },
  ]

  for (const candidate of fallbacks) {
    try {
      if (await assetExists(`${candidate.baseHref}${candidate.entry}`)) {
        return {
          baseHref: candidate.baseHref,
          entry: candidate.entry,
          relaxedCsp: true,
        }
      }
    } catch {}
  }

  return {
    baseHref: buildBase,
    entry: 'app.js',
    relaxedCsp: true,
  }
}

function buildSrcDoc(asset: BuildAssetConfig): string {
  const baseHref = ensureTrailingSlash(asset.baseHref)
  const escapedBase = escapeAttribute(baseHref)
  const entry = asset.entry.replace(/^\.\//, '')
  const appScriptUrl = new URL(entry, baseHref)
  const appOrigin = appScriptUrl.origin
  const parentOrigin = (() => {
    if (typeof window === 'undefined') return ''
    try {
      return new URL(window.location.href).origin
    } catch {
      return window.location.origin || ''
    }
  })()
  const shimUrl = (() => {
    if (typeof window === 'undefined') return '/shim.js'
    try {
      return new URL('/shim.js', window.location.href).toString()
    } catch {
      return '/shim.js'
    }
  })()
  const scriptSrc = escapeAttribute(appScriptUrl.toString())
  const escapedParentOrigin = escapeAttribute(parentOrigin || '')
  const escapedAppOrigin = escapeAttribute(appOrigin || '')
  const escapedShimSrc = escapeAttribute(shimUrl)

  const scriptSources: string[] = ["'self'"]
  if (appOrigin) {
    scriptSources.push(escapedAppOrigin)
  }
  if (parentOrigin) {
    scriptSources.push(escapedParentOrigin)
  }

  if (asset.relaxedCsp) {
    scriptSources.push("'unsafe-inline'", "'unsafe-eval'", 'https:')
  }

  const styleNonce = createNonce()
  const styleSources: string[] = ["'self'", `'nonce-${styleNonce}'`]
  if (appOrigin) {
    styleSources.push(escapedAppOrigin)
  }
  if (parentOrigin) {
    styleSources.push(escapedParentOrigin)
  }
  if (asset.relaxedCsp) {
    if (!styleSources.includes("'unsafe-inline'")) {
      styleSources.push("'unsafe-inline'")
    }
    styleSources.push('https:')
  }

  const imgSources = asset.relaxedCsp
    ? ["'self'", 'data:', 'blob:', 'https:']
    : ["'self'", 'data:', 'https:']
  const fontSources = ["'self'", 'data:']
  const mediaSources = asset.relaxedCsp
    ? ["'self'", 'blob:', 'https:']
    : ["'self'", 'blob:']
  const connectSources = asset.relaxedCsp
    ? Array.from(new Set(["'self'", 'https:', escapedAppOrigin].filter(Boolean)))
    : ["'none'"]

  const directives = [
    "default-src 'none'",
    `script-src ${Array.from(new Set(scriptSources)).join(' ')}`,
    `style-src ${Array.from(new Set(styleSources)).join(' ')}`,
    `img-src ${imgSources.join(' ')}`,
    `font-src ${fontSources.join(' ')}`,
    `media-src ${mediaSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    "frame-src 'none'",
    `base-uri 'self'${appOrigin ? ` ${escapedAppOrigin}` : ''}`,
    "object-src 'none'",
  ]

  const csp = escapeAttribute(directives.join('; '))

  const attrs = [`type="module"`, `src="${scriptSrc}"`]
  if (!asset.relaxedCsp && asset.integrity) {
    const integrity = escapeAttribute(asset.integrity)
    attrs.push(`integrity="${integrity}"`, 'crossorigin="anonymous"')
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<base href="${escapedBase}">`,
    `<style nonce="${escapeAttribute(styleNonce)}">html,body{margin:0;padding:0;height:100%;background:#000;color:#fff;}#root{min-height:100%;}</style>`,
    `<script defer src="${escapedShimSrc}"></scr` + 'ipt>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script ${attrs.join(' ')}></scr` + 'ipt>',
    '</body>',
    '</html>',
  ].join('')
}

function createCapability(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function PlayPageClient({ appId }: { appId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const capRef = useRef<string | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const storageVersionRef = useRef<string>('0')
  const snapshotRef = useRef<Record<string, unknown>>({})
  const namespaceRef = useRef<string>('')
  const jwtRef = useRef<string | null>(null)

  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  const [bootstrap, setBootstrap] = useState<SnapshotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const appNamespace = useMemo(() => makeNamespace(appId, undefined), [appId])

  const ensureJwt = useCallback(async () => {
    if (jwtRef.current) return jwtRef.current
    const jwt = await getJwt()
    jwtRef.current = jwt
    return jwt
  }, [])

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
          await setInitialJwt(token)
        }

        const assetPromise = resolveBuildAsset(appId)
        const jwt = token ?? (await getJwt())
        jwtRef.current = jwt
        await setInitialJwt(jwt)
        namespaceRef.current = appNamespace

        const { snapshot, version } = await fetchSnapshot(jwt, appNamespace)
        const asset = await assetPromise
        if (cancelled) return

        storageVersionRef.current = version || '0'
        snapshotRef.current = snapshot || {}

        setBootstrap({ snapshot: snapshot || {}, version: version || '0' })
        setSrcDoc(buildSrcDoc(asset))
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
  }, [appId, appNamespace])

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
            cap,
          })

          // Ensure our own iframe stays in sync as well.
          frame.postMessage(
            {
              type: 'thesara:storage:sync',
              snapshot: finalSnapshot,
              version: storageVersionRef.current,
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
              snapshotRef.current = latest.snapshot || {}
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
    return <div className="p-6">Loading app…</div>
  }

  if (error) {
    return <div className="p-6">Error: {error}</div>
  }

  if (!srcDoc) {
    return <div className="p-6">Preparing app bootstrap…</div>
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  )
}
