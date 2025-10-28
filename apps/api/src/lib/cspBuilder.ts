const CDN_ORIGIN = 'https://esm.sh';
const STRIPE_CONNECT_ORIGINS = ['https://api.stripe.com'];
const STRIPE_FRAME_ORIGINS = ['https://js.stripe.com', 'https://m.stripe.network'];

export type NetworkPolicy = 'NO_NET' | 'MEDIA_ONLY' | 'OPEN_NET' | string;

export type BuildCspOptions = {
  policy?: NetworkPolicy;
  networkDomains?: string[];
  frameAncestors?: string[];
  allowCdn?: boolean;
  legacyScript?: boolean;
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

function normalizeSource(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^'/.test(trimmed)) return trimmed;
  if (trimmed === '*') return trimmed;
  if (/^(?:https?|wss?):$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^(?:data|blob|mediastream|filesystem):/i.test(trimmed)) return trimmed.toLowerCase();
  if (trimmed.includes('*')) {
    if (/^(?:https?|wss?):\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }
  if (/^(?:https?|wss?):\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed;
    }
  }
  try {
    return new URL(`https://${trimmed}`).origin;
  } catch {
    return trimmed;
  }
}

function normalizeSources(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  return uniq(
    values
      .map((value) => {
        try {
          return normalizeSource(value);
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value)),
  );
}

function directive(name: string, sources: string[]): string {
  return `${name} ${sources.join(' ')}`.trim();
}

export function buildCsp({
  policy = 'NO_NET',
  networkDomains = [],
  frameAncestors = ["'self'"],
  allowCdn = false,
  legacyScript = false,
}: BuildCspOptions): string {
  const normalizedDomains = normalizeSources(networkDomains);
  const allowWildcardHttps = policy === 'OPEN_NET' && normalizedDomains.length === 0;
  const scriptSrc = new Set<string>(["'self'"]);
  const styleSrc = new Set<string>(["'self'", "'unsafe-inline'"]); // unsafe-inline is common for CSS-in-JS
  const connectSrc = new Set<string>(["'self'", 'blob:']);
  const frameSrc = new Set<string>(["'self'"]);

  if (legacyScript) {
    // Legacy app.js bundles often rely on eval-like constructs.
    scriptSrc.add("'unsafe-eval'");
  } else {
    // Modern bundles may use inline workers via blob URLs.
    // This is safer than 'unsafe-inline' for scripts.
    scriptSrc.add('blob:');
  }

  if (allowCdn) {
    scriptSrc.add(CDN_ORIGIN);
    styleSrc.add(CDN_ORIGIN);
    connectSrc.add(CDN_ORIGIN);
  } else {
  }

  normalizedDomains.forEach((domain) => {
    scriptSrc.add(domain);
    styleSrc.add(domain);
    connectSrc.add(domain);
  });

  if (allowWildcardHttps) {
    connectSrc.add('https:');
  }

  STRIPE_CONNECT_ORIGINS.forEach((origin) => connectSrc.add(origin));
  STRIPE_FRAME_ORIGINS.forEach((origin) => frameSrc.add(origin));

  const imgSrc =
    policy === 'MEDIA_ONLY' || policy === 'OPEN_NET'
      ? ['*', 'data:', 'blob:'] // Allow all images for open policies
      : ["'self'", 'data:', 'blob:'];

  const mediaSrc =
    policy === 'MEDIA_ONLY' || policy === 'OPEN_NET'
      ? ['*', 'blob:'] // Allow all media for open policies
      : ["'self'", 'blob:'];

  const frameAncestorSources = normalizeSources(frameAncestors);
  if (!frameAncestorSources.includes("'self'")) {
    frameAncestorSources.unshift("'self'");
  }

  const directives = [
    `default-src 'self'`,
    directive('script-src', Array.from(scriptSrc)),
    directive('style-src', Array.from(styleSrc)),
    directive('img-src', imgSrc),
    directive('media-src', mediaSrc),
    directive('connect-src', Array.from(connectSrc)),
    directive('frame-src', Array.from(frameSrc)),
    `base-uri 'none'`,
    `object-src 'none'`,
    directive('frame-ancestors', frameAncestorSources),
  ];

  return directives.join('; ');
}
