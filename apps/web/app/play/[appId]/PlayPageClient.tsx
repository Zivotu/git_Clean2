'use client'

import { Buffer } from 'buffer'
import { AnimatePresence, motion } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLInputTypeAttribute,
  type InputHTMLAttributes,
} from 'react'
import { ApiError, apiFetch } from '@/lib/api'
import AdSlot from '@/components/AdSlot'
import { useAds } from '@/components/AdsProvider'
import { AD_SLOT_IDS } from '@/config/ads'
import GameLoadingOverlay from '@/components/GameLoadingOverlay'
import FullScreenPrompt from '@/components/FullScreenPrompt'
import {
  getJwt,
  fetchSnapshot,
  patchStorage,
  makeNamespace,
  type BatchItem,
  applyBatchOperations,
} from '@/lib/storage/snapshot-loader'
import { useI18n } from '@/lib/i18n-provider'
const APPS_HOST =
  (process.env.NEXT_PUBLIC_APPS_HOST || 'https://apps.thesara.space').replace(/\/+$/, '')
const SHIM_ENABLED = process.env.NEXT_PUBLIC_SHIM_ENABLED !== 'false'
const MIN_FRAME_HEIGHT = 360
const PAGE_BOTTOM_PADDING_PX = 24
const VIEWPORT_FIT_OFFSET = 120

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

const ROOMS_MODE_VALUES: RoomsMode[] = ['off', 'optional', 'required'];

function normalizeRoomsMode(value: unknown): RoomsMode {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (ROOMS_MODE_VALUES.includes(normalized as RoomsMode)) {
      return normalized as RoomsMode;
    }
    if (['disabled', 'none'].includes(normalized)) {
      return 'off';
    }
    if (['enabled', 'on', 'true'].includes(normalized)) {
      return 'optional';
    }
  }
  return 'off';
}

export default function PlayPageClient({ app }: { app: AppRecord }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeContainerRef = useRef<HTMLDivElement>(null)
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

  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false)
  const [showFSPrompt, setShowFSPrompt] = useState(false)
  const [overlayVisible, setOverlayVisible] = useState(true)

  useEffect(() => {
    notifyPlay(app.slug || app.id)
  }, [app.slug, app.id])

  // Show overlay for 6s AFTER bootstrap is ready (iframe becomes available)
  // This covers: iframe render + shim load + ready signal + init + data sync
  useEffect(() => {
    if (!bootstrap) return

    setOverlayVisible(true)
    const timer = setTimeout(() => {
      setOverlayVisible(false)
    }, 6000)

    return () => clearTimeout(timer)
  }, [bootstrap])

  const { id: appId, buildId, securityPolicy } = app

  const redirectToLogin = useCallback(() => {
    if (typeof window === 'undefined') return
    const nextUrl =
      window.location.pathname + window.location.search + window.location.hash
    const fallback = `/play/${encodeURIComponent(appId)}/`
    const target =
      nextUrl && nextUrl.startsWith('/') ? nextUrl : fallback
    window.location.href = `/login?next=${encodeURIComponent(target || fallback)}`
  }, [appId])
  const { showAds, isSlotEnabled } = useAds()
  const { messages } = useI18n()
  const topAdSlotRaw = (AD_SLOT_IDS.playTop || '').trim()
  const bottomAdSlotRaw = (AD_SLOT_IDS.playBottom || '').trim()
  const topAdSlot = isSlotEnabled('playTop') ? topAdSlotRaw : ''
  const bottomAdSlot = isSlotEnabled('playBottom') ? bottomAdSlotRaw : ''
  const showTopAd = showAds && topAdSlot.length > 0
  const showBottomAd = showAds && bottomAdSlot.length > 0

  const GLOBAL_ROOMS_ENABLED = process.env.NEXT_PUBLIC_ROOMS_ENABLED !== 'false'
  const rawRoomsMode = app.capabilities?.storage?.roomsMode
  const storageDisabled = app.capabilities?.storage?.enabled === false
  const normalizedRoomsMode = storageDisabled ? 'off' : normalizeRoomsMode(rawRoomsMode)
  const roomsMode: RoomsMode =
    GLOBAL_ROOMS_ENABLED && !storageDisabled
      ? normalizedRoomsMode
      : 'off'
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
  const [frameHeight, setFrameHeight] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
    try {
      const jwt = await getJwt()
      jwtRef.current = jwt
      return jwt
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin()
      }
      throw err
    }
  }, [redirectToLogin])

  useEffect(() => {
    namespaceRef.current = activeNamespace
  }, [activeNamespace])

  useEffect(() => {
    roomTokenRef.current = roomSession?.token ?? null
  }, [roomSession])

  const baseViewportMinHeight = useMemo(
    () => (isFullscreen ? '100vh' : `calc(100vh - ${VIEWPORT_FIT_OFFSET}px)`),
    [isFullscreen],
  )

  const recomputeFrameHeight = useCallback(() => {
    if (typeof window === 'undefined') return
    const viewportFit = Math.max(
      window.innerHeight - (isFullscreen ? 0 : VIEWPORT_FIT_OFFSET),
      MIN_FRAME_HEIGHT,
    )
    let safeHeight = Math.round(viewportFit)
    const container = iframeContainerRef.current
    if (container) {
      const rect = container.getBoundingClientRect()
      const paddingBottom = isFullscreen ? 0 : PAGE_BOTTOM_PADDING_PX
      const available = window.innerHeight - rect.top - paddingBottom
      safeHeight = Math.max(Math.round(available), safeHeight)
    }
    setFrameHeight((prev) => (prev === safeHeight ? prev : safeHeight))
  }, [isFullscreen])

  useLayoutEffect(() => {
    recomputeFrameHeight()
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('resize', recomputeFrameHeight)
    window.addEventListener('orientationchange', recomputeFrameHeight)
    return () => {
      window.removeEventListener('resize', recomputeFrameHeight)
      window.removeEventListener('orientationchange', recomputeFrameHeight)
    }
  }, [recomputeFrameHeight])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null
      webkitExitFullscreen?: () => Promise<void> | void
      msExitFullscreen?: () => Promise<void> | void
    }
    const handleFullscreenChange = () => {
      const container = iframeContainerRef.current
      const activeEl = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
      const active = Boolean(container && activeEl === container)
      setIsFullscreen(active)
      requestAnimationFrame(() => {
        recomputeFrameHeight()
      })
    }
    doc.addEventListener('fullscreenchange', handleFullscreenChange)
    doc.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener)
    return () => {
      doc.removeEventListener('fullscreenchange', handleFullscreenChange)
      doc.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener)
    }
  }, [recomputeFrameHeight])

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return
    const container = iframeContainerRef.current
    if (!container) return
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null
      webkitExitFullscreen?: () => Promise<void> | void
      msExitFullscreen?: () => Promise<void> | void
    }
    const element = container as Element & {
      webkitRequestFullscreen?: () => Promise<void> | void
      msRequestFullscreen?: () => Promise<void> | void
    }
    const activeEl = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
    if (activeEl === container) {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.msExitFullscreen
      const result = exit?.call(doc)
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        ; (result as Promise<unknown>).catch(() => { })
      }
      return
    }
    const request =
      container.requestFullscreen ?? element.webkitRequestFullscreen ?? element.msRequestFullscreen
    const result = request?.call(container)
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      ; (result as Promise<unknown>).catch(() => { })
    }
  }, [])

  const handleFSPromptConfirm = useCallback((remember: boolean) => {
    if (remember) {
      localStorage.setItem('thesara_fullscreen_pref', 'always')
    }
    setShowFSPrompt(false)
    toggleFullscreen()
  }, [toggleFullscreen])

  const handleFSPromptCancel = useCallback((remember: boolean) => {
    if (remember) {
      localStorage.setItem('thesara_fullscreen_pref', 'never')
    }
    setShowFSPrompt(false)
  }, [])

  useEffect(() => {
    // Force a minimum splash screen time to mask initial flickers
    const timer = setTimeout(() => setMinLoadTimePassed(true), 3000)

    // Check fullscreen preference
    const pref = localStorage.getItem('thesara_fullscreen_pref')
    if (!pref) {
      setShowFSPrompt(true)
    }

    return () => clearTimeout(timer)
  }, [])

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
        const genericError =
          messages['Rooms.errors.generic'] ?? 'Rad sa sobom je trenutno onemogućen.'
        setRoomsError(err?.message || genericError)
        throw err
      } finally {
        setRoomsBusy(false)
      }
    },
    [appId, messages],
  )

  const handleUseDemo = useCallback(async () => {
    await performRoomAction('demo')
  }, [performRoomAction])

  const handleCreateRoom = useCallback(
    async (roomName: string, pin: string) => {
      const trimmedName = roomName.trim()
      const safePin = pin.trim()
      if (!trimmedName || !safePin) {
        const missingFields =
          messages['Rooms.errors.missingCredentials'] ?? 'Unesi naziv sobe i PIN.'
        setRoomsError(missingFields)
        return
      }
      await performRoomAction('create', { roomName: trimmedName, pin: safePin })
    },
    [performRoomAction, messages],
  )

  const handleJoinRoom = useCallback(
    async (roomName: string, pin: string) => {
      const trimmedName = roomName.trim()
      const safePin = pin.trim()
      if (!trimmedName || !safePin) {
        const missingFields =
          messages['Rooms.errors.missingCredentials'] ?? 'Unesi naziv sobe i PIN.'
        setRoomsError(missingFields)
        return
      }
      await performRoomAction('join', { roomName: trimmedName, pin: safePin })
    },
    [performRoomAction, messages],
  )

  useEffect(() => {
    // Always use demo room for shared storage, even when additional rooms are disabled
    if (autoDemoRequested) return
    setAutoDemoRequested(true)
    void handleUseDemo()
  }, [autoDemoRequested, handleUseDemo])

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
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin()
          return
        }
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

  }, [activeNamespace, ensureJwt, roomsReady, updateIframeSrc, roomSession?.token, redirectToLogin])

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
          if (err instanceof ApiError && err.status === 401) {
            redirectToLogin()
            return
          }
          if (err instanceof ApiError || err?.status === 412) {
            try {
              const jwt = await ensureJwt()
              const latest = await fetchSnapshot(jwt, ns, roomTokenRef.current)
              storageVersionRef.current = latest.version || '0'
              // Re-project the pending changes onto the new snapshot
              snapshotRef.current = applyBatchOperations(latest.snapshot, serverBatch)
              continue
            } catch (refreshErr: any) {
              lastError = refreshErr
              if (refreshErr instanceof ApiError && refreshErr.status === 401) {
                redirectToLogin()
                return
              }
            }
          }
          break
        }
      }

      console.error('[Play] Failed to flush storage batch', lastError)
    },
    [activeNamespace, ensureJwt, projectSnapshot, redirectToLogin],
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
      variant="compact"
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

  const isReady = !loading && !!bootstrap && !error
  const showOverlay = overlayVisible

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-6">
        {roomsControl}
        <div>Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 px-4 pb-6 relative">
      {!isFullscreen && roomsControl}
      {!isFullscreen && showTopAd && (
        <AdSlot
          slotId={topAdSlot}
          slotKey="playTop"
          placement="play.top"
          className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm"
        />
      )}
      <div
        ref={iframeContainerRef}
        className="relative flex flex-1"
        style={
          frameHeight
            ? { height: `${frameHeight}px`, minHeight: baseViewportMinHeight }
            : { minHeight: baseViewportMinHeight }
        }
      >
        {showOverlay && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-sm">
            <GameLoadingOverlay />
          </div>
        )}

        <FullScreenPrompt
          open={showFSPrompt}
          title={messages['Play.fullScreenPrompt.title'] ?? 'Puni zaslon?'}
          message={messages['Play.fullScreenPrompt.message'] ?? 'Želiš li pokrenuti igru preko cijelog ekrana?'}
          confirmLabel={messages['Play.fullScreenPrompt.yes'] ?? 'Da'}
          cancelLabel={messages['Play.fullScreenPrompt.no'] ?? 'Ne'}
          rememberLabel={messages['Play.fullScreenPrompt.remember'] ?? 'Zapamti'}
          onConfirm={handleFSPromptConfirm}
          onCancel={handleFSPromptCancel}
        />
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-pressed={isFullscreen}
          className="absolute right-4 top-4 z-10 rounded-full bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg backdrop-blur transition hover:bg-slate-900/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          {isFullscreen
            ? messages['Play.exitFullscreen'] ?? 'Exit full screen'
            : messages['Play.enterFullscreen'] ?? 'Full screen'}
        </button>

        {!!bootstrap && (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            title="Thesara App"
            name={iframeBootstrapName}
            referrerPolicy="no-referrer"
            allow="geolocation"
            sandbox={sandboxFlags}
            className={`h-full w-full flex-1 bg-white ${isFullscreen ? 'rounded-none' : 'rounded-3xl'}`}
            style={{ border: 'none', display: 'block', minHeight: baseViewportMinHeight }}
          />
        )}
      </div>
      {!isFullscreen && showBottomAd && (
        <AdSlot
          slotId={bottomAdSlot}
          slotKey="playBottom"
          placement="play.bottom"
          className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm"
        />
      )}
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
  const [collapsed, setCollapsed] = useState(() => variant === 'compact')
  const { messages } = useI18n()

  useEffect(() => {
    setCollapsed(variant === 'compact')
  }, [variant])

  const isDemo = session?.room?.isDemo ?? true
  const panelLabel = session
    ? messages['Rooms.headerActiveLabel'] ?? 'Aktivna soba'
    : messages['Rooms.panelLabel'] ?? 'Rooms panel'
  const displayName =
    session?.room?.name ?? messages['Rooms.defaultRoomName'] ?? 'Javna demo soba (PIN 1111)'
  const summaryText = isDemo
    ? messages['Rooms.descriptionDemoCompact'] ??
    'Demo soba je javna i služi testiranju. Svi korisnici dijele iste podatke.'
    : messages['Rooms.descriptionPrivateCompact'] ??
    'Ova soba ima vlastitu pohranu koju dijele samo članovi s istim PIN-om.'
  const fullDescription = isDemo
    ? messages['Rooms.descriptionDemoFull'] ??
    'Ova demo soba je javna i služi upoznavanju aplikacije. Za privatnu pohranu kreiraj vlastitu sobu i PIN.'
    : messages['Rooms.descriptionPrivateFull'] ??
    'Soba koju si odabrao/la ima vlastitu pohranu i dostupna je svima koji znaju naziv i PIN.'
  const roomLabel = messages['Rooms.roomLabel'] ?? 'Naziv sobe'
  const pinLabel = messages['Rooms.pinLabel'] ?? 'PIN'
  const roomPlaceholder = messages['Rooms.roomPlaceholder'] ?? 'Naziv sobe (npr. Kuhinja)'
  const pinPlaceholder = messages['Rooms.pinPlaceholder'] ?? 'PIN (4-8 znamenki)'
  const modeHint = messages['Rooms.modeHint'] ?? 'Za trajnu i privatnu pohranu kreiraj svoju sobu s PIN-om.'
  const toggleLabel = messages['Rooms.toggleLabel'] ?? 'Toggle rooms panel'
  const createLabel = messages['Rooms.createButton'] ?? 'Kreiraj novu sobu'
  const joinLabel = messages['Rooms.joinButton'] ?? 'Pridruži se postojećoj sobi'
  const demoLabel = messages['Rooms.demoButton'] ?? 'Vrati se u demo (PIN 1111)'

  const contentDescription = variant === 'full' ? fullDescription : summaryText
  const contentVisible = variant === 'full' || !collapsed
  const showSummaryLabel = variant === 'compact' && collapsed && summaryText
  const panelClasses =
    variant === 'full'
      ? 'rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-2xl'
      : 'fixed right-4 top-4 z-50 w-[22rem] rounded-2xl border border-slate-200 bg-white/95 text-slate-900 shadow-xl backdrop-blur-sm'
  const borderColorClass = variant === 'full' ? 'border-white/10' : 'border-slate-200/60'
  const labelTextColor = variant === 'full' ? 'text-slate-400' : 'text-slate-500'
  const titleTextColor = variant === 'full' ? 'text-white' : 'text-slate-900'
  const toggleArrow = variant === 'compact' ? (collapsed ? '▾' : '▴') : undefined

  const handleToggle = () => {
    if (variant === 'compact') {
      setCollapsed((prev) => !prev)
    }
  }

  const handleAction = (action: () => void | Promise<void>) => {
    const result = action()
    if (variant === 'compact') {
      void Promise.resolve(result)
        .then(() => setCollapsed(true))
        .catch(() => { })
    }
  }

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={panelClasses}
    >
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={handleToggle}
          aria-label={toggleLabel}
          aria-expanded={contentVisible}
          className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          <div className="space-y-1">
            <p className={`text-[10px] uppercase tracking-[0.3em] ${labelTextColor}`}>{panelLabel}</p>
            <p className={`text-sm font-semibold ${titleTextColor}`}>{displayName}</p>
          </div>
          {toggleArrow && (
            <span className="text-2xl text-slate-500 transition-transform duration-200" aria-hidden="true">
              {toggleArrow}
            </span>
          )}
        </button>
        {showSummaryLabel && <p className="mt-2 text-[11px] text-slate-500">{summaryText}</p>}
        {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      </div>
      <AnimatePresence initial={false}>
        {contentVisible && (
          <motion.div
            key="roomsContent"
            initial={{ y: -12, opacity: 0, height: 0 }}
            animate={{ y: 0, opacity: 1, height: 'auto' }}
            exit={{ y: -12, opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={`border-t px-4 pb-4 ${borderColorClass}`}
          >
            {mode === 'required' && <p className="text-xs text-emerald-500">{modeHint}</p>}
            <p className={`mt-2 text-xs ${variant === 'full' ? 'text-slate-300' : 'text-slate-500'}`}>
              {contentDescription}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid gap-3">
                <Field
                  label={roomLabel}
                  placeholder={roomPlaceholder}
                  value={roomName}
                  onChange={setRoomName}
                  inputProps={{ disabled: loading, autoComplete: 'off' }}
                />
                <Field
                  label={pinLabel}
                  placeholder={pinPlaceholder}
                  value={pin}
                  onChange={setPin}
                  inputProps={{
                    disabled: loading,
                    inputMode: 'numeric',
                    maxLength: 8,
                    autoComplete: 'off',
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
                  onClick={() => handleAction(() => onCreate(roomName, pin))}
                  disabled={loading}
                >
                  {createLabel}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => handleAction(() => onJoin(roomName, pin))}
                  disabled={loading}
                >
                  {joinLabel}
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${variant === 'full'
                    ? 'border border-white/30 bg-white/10 text-white hover:bg-white/20 disabled:border-white/20'
                    : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                    }`}
                  onClick={() => void onUseDemo()}
                  disabled={loading}
                >
                  {demoLabel}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

type FieldProps = {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  type?: HTMLInputTypeAttribute
  inputProps?: InputHTMLAttributes<HTMLInputElement>
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  inputProps,
}: FieldProps) {
  const baseClass =
    'mt-1 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400'
  const { className, value: _value, onChange: _onChange, type: _type, ...rest } = inputProps ?? {}
  const mergedClass = className ? `${baseClass} ${className}` : baseClass

  return (
    <label className="block text-xs">
      <span className="block text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={mergedClass}
        {...rest}
      />
    </label>
  )
}
