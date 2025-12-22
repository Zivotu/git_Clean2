import process from 'node:process';

const isStaticExport = process.env.NEXT_OUTPUT === 'export';
const SAFE_PUBLISH_ENABLED = process.env.SAFE_PUBLISH_ENABLED === 'true';
const isDev = process.env.NODE_ENV !== 'production';
// API_BASE without /api suffix for routes served directly (shims, builds, etc.)
const API_BASE = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8788/api').replace(/\/api$/, '');
// API_URL with /api suffix for standard API routes
const API_URL = API_BASE + '/api';
const APPS_HOST = (process.env.NEXT_PUBLIC_APPS_HOST || 'https://apps.thesara.space').replace(/\/+$/, '');

const buildGeolocationPermissionsPolicy = () => {
  const sources = new Set(['self']);
  const addOrigin = (value) => {
    if (!value) return;
    try {
      const origin = new URL(value).origin;
      sources.add(`"${origin}"`);
    } catch {
      sources.add(`"${value}"`);
    }
  };

  addOrigin(APPS_HOST);
  if (isDev) {
    addOrigin('https://localhost:3000');
  }

  return `camera=(), microphone=(), geolocation=(${Array.from(sources).join(' ')})`;
};

const PERMISSIONS_POLICY_VALUE = buildGeolocationPermissionsPolicy();

/** @type {import('next').NextConfig} */
const baseConfig = {
  ...(isStaticExport ? { output: 'export' } : {}),
  reactStrictMode: true,
  trailingSlash: false,
  webpack: (config, { dev }) => {
    if (dev) {
      // Izbjegni eval u DEV → kompatibilno s CSP bez 'unsafe-eval'
      config.devtool = 'source-map'
    }
    return config
  },
  images: {
    unoptimized: true,
  },
  env: {
    SAFE_PUBLISH_ENABLED: process.env.SAFE_PUBLISH_ENABLED,
    SANDBOX_SUBDOMAIN_ENABLED: process.env.SANDBOX_SUBDOMAIN_ENABLED,
    ROOMS_ENABLED: process.env.ROOMS_ENABLED,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_STRIPE_PK:
      process.env.NEXT_PUBLIC_STRIPE_PK ?? process.env.STRIPE_PUBLISHABLE_KEY,
  },
  async rewrites() {
    if (isStaticExport) {
      return [];
    }
    return [
      // Proxy app routes to the API server for same-origin iframe loading
      { source: '/app/:path*', destination: `${API_BASE}/app/:path*` },

      // Legacy shim path: proxy directly without /api prefix (API serves at /shims/*)
      { source: '/shims/:path*', destination: `${API_BASE}/shims/:path*` },

      // Static player assets served by API (ensures frontend 3000 can open /builds/* URLs)
      { source: '/builds/:path*', destination: `${API_BASE}/builds/:path*` },
      { source: '/review/builds/:path*', destination: `${API_BASE}/review/builds/:path*` },
      { source: '/public/builds/:path*', destination: `${API_BASE}/public/builds/:path*` },
      { source: '/play-wrapper.js', destination: `${API_BASE}/play-wrapper.js` },
      { source: '/play.css', destination: `${API_BASE}/play.css` },
      { source: '/api/health', destination: `${API_URL}/health` },
      { source: '/api/listings', destination: `${API_URL}/listings` },
      { source: '/api/listing/:path*', destination: `${API_URL}/listing/:path*` },
      { source: '/api/oglasi', destination: `${API_URL}/oglasi` },
      { source: '/api/avatar/:path*', destination: `${API_URL}/avatar/:path*` },
      { source: '/api/review/:path*', destination: `${API_URL}/review/:path*` },
      { source: '/billing/:path*', destination: `${API_URL}/billing/:path*` },
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
      // Rooms API proxies
      { source: '/rooms/v1/:path*', destination: `${API_BASE}/rooms/v1/:path*` },
      { source: '/rooms/:path*', destination: `${API_BASE}/rooms/:path*` },
      // Fix browsers requesting relative favicon on nested routes (/u/favicon.ico, /creators/favicon.ico)
      { source: '/:segment/favicon.ico', destination: '/favicon.ico' },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY_VALUE },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Content-Security-Policy',
            value: (() => {
              const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.thesara.space/api';
              let apiOrigin;
              try {
                apiOrigin = new URL(apiBase).origin;
              } catch {
                apiOrigin = apiBase;
              }
              const appsHost = APPS_HOST;
              const devApiOrigins = isDev ? ['http://127.0.0.1:8789', 'http://localhost:8789'] : [];
              const firebaseOrigins = [
                'https://firestore.googleapis.com',
                'https://identitytoolkit.googleapis.com',
                'https://securetoken.googleapis.com',
                'https://*.googleapis.com',
                'https://*.gstatic.com',
              ];
              if (isDev && process.env.NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE === '1') {
                firebaseOrigins.push('https://www.googleapis.com');
              }

              const adScriptHosts = [
                'https://pagead2.googlesyndication.com',
                'https://www.googletagservices.com',
                'https://www.googletagmanager.com',
                'https://www.google-analytics.com',
                'https://www.clarity.ms',
                'https://cdn.tailwindcss.com',
              ];
              const adFrameHosts = [
                'https://googleads.g.doubleclick.net',
                'https://tpc.googlesyndication.com',
                'https://www.googletagmanager.com',
              ];
              const adImgHosts = [
                'https://pagead2.googlesyndication.com',
                'https://tpc.googlesyndication.com',
                'https://googleads.g.doubleclick.net',
                'https://www.google-analytics.com',
                'https://www.googletagmanager.com',
                'https://www.clarity.ms',
                'https://c.clarity.ms',
              ];

              const scriptSrc = ["'self'", "'unsafe-inline'", ...adScriptHosts];
              if (isDev) {
                // unsafe-eval is needed for dev mode's sourcemaps.
                scriptSrc.push("'unsafe-eval'", ...devApiOrigins);
              }

              const connectSrc = new Set(["'self'", apiOrigin, ...devApiOrigins, ...firebaseOrigins]);
              adScriptHosts.forEach((origin) => connectSrc.add(origin));
              // Allow GA/GTM connect
              connectSrc.add('https://www.google-analytics.com');
              connectSrc.add('https://region1.google-analytics.com');
              connectSrc.add('https://www.googletagmanager.com');
              const frameSrc = new Set([appsHost, apiOrigin, ...devApiOrigins, 'blob:', ...adFrameHosts]);
              adFrameHosts.forEach((origin) => connectSrc.add(origin));
              const imgSrc = new Set(["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com', ...adImgHosts]);
              if (isDev) {
                imgSrc.add('http://127.0.0.1:8788');
                imgSrc.add('http://localhost:8788');
              }

              const policies = [
                "default-src 'self'",
                `script-src ${Array.from(new Set(scriptSrc)).join(' ')}`,
                "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
                `connect-src ${Array.from(connectSrc).join(' ')}`,
                `frame-src ${Array.from(frameSrc).join(' ')}`,
                `img-src ${Array.from(imgSrc).join(' ')}`,
                "frame-ancestors 'none'",
              ];
              return policies.join('; ');
            })(),
          },
        ],
      },
      {
        source: '/play/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

if (SAFE_PUBLISH_ENABLED && isDev) {
  baseConfig.assetPrefix = '/assets';
}

let config = baseConfig;
try {
  const { withSitemap } = await import('next-sitemap');
  if (typeof withSitemap === 'function') {
    config = withSitemap({
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com',
      generateRobotsTxt: false,
    })(baseConfig);
  }
} catch {
  // next-sitemap not installed
}

export default config;
