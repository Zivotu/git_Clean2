type TcfPurposeConsents = Record<string, boolean>;

type TcfData = {
  tcString: string | null;
  eventStatus: 'tcloaded' | 'useractioncomplete' | 'cmpuishown';
  cmpStatus: 'loaded' | 'useractioncomplete';
  gdprApplies: boolean;
  listenerId?: number;
  purpose: {
    consents: TcfPurposeConsents;
    legitimateInterests: TcfPurposeConsents;
  };
};

type TcfCallback = (tcData: TcfData, success: boolean) => void;

type WindowTcfApi = {
  (command: 'addEventListener', version: number, callback: TcfCallback): number;
  (
    command: 'removeEventListener',
    version: number,
    callback: (success: boolean, result: boolean) => void,
    parameter: number | { listenerId?: number },
  ): void;
  (command: 'getTCData', version: number, callback: TcfCallback): void;
  (command: 'ping', version: number, callback: (tcData: any, success: boolean) => void): void;
  (
    command: string,
    version: number,
    callback: (tcData: any, success: boolean) => void,
    parameter?: any,
  ): number | void;
};

declare global {
  interface Window {
    __tcfapi?: WindowTcfApi;
  }
}

const STORAGE_KEY = 'thesara_tcf_state';
const PURPOSE_IDS = ['1', '3', '4', '7'];

type StoredState = {
  status: 'granted' | 'rejected';
  tcString: string;
  updatedAt: number;
};

type ConsentStatus = 'unknown' | 'granted' | 'rejected';

type InternalState = {
  status: ConsentStatus;
  tcString: string | null;
  eventStatus: TcfData['eventStatus'];
  cmpStatus: TcfData['cmpStatus'];
};

const state: InternalState = {
  status: 'unknown',
  tcString: null,
  eventStatus: 'cmpuishown',
  cmpStatus: 'loaded',
};

const listeners = new Map<number, TcfCallback>();
let listenerSeq = 0;
let apiRegistered = false;

function readStoredState(): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (
      parsed &&
      (parsed.status === 'granted' || parsed.status === 'rejected') &&
      typeof parsed.tcString === 'string'
    ) {
      return parsed;
    }
  } catch (err) {
    console.warn('[TCF] Failed to parse stored state', err);
  }
  return null;
}

function persistState(next: InternalState) {
  if (typeof window === 'undefined' || next.status === 'unknown' || !next.tcString) return;
  const payload: StoredState = {
    status: next.status,
    tcString: next.tcString,
    updatedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[TCF] Failed to persist state', err);
  }
}

function restoreState() {
  const stored = readStoredState();
  if (!stored) return;
  state.status = stored.status;
  state.tcString = stored.tcString;
  state.eventStatus = 'useractioncomplete';
  state.cmpStatus = 'useractioncomplete';
}

function buildPurposeConsents(granted: boolean): TcfPurposeConsents {
  return PURPOSE_IDS.reduce<TcfPurposeConsents>((acc, id) => {
    acc[id] = granted;
    return acc;
  }, {});
}

function buildTcData(eventOverride?: TcfData['eventStatus']): TcfData {
  const eventStatus = eventOverride ?? state.eventStatus;
  return {
    tcString: state.tcString,
    eventStatus,
    cmpStatus: state.cmpStatus,
    gdprApplies: true,
    purpose: {
      consents: buildPurposeConsents(state.status === 'granted'),
      legitimateInterests: buildPurposeConsents(false),
    },
  };
}

function notifyListeners(eventOverride?: TcfData['eventStatus']) {
  const payload = buildTcData(eventOverride);
  listeners.forEach((listener) => {
    try {
      listener(payload, true);
    } catch (err) {
      console.warn('[TCF] Listener failed', err);
    }
  });
}

function registerGlobalApi() {
  if (apiRegistered) return;
  apiRegistered = true;
  restoreState();

  if (typeof window === 'undefined') return;

  const tcfApi = ((command: string, _version: number, callback: any, parameter?: any) => {
    switch (command) {
      case 'addEventListener': {
        const id = ++listenerSeq;
        listeners.set(id, callback as TcfCallback);
        callback(buildTcData('tcloaded'), true);
        (callback as any).listenerId = id;
        return id;
      }
      case 'removeEventListener': {
        const id = typeof parameter === 'number' ? parameter : (parameter?.listenerId as number);
        if (typeof id === 'number') {
          listeners.delete(id);
        }
        callback(true, true);
        return;
      }
      case 'getTCData': {
        callback(buildTcData(), true);
        return;
      }
      case 'ping': {
        callback(
          {
            gdprApplies: true,
            cmpLoaded: true,
            cmpStatus: state.cmpStatus,
            displayStatus: state.eventStatus === 'cmpuishown' ? 'visible' : 'hidden',
          },
          true,
        );
        return;
      }
      default: {
        console.warn('[TCF] Unsupported command', command);
        callback(null, false);
      }
    }
  }) as WindowTcfApi;

  window.__tcfapi = tcfApi;
}

export function ensureTcfApi() {
  if (typeof window === 'undefined') return;
  registerGlobalApi();
}

export function updateTcfConsent(granted: boolean) {
  state.status = granted ? 'granted' : 'rejected';
  state.tcString = granted ? 'CPThesaraGranted1111' : 'CPThesaraRejected0000';
  state.eventStatus = 'useractioncomplete';
  state.cmpStatus = 'useractioncomplete';
  persistState(state);
  notifyListeners('useractioncomplete');
}

export function resetTcfConsent() {
  state.status = 'unknown';
  state.tcString = null;
  state.eventStatus = 'cmpuishown';
  state.cmpStatus = 'loaded';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  notifyListeners('cmpuishown');
}

export function getCurrentConsent(): { status: ConsentStatus; tcString: string | null } {
  return {
    status: state.status,
    tcString: state.tcString,
  };
}
