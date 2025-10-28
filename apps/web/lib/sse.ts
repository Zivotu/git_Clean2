export type SSEMessage = {
  event: string;
  id?: string;
  data?: any;
  raw: MessageEvent;
};

export type SSEOptions = {
  onOpen?: () => void;
  onMessage?: (m: SSEMessage) => void;
  onError?: (err: any) => void;
  buildLastEventIdKey?: string;
  maxDelayMs?: number;
  eventNames?: string[];
};

export function createSSE(url: string, opts: SSEOptions = {}) {
  const {
    onOpen,
    onMessage,
    onError,
    buildLastEventIdKey,
    maxDelayMs = 30000,
    eventNames = [],
  } = opts;

  let eventSource: EventSource | null;
  let reconnectTimeoutId: number | null = null;
  let reconnectDelay = 500;
  let isClosed = false;

  const lastEventIdKey = buildLastEventIdKey || `sse:lastId:${url}`;

  const messageHandler = (e: MessageEvent) => {
    if (e.lastEventId) {
      sessionStorage.setItem(lastEventIdKey, e.lastEventId);
    }

    let data;
    try {
      data = JSON.parse(e.data);
    } catch (error) {
      data = e.data;
    }

    onMessage?.({
      event: e.type,
      id: e.lastEventId || undefined,
      data,
      raw: e,
    });
  };

  function connect() {
    if (isClosed) return;

    let sseUrl = url;
    const lastEventId = sessionStorage.getItem(lastEventIdKey);
    if (lastEventId) {
      const separator = sseUrl.includes('?') ? '&' : '?';
      sseUrl += `${separator}lastEventId=${encodeURIComponent(lastEventId)}`;
    }

    eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      reconnectDelay = 500;
      onOpen?.();
    };

    eventSource.onmessage = messageHandler;
    eventNames.forEach(name => {
      eventSource?.addEventListener(name, messageHandler);
    });

    eventSource.onerror = (err) => {
      eventSource?.close();
      onError?.(err);
      reconnect();
    };
  }

  function reconnect() {
    if (isClosed || reconnectTimeoutId) return;
    
    const jitter = Math.random() * reconnectDelay * 0.2;
    const delay = Math.min(maxDelayMs, reconnectDelay + jitter);
    
    reconnectTimeoutId = window.setTimeout(() => {
      reconnectTimeoutId = null;
      connect();
    }, delay);

    reconnectDelay = Math.min(maxDelayMs, reconnectDelay * 2);
  }

  function close() {
    if (isClosed) return;
    isClosed = true;
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    if (eventSource) {
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.onmessage = null;
      eventNames.forEach(name => {
        eventSource?.removeEventListener(name, messageHandler);
      });
      eventSource.close();
      eventSource = null;
    }
  }

  connect();

  return { close };
}