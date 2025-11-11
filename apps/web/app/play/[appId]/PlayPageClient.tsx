'use client'

import { Buffer } from 'buffer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/api'
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

function notifyPlay(slugOrId?: string) {
  if (!slugOrId) return
  const encoded = encodeURIComponent(slugOrId)
  void apiFetch(`/listing/${encoded}/play`, { method: 'POST' }).catch(() => {
    // fire-and-forget
  })
}

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

type RoomSession = {
  namespace: string
  token: string | null
  room: {
    id: string
    name: string
    isDemo?: boolean
  }
}

function buildIframeSrc(appId: string): string {
  const base = (APPS_HOST || '').replace(/\/$/, '')
  const encodedId = encodeURIComponent(appId)
  if (!base) {
    return `/${encodedId}/build/`
  }
  return `${base}/${encodedId}/build/`
}

function withToken(
  url: string,
  token: string | null,
  extraParams?: Record<string, string>,
): string {
  try {
    const [base, rawQuery = ''] = url.split('?')
    const params = new URLSearchParams(rawQuery)
    if (token) params.set('token', token)
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value != null) params.set(key, value)
      }
    }
    const query = params.toString()
    return query ? `${base}?${query}` : base
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    const parts: string[] = []
    if (token) parts.push(`token=${encodeURIComponent(token)}`)
    if (extraParams && Object.keys(extraParams).length) {
      parts.push(new URLSearchParams(extraParams).toString())
    }
    return parts.length ? `${url}${separator}${parts.join('&')}` : url
  }
}

function createCapability(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const ROOMS_ENDPOINTS = {
  demo: '/api/rooms/storage/demo',
  create: '/api/rooms/storage/create',
  join: '/api/rooms/storage/join',
} as const

function encodeBootstrapPayload(payload: SnapshotState | null): string | null {
  if (!payload) return null
  try {
    const data = JSON.stringify(payload)
    return Buffer.from(data, 'utf-8').toString('base64')
  } catch (err) {
    console.warn('[Play] Failed to encode bootstrap payload', err)
    return null
  }
}

type RoomsApiResponse = {
  ok?: boolean
  namespace?: string
  token?: string | null
  room?: { id: string; name: string; isDemo?: boolean }
  pin?: string
  error?: string
  message?: string
}

async function requestRoomSession(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<RoomSession> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  let json: RoomsApiResponse | null = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok || !json?.namespace || !json?.room) {
    const message = json?.message || json?.error || `Rooms request failed (${endpoint})`
    throw new ApiError(res.status, message, json?.error)
  }
  return {
    namespace: json.namespace,
    token: json.token || null,
    room: json.room,
  }
}

import type { AppRecord, RoomsMode } from '@/lib/types';

export default function PlayPageClient({ app }: { app: AppRecord }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const capRef = useRef<string | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const storageVersionRef = useRef<string>('0')
  const snapshotRef = useRef<Record<string, unknown>>({})
  const namespaceRef = useRef<string>('')
  const jwtRef = useRef<string | null>(null)
  const roomTokenRef = useRef<string | null>(null)

  const [bootstrap, setBootstrap] = useState<SnapshotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roomSession, setRoomSession] = useState<RoomSession | null>(null)
  const [roomsBusy, setRoomsBusy] = useState(false)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [autoDemoRequested, setAutoDemoRequested] = useState(false)

  useEffect(() => {
    notifyPlay(app.slug || app.id)
  }, [app.slug, app.id])

  const { id: appId, buildId, securityPolicy } = app;
  const { showAds } = useAds()
  const topAdSlot = (AD_SLOT_IDS.playTop || '').trim()
  const bottomAdSlot = (AD_SLOT_IDS.playBottom || '').trim()
  const showTopAd = showAds && topAdSlot.length > 0
  const showBottomAd = showAds && bottomAdSlot.length > 0

  const GLOBAL_ROOMS_ENABLED = process.env.NEXT_PUBLIC_ROOMS_ENABLED !== 'false'
  const rawRoomsMode = app.capabilities?.storage?.roomsMode as RoomsMode | undefined
  const inferredMode: RoomsMode =
    rawRoomsMode === 'optional' || rawRoomsMode === 'required'
      ? rawRoomsMode
      : GLOBAL_ROOMS_ENABLED
        ? 'optional'
        : 'off'
  const roomsMode: RoomsMode =
    inferredMode === 'optional' || inferredMode === 'required' ? inferredMode : 'off'
  const roomsEnabled = roomsMode !== 'off'
  const baseNamespace = useMemo(() => makeNamespace(appId), [appId])
  const activeNamespace = roomSession?.namespace ?? baseNamespace
  const roomsReady = !roomsEnabled || Boolean(roomSession)
  const waitingForRoom = roomsEnabled && !roomSession
  
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
    const flags = ['allow-scripts', 'allow-forms', 'allow-same-origin', 'allow-downloads'];
    if (securityPolicy?.sandbox?.allowModals) {
      flags.push('allow-modals');
    }
    return flags.join(' ');
  }, [securityPolicy]);

  const updateIframeSrc = useCallback(
    (token: string | null, namespace: string, roomToken?: string | null) => {
      const params: Record<string, string> = { ns: namespace };
      if (roomToken) {
        params.roomToken = roomToken;
      }
      setIframeUrl(withToken(baseIframeSrc, token, params));
    },
    [baseIframeSrc],
  );

  const ensureJwt = useCallback(async () => {
    if (jwtRef.current) return jwtRef.current
    const jwt = await getJwt()
    jwtRef.current = jwt
    return jwt
  }, [])

  useEffect(() => {
    namespaceRef.current = activeNamespace
  }, [activeNamespace])

  useEffect(() => {
    roomTokenRef.current = roomSession?.token ?? null
  }, [roomSession])

  useEffect(() => {
    if (!roomsReady || !SHIM_ENABLED) return
    if (jwtRef.current) {
      updateIframeSrc(jwtRef.current, activeNamespace, roomTokenRef.current)
    }
  }, [roomsReady, activeNamespace, roomSession?.token, updateIframeSrc])

  useEffect(() => {
    setRoomSession(null)
    setRoomsError(null)
    setAutoDemoRequested(false)
  }, [appId])

  const performRoomAction = useCallback(
    async (
      action: 'demo' | 'create' | 'join',
      params?: { roomName?: string; pin?: string },
    ) => {
      setRoomsBusy(true)
      setRoomsError(null)
      try {
        let session: RoomSession
        if (action === 'demo') {
          session = await requestRoomSession(ROOMS_ENDPOINTS.demo, { appId })
        } else if (action === 'create') {
          session = await requestRoomSession(ROOMS_ENDPOINTS.create, {
            appId,
            roomName: params?.roomName,
            pin: params?.pin,
          })
        } else {
          session = await requestRoomSession(ROOMS_ENDPOINTS.join, {
            appId,
            roomName: params?.roomName,
            pin: params?.pin,
          })
        }
        setRoomSession(session)
        return session
      } catch (err: any) {
        console.error('[Rooms] action failed', err)
        setRoomsError(err?.message || 'Rad sa sobom je trenutno onemogućen.')
        throw err
      } finally {
        setRoomsBusy(false)
      }
    },
    [appId],
  )

  const handleUseDemo = useCallback(async () => {
    await performRoomAction('demo')
  }, [performRoomAction])

  const handleCreateRoom = useCallback(
    async (roomName: string, pin: string) => {
      const trimmedName = roomName.trim()
      const safePin = pin.trim()
      if (!trimmedName || !safePin) {
        setRoomsError('Unesi naziv sobe i PIN.')
        return
      }
      await performRoomAction('create', { roomName: trimmedName, pin: safePin })
    },
    [performRoomAction],
  )

  const handleJoinRoom = useCallback(
    async (roomName: string, pin: string) => {
      const trimmedName = roomName.trim()
      const safePin = pin.trim()
      if (!trimmedName || !safePin) {
        setRoomsError('Unesi naziv sobe i PIN.')
        return
      }
      await performRoomAction('join', { roomName: trimmedName, pin: safePin })
    },
    [performRoomAction],
  )

  useEffect(() => {
    if (!roomsEnabled) return
    if (autoDemoRequested) return
    setAutoDemoRequested(true)
    void handleUseDemo()
  }, [roomsEnabled, autoDemoRequested, handleUseDemo])

  useEffect(() => {
    if (!SHIM_ENABLED) {
      setLoading(false)
      return
    }
    if (!roomsReady) return

    let cancelled = false

    async function bootstrapStorage() {
      setLoading(true)
      setError(null)
      namespaceRef.current = activeNamespace
      storageVersionRef.current = '0'
      snapshotRef.current = {}
      try {
        let token: string | null = null
        if (typeof window !== 'undefined') {
          const searchParams = new URLSearchParams(window.location.search)
          token = searchParams.get('token')
          if (token) {
            jwtRef.current = token
            updateIframeSrc(token, activeNamespace, roomTokenRef.current)
          }
        }

        const jwt = token ?? (await ensureJwt())
        if (!token) {
          updateIframeSrc(jwt, activeNamespace, roomTokenRef.current)
        }
        const { snapshot, version } = await fetchSnapshot(
          jwt,
          activeNamespace,
          roomTokenRef.current,
        )
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
  }, [activeNamespace, ensureJwt, roomsReady, updateIframeSrc, roomSession?.token])

  useEffect(() => {
    if (!bootstrap) return
    const channel = new BroadcastChannel(`thesara-storage-${activeNamespace}`)
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
            roomToken: roomTokenRef.current,
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
  }, [activeNamespace, bootstrap])

  const projectSnapshot = useCallback(
    (batch: BatchItem[]) => applyBatchOperations(snapshotRef.current, batch),
    [],
  )

  const handleFlush = useCallback(
    async (batch: ShimBatchItem[]) => {
      if (!batch || batch.length === 0) return

      const ns = namespaceRef.current || activeNamespace
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
          const roomToken = roomTokenRef.current
          const { newVersion, newSnapshot } = await patchStorage(
            jwt,
            ns,
            storageVersionRef.current,
            serverBatch,
            roomToken,
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
            roomToken,
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
              roomToken,
            },
            '*',
          )
          return
        } catch (err: any) {
          lastError = err
          if (err instanceof ApiError || err?.status === 412) {
            try {
              const jwt = await ensureJwt()
              const latest = await fetchSnapshot(jwt, ns, roomTokenRef.current)
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
    [activeNamespace, ensureJwt, projectSnapshot],
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
            roomToken: roomTokenRef.current,
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

  const roomsControl = roomsEnabled ? (
    <RoomsToolbar
      mode={roomsMode}
      session={roomSession}
      loading={roomsBusy}
      error={roomsError}
      onUseDemo={handleUseDemo}
      onCreate={handleCreateRoom}
      onJoin={handleJoinRoom}
      variant={roomSession ? 'compact' : 'full'}
    />
  ) : null

  const iframeBootstrapName = useMemo(() => {
    const encoded = encodeBootstrapPayload(bootstrap)
    return encoded ? `thesara-bootstrap:${encoded}` : undefined
  }, [bootstrap])

  if (!SHIM_ENABLED) {
    return <div className="p-6">App storage is temporarily unavailable.</div>
  }

  if (waitingForRoom) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        {roomsControl}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {roomsError
            ? roomsError
            : 'Odaberi demo sobu ili unesi vlastiti naziv i PIN kako bi nastavio/la s aplikacijom.'}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        {roomsControl}
        <div>Loading app...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-6">
        {roomsControl}
        <div>Error: {error}</div>
      </div>
    )
  }

  if (!bootstrap) {
    return (
      <div className="flex flex-col gap-4 p-6">
        {roomsControl}
        <div>Preparing app bootstrap...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {roomsControl}
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        title="Thesara App"
        name={iframeBootstrapName}
        referrerPolicy="no-referrer"
        sandbox={sandboxFlags}
        style={{ border: 'none', width: '100%', height: '100vh', display: 'block' }}
      />
    </div>
  )
}

function RoomsToolbar({
  mode,
  session,
  loading,
  error,
  onUseDemo,
  onCreate,
  onJoin,
  variant = 'compact',
}: {
  mode: RoomsMode
  session: RoomSession | null
  loading: boolean
  error: string | null
  onUseDemo: () => void | Promise<void>
  onCreate: (roomName: string, pin: string) => void | Promise<void>
  onJoin: (roomName: string, pin: string) => void | Promise<void>
  variant?: 'compact' | 'full'
}) {
  const [roomName, setRoomName] = useState('')
  const [pin, setPin] = useState('')

  const handleCreate = () => void onCreate(roomName, pin)
  const handleJoin = () => void onJoin(roomName, pin)

  const isDemo = session?.room?.isDemo ?? true

  const containerClasses =
    variant === 'full'
      ? 'rounded-3xl border border-slate-200 bg-slate-900 text-white shadow-lg'
      : 'rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-sm'

  return (
    <div className={containerClasses}>
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Aktivna soba</p>
          <p className="text-lg font-semibold">
            {session?.room?.name || 'Javna demo soba (PIN 1111)'}
          </p>
          <p className="text-xs text-slate-300">
            {variant === 'full'
              ? isDemo
                ? 'Ova demo soba je javna i služi upoznavanju aplikacije. Za privatnu pohranu kreiraj vlastitu sobu i PIN.'
                : 'Soba koju si odabrao/la ima vlastitu pohranu i dostupna je svima koji znaju naziv i PIN.'
              : isDemo
                ? 'Demo soba je javna i služi testiranju. Svi korisnici dijele iste podatke.'
                : 'Ova soba ima vlastitu pohranu koju dijele samo članovi s istim PIN-om.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
          onClick={() => void onUseDemo()}
          disabled={loading}
        >
          Vrati se u demo (PIN 1111)
        </button>
      </div>

      <div className="border-t border-white/10 p-4">
        {mode === 'required' && (
          <p className="text-xs text-emerald-200">
            Za trajnu i privatnu pohranu kreiraj svoju sobu s PIN-om.
          </p>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-[2fr,1fr]">
          <div className="flex flex-col gap-2">
            <input
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              placeholder="Naziv sobe (npr. Shopping tim)"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              disabled={loading}
            />
            <input
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              placeholder="PIN (4-8 znamenki)"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              inputMode="numeric"
              maxLength={8}
              disabled={loading}
            />
            {error && <p className="text-xs text-rose-300">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              onClick={handleCreate}
              disabled={loading}
            >
              Kreiraj novu sobu
            </button>
            <button
              type="button"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
              onClick={handleJoin}
              disabled={loading}
            >
              Pridruži se postojećoj sobi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
