import 'dotenv/config';
import path from 'node:path';

// IMPORTANT: Load environment variables before any other code.

import fs from 'node:fs';
import fsSync from 'node:fs';
import fastify,
{
  type FastifyRequest,
  type FastifyReply,
  type FastifyInstance,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import rawBody from 'fastify-raw-body';
import { BUNDLE_ROOT, PREVIEW_ROOT } from './paths.js';
import './shims/registerSwcHelpers.js';
import { getConfig, ALLOWED_ORIGINS } from './config.js';

import { validateEnv } from './env.js';
import auth from './middleware/auth.js';

import authDebug from './routes/authDebug.js';
import billingRoutes from './routes/billing.js';
import createxProxy from './routes/createxProxy.js';
import recenzijeRoutes from './routes/recenzije.js';
import roomsRoutes from './routes/rooms.js';
import shims from './routes/shims.js';
import oglasiRoutes from './routes/oglasi.js';
import { uploadRoutes } from './routes/upload.js';
import buildRoutes from './routes/build.js';
import buildAlias from './routes/buildAlias.js';
import avatarRoutes from './routes/avatar.js';
import publishRoutes from './routes/publish.js';
import reviewRoutes from './routes/review.js';
import listingsRoutes from './routes/listings.js';
import accessRoutes from './routes/access.js';
import meRoutes from './routes/me.js';
import configRoutes from './routes/config.js';
import publicRoutes from './routes/public.js';
import creatorsRoutes from './routes/creators.js';
import trialRoutes from './routes/trial.js';
import ownerRoutes from './routes/owner.js';
import versionRoutes from './routes/version.js';
import entitlementsRoutes from './routes/entitlements.js';
import storageRoutes from './routes/storage.js';
import roomsBridge from './routes/rooms-bridge.js';
import ambassadorRoutes from './routes/ambassador.js';
import jwtRoutes from './routes/jwt.js';
import buildEventsRoutes from './routes/buildEvents.js';
import testingRoutes from './routes/testing.js';
import { startCreatexBuildWorker } from './workers/createxBuildWorker.js';
import localDevRoutes from './localdev/routes.js';
import { startLocalDevWorker } from './localdev/worker.js';
import { ensureDbInitialized } from './db.js';
import jwtPlugin from './plugins/jwt.js';
import metricsPlugin from './plugins/metrics.js';
import swaggerPlugin from './plugins/swagger.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import roomsSyncV1Routes from './routes/roomsV1/index.js';
import { buildCsp } from './lib/cspBuilder.js';

type BuildSecurityMetadata = {
  networkPolicy: string;
  networkDomains: string[];
  legacyScript: boolean;
};

type ManifestCacheEntry = {
  mtimeMs: number;
  data: BuildSecurityMetadata;
};

const manifestMetaCache = new Map<string, ManifestCacheEntry>();

function tryReadManifest(manifestPath: string): BuildSecurityMetadata | null {
  try {
    const stat = fsSync.statSync(manifestPath);
    const cached = manifestMetaCache.get(manifestPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }
    const raw = fsSync.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) ?? {};
    const entry = String(parsed.entry ?? '').trim();
    const rawPolicy = parsed.networkPolicy ?? parsed.policy ?? 'NO_NET';
    const networkPolicy = typeof rawPolicy === 'string' ? rawPolicy : 'NO_NET';
    const networkDomains = Array.isArray(parsed.networkDomains)
      ? parsed.networkDomains
          .map((value: unknown) =>
            typeof value === 'string' ? value : value != null ? String(value) : null,
          )
          .filter((value): value is string => Boolean(value))
      : [];

    const data: BuildSecurityMetadata = {
      networkPolicy,
      networkDomains,
      legacyScript: !entry || /app\.js$/i.test(entry),
    };
    manifestMetaCache.set(manifestPath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}

export let app: FastifyInstance;

export async function createServer() {
  // Ensure UI stub exists for builder in both dev and dist deployments
  try {
    const runtimeDir = __dirname;
    const builderDir = path.join(runtimeDir, 'builder');
    const dest = path.join(builderDir, 'virtual-ui.tsx');
    if (!fsSync.existsSync(dest)) {
      fsSync.mkdirSync(builderDir, { recursive: true });
      const candidates = [
        path.join(runtimeDir, '..', 'src', 'builder', 'virtual-ui.tsx'),
        path.join(process.cwd(), 'apps', 'api', 'src', 'builder', 'virtual-ui.tsx'),
      ];
      let copied = false;
      for (const c of candidates) {
        try {
          if (fsSync.existsSync(c)) {
            fsSync.copyFileSync(c, dest);
            copied = true;
            break;
          }
        } catch {}
      }
      if (!copied) {
        const stub = `import * as React from 'react';\nexport function Card(p:any){return React.createElement('div',{...p, className: (p.className||'')})}\nexport function CardHeader(p:any){return React.createElement('div',{...p, className: 'p-4 ' + (p.className||'')})}
export function CardTitle(p:any){return React.createElement('h3',{...p, className: 'text-lg font-semibold ' + (p.className||'')})}
export function CardContent(p:any){return React.createElement('div',{...p, className: 'p-4 ' + (p.className||'')})}
export function Button(p:any){return React.createElement('button',{...p, className: (p.className||'')})}
export function Input(p:any){return React.createElement('input',{...p, className: (p.className||'')})}
export function Label(p:any){return React.createElement('label',{...p, className: (p.className||'')})}
export function Textarea(p:any){return React.createElement('textarea',{...p, className: (p.className||'')})}
export function Slider(p:any){return React.createElement('input',{type:'range',...p})}
`;
        fsSync.writeFileSync(dest, stub, 'utf8');
      }
    }
  } catch {}
  validateEnv();
  const config = getConfig();
  await ensureDbInitialized();

  app = fastify({ logger: true, bodyLimit: 256 * 1024 });
  app.log.info(
    { PORT: config.PORT, NODE_ENV: process.env.NODE_ENV, BUNDLE_ROOT, PREVIEW_ROOT },
    'env'
  );

  const defaultOrigins = [
    'https://thesara.space',
    'https://www.thesara.space',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
  ];
  const corsOrigins = Array.from(new Set([...ALLOWED_ORIGINS, ...defaultOrigins])).
    filter(
      Boolean,
    );

  const exactOrigins = new Set<string>();
  const wildcardOrigins: RegExp[] = [];

  const escapeRegExp = (value: string) =>
    value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  for (const origin of corsOrigins) {
    const lower = origin.toLowerCase();
    if (lower.includes('*')) {
      const pattern = `^${escapeRegExp(lower).replace(/\\\*/g, '.*')}$`;
      try {
        wildcardOrigins.push(new RegExp(pattern, 'i'));
      } catch {
        // Ignore invalid patterns to avoid crashing CORS middleware
      }
    } else {
      exactOrigins.add(lower);
    }
  }

  const isOriginAllowed = (origin?: string | null) => {
    if (!origin) return true;
    const lower = origin.toLowerCase();
    if (exactOrigins.has(lower)) return true;
    return wildcardOrigins.some((rx) => rx.test(origin));
  };

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        // Allow requests with no origin (like mobile apps or curl)
        return callback(null, true);
      }
      if (isOriginAllowed(origin)) {
        return callback(null, origin); // Pass the origin string back
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    exposedHeaders: ['ETag', 'X-Storage-Backend'],
    allowedHeaders: ['Authorization', 'If-Match', 'X-Thesara-App-Id', 'Content-Type'],
  });

  await app.register(metricsPlugin);
  await app.register(jwtPlugin);
  await app.register(rateLimitPlugin);
  await app.register(swaggerPlugin);
  await app.register(helmet, { contentSecurityPolicy: false, frameguard: false });

  // Allow being mounted behind "/api" prefix (prod) by stripping it early
  app.addHook('onRequest', (req, _reply, done) => {
    try {
      const raw = (req.raw?.url || req.url || '') as string;
      const qIndex = raw.indexOf('?');
      const rawPath = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
      const rawQuery = qIndex >= 0 ? raw.slice(qIndex) : '';

      const isStorageApi = rawPath === '/api/storage' || rawPath === '/api/storage/';

      // 1) Ako je točno /api ili /api/ → prebaci na '/'
      if (!isStorageApi && (rawPath === '/api' || rawPath === '/api/')) {
        const stripped = '/' + (rawQuery || '');
        (req as any).url = stripped;
        if (req.raw) (req.raw as any).url = stripped;
        return done();
      }

      // 2) Ako počinje s /api/ → skini prefiks i ostavi query
      if (!isStorageApi && rawPath.startsWith('/api/')) {
        const strippedPath = rawPath.slice(4) || '/';
        const stripped = strippedPath + rawQuery;
        (req as any).url = stripped;
        if (req.raw) (req.raw as any).url = stripped;
      }
      


    } catch {}
    done();
  });

  app.addHook('onSend', (req, reply, _payload, done) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && isOriginAllowed(origin)) {
      // The @fastify/cors plugin handles these headers automatically.
      // We only need to ensure Vary is set.
      reply.header('Vary', 'Origin');
    }

    const url = req.url || req.raw?.url || '';
    if (
      url.startsWith('/assets') ||
      url.startsWith('/builds') ||
      url.startsWith('/avatar') ||
      url.startsWith('/uploads')
    ) {
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    done();
  });

  await app.register(cookie);
  // CSRF protection blocks cross-origin JSON POSTs unless clients send tokens.
  // Our API uses Authorization headers (not cookie sessions), which is CSRF-safe.
  // Keep it opt-in via CSRF_ENABLED to avoid breaking publish and other POSTs.
  if (process.env.CSRF_ENABLED === 'true') {
    await app.register(csrf);
  }
  await app.register(multipart);
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8' });

  // Static assets from the project public directory
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
    decorateReply: false,
  });

  app.get('/', async (_req, reply) => {
    return reply.type('text/html').send('OK');
  });
  app.get('/healthz', async () => ({ ok: true }));

  // Local-dev CI/CD (zip -> queue -> build -> preview)
  await app.register(localDevRoutes);

  // Build artifacts
  const setStaticHeaders = (res: any, pathName?: string) => {
    const cfg = getConfig();
    const frameAncestors = new Set(["'self'"]);
    try {
      const webBase = cfg.WEB_BASE;
      if (webBase) {
        const origin = new URL(webBase).origin;
        if (origin) frameAncestors.add(origin);
      }
    } catch {}
    if (process.env.NODE_ENV !== 'production') {
      frameAncestors.add('http://localhost:3000');
      frameAncestors.add('http://127.0.0.1:3000');
    }

    let networkPolicy = 'NO_NET';
    let networkDomains: string[] = [];
    let legacyScript = false;
    if (pathName) {
      const buildDir = path.dirname(pathName);
      const manifestPath = path.join(buildDir, 'manifest_v1.json');
      const manifestMeta = tryReadManifest(manifestPath);
      if (manifestMeta) {
        networkPolicy = manifestMeta.networkPolicy || 'NO_NET';
        networkDomains = manifestMeta.networkDomains || [];
        legacyScript = manifestMeta.legacyScript;
      } else {
        try {
          legacyScript = !fsSync.existsSync(path.join(buildDir, 'app.bundle.js'));
        } catch {
          legacyScript = false;
        }
      }
    }

    const csp = buildCsp({
      policy: networkPolicy,
      networkDomains,
      frameAncestors: Array.from(frameAncestors),
      allowCdn: Boolean(cfg.EXTERNAL_HTTP_ESM),
      legacyScript,
    });

    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Referrer-Policy', 'no-referrer');

    const origin = res.req?.headers?.origin as string | undefined;
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
  };
  const setPreviewHeaders = (res: any) => {
    const fa = ["'self'"];
    try {
      const webBase = getConfig().WEB_BASE;
      if (webBase) {
        const origin = new URL(webBase).origin;
        if (origin && !fa.includes(origin)) fa.push(origin);
      }
    } catch {}
    if (process.env.NODE_ENV !== 'production') {
      fa.push('http://localhost:3000', 'http://127.0.0.1:3000');
    }
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; frame-ancestors ${fa.join(' ')}`,
    );
  };

  // Alias for Play assets must execute before the static /builds handler so redirects win over 404s.
  await app.register(buildAlias);

  await app.register(fastifyStatic, {
    root: path.join(config.BUNDLE_STORAGE_PATH, 'builds'),
    prefix: '/builds/',
    decorateReply: false,
    redirect: true,
    index: ['index.html'],
    setHeaders: setStaticHeaders,
  });

  await app.register(fastifyStatic, {
    root: config.LOCAL_STORAGE_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    setHeaders: (res: any) => {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    },
  });

  // Preview build artifacts
  const allowPreview =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_REVIEW_PREVIEW === 'true';

  app.get('/_debug/preview-root', async (req: FastifyRequest) => {
    const id = (req.query as any)?.id as string | undefined;
    const sample = id ? path.join(PREVIEW_ROOT, id, 'index.html') : PREVIEW_ROOT;
    const exists = fs.existsSync(sample);
    return { PREVIEW_ROOT, sample, exists, NODE_ENV: process.env.NODE_ENV };
  });

  // Authentication middleware
  await app.register(auth);

  app.get('/_debug/whoami', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.authUser?.uid) {
      return { uid: req.authUser.uid, role: req.authUser.role, claims: req.authUser.claims };
    }
    return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/_debug/storage-info', async (_req, reply) => {
       try { const b = await getStorageBackend(); return reply.send(b.debug || { kind: b.kind }); } 
       catch (e:any) { return reply.send({ error: String(e?.message||e) }); }
     });

  // Routes
  await app.register(authDebug);
  await app.register(billingRoutes);
  await app.register(createxProxy);
  await app.register(recenzijeRoutes);
  await app.register(roomsRoutes);
  await app.register(roomsSyncV1Routes);
  await app.register(shims);
  await app.register(uploadRoutes);
  await app.register(publishRoutes);
  await app.register(storageRoutes);
  await app.register(roomsBridge);
  await app.register(listingsRoutes);
  await app.register(accessRoutes);
  await app.register(ambassadorRoutes);
  await app.register(versionRoutes);
  await app.register(oglasiRoutes);
  await app.register(buildRoutes);
  await app.register(avatarRoutes);
  await app.register(reviewRoutes);
  await app.register(entitlementsRoutes);
  await app.register(meRoutes);
  await app.register(configRoutes);
  await app.register(publicRoutes);
  await app.register(creatorsRoutes);
  await app.register(trialRoutes);
  await app.register(ownerRoutes);
  await app.register(jwtRoutes);
  await app.register(buildEventsRoutes);

  if (allowPreview) {
    await app.register(fastifyStatic, {
      root: PREVIEW_ROOT,
      prefix: '/review/builds/',
      decorateReply: false,
      redirect: true,
      index: ['index.html'],
      setHeaders: setPreviewHeaders,
      allowedPath: (pathname) => !/\/llm(?:\/|$)/.test(pathname),
    });
  }

  if (process.env.NODE_ENV === 'test') {
    await app.register(testingRoutes);
  }

  // Health endpoint
  app.route({
    method: ['GET', 'HEAD'],
    url: '/health',
    handler: (_req: FastifyRequest, reply: FastifyReply) =>
      reply.send({ ok: true }),
  });

  // Note: legacy /api/* handler removed; supported via onRequest prefix-strip

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const diagDir = path.join(process.cwd(), '.diag');
    fs.mkdirSync(diagDir, { recursive: true });
    fs.appendFileSync(
      path.join(diagDir, 'notfound.log'),
      `${new Date().toISOString()} ${req.method} ${req.url}\n`
    );
    reply.code(404).send({ error: 'Not found' });
  });

  void app.ready().then(() => {
    const routes = app.printRoutes();
    app.log.info(routes);
    const diagDir = path.join(process.cwd(), '.diag');
    fs.mkdirSync(diagDir, { recursive: true });
    fs.writeFileSync(path.join(diagDir, 'fastify-routes.txt'), routes);
  });

  return { app, config };
}

export async function start(): Promise<void> {
  const { app } = await createServer();
  const enableWorker = process.env.CREATEX_WORKER_ENABLED === 'true';
  const inlineLocalDevWorker = process.env.LOCAL_DEV_WORKER_INLINE === 'true';
  const buildWorker = enableWorker ? startCreatexBuildWorker() : { close: async () => {} };
  const localDevWorker = inlineLocalDevWorker ? startLocalDevWorker() : null;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await buildWorker.close();
    if (localDevWorker) {
      await localDevWorker.close();
    }
    await app.close();
    process.exit(0);
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.once(signal, () => {
      void shutdown(signal);
    });
  });

  const basePort = Number(process.env.PORT) || 8788;
  const maxAttempts = Number(process.env.PORT_FALLBACK_ATTEMPTS || '10');
  let listened = false;
  let lastError: any;

  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i;
    try {
      await app.listen({ port, host: '0.0.0.0' });
      app.log.info(`listening on ${port}`);
      try {
        const diagDir = path.join(process.cwd(), '.diag');
        fs.mkdirSync(diagDir, { recursive: true });
        fs.writeFileSync(path.join(diagDir, 'api-port.txt'), String(port));
      } catch {}
      listened = true;
      break;
    } catch (err: any) {
      lastError = err;
      if (err && err.code === 'EADDRINUSE') {
        app.log.warn({ port }, 'port in use, trying next');
        continue;
      }
      app.log.error(err);
      await buildWorker.close();
      if (localDevWorker) {
        await localDevWorker.close();
      }
      try {
        await app.close();
      } catch {}
      throw err;
    }
  }

  if (!listened) {
    const error = lastError ?? new Error('failed to bind any port');
    app.log.error({ basePort, attempts: maxAttempts, error });
    await buildWorker.close();
    if (localDevWorker) {
      await localDevWorker.close();
    }
    try {
      await app.close();
    } catch {}
    throw error;
  }
}

export { start as bootstrap };

void (async () => {
  if (process.env.NODE_ENV !== 'test') {
    try {
      await start();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
})();
