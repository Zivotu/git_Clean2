import dotenv from 'dotenv';
dotenv.config({ override: false });

import path from 'node:path';

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
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
import proxyRoutes from './routes/proxy.js';
import ambassadorRoutes from './routes/ambassador.js';
import jwtRoutes from './routes/jwt.js';
import buildEventsRoutes from './routes/buildEvents.js';
import testingRoutes from './routes/testing.js';
import { startCreatexBuildWorker } from './workers/createxBuildWorker.js';
import localDevRoutes from './localdev/routes.js';
import { startLocalDevWorker } from './localdev/worker.js';
import { ensureDbInitialized, readAppKv, getAppByIdOrSlug } from './db.js';
import type { AppSecurityPolicy } from './types.js';
import jwtPlugin from './plugins/jwt.js';
import metricsPlugin from './plugins/metrics.js';
import swaggerPlugin from './plugins/swagger.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import roomsSyncV1Routes from './routes/roomsV1/index.js';
import { buildCsp } from './lib/cspBuilder.js';
import { sseEmitter as sse } from './sse.js';
import testLinkRoutes from './routes/testLink.js';

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
      ? (parsed.networkDomains as unknown[])
          .map((value: unknown) =>
            typeof value === 'string' ? value : value != null ? String(value) : null,
          )
          .filter((value): value is string => !!value)
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

  // HOTFIX: globalni redirect sanitizer za FST_ERR_BAD_STATUS_CODE
  app.setErrorHandler((err, req, reply) => {
    const code = (err as any)?.code || '';
    const msg = (err as any)?.message || '';

    if (code === 'FST_ERR_BAD_STATUS_CODE') {
      const m = msg.match(/Called reply with an invalid status code: (.*)$/);
      const loc = m?.[1];
      if (loc && !reply.sent) {
        req.log.warn({ loc }, 'hotfix: repaired malformed redirect → 307');
        return reply.code(307).header('Location', loc).send();
      }
    }

    if (!reply.sent) {
      const status = (err as any)?.statusCode || 500;
      req.log.error({ err }, 'unhandled error');
      return reply.code(status).send({ error: 'internal_error' });
    }
  });

  app.log.info(
    { PORT: config.PORT, NODE_ENV: process.env.NODE_ENV, BUNDLE_ROOT, PREVIEW_ROOT },
    'env'
  );

  const selfOrigins: string[] = (() => {
    const self: string[] = [];
    try {
      const pub = new URL(config.PUBLIC_BASE);
      self.push(pub.origin);
    } catch {}
    // Add explicit localhost/127.0.0.1 with current API port to allow same-origin module requests from iframes
    self.push(`http://127.0.0.1:${config.PORT}`);
    self.push(`http://localhost:${config.PORT}`);
    return self;
  })();

  const defaultOrigins = [
    'https://thesara.space',
    'https://www.thesara.space',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    ...selfOrigins,
  ];
  const corsOrigins = Array.from(new Set([...ALLOWED_ORIGINS, ...defaultOrigins])).
    filter(Boolean);

  const exactOrigins = new Set<string>();
  const wildcardOrigins: RegExp[] = [];

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\/]/g, '\$&');

  for (const origin of corsOrigins.filter(Boolean)) {
    const lower = origin.toLowerCase();
    if (lower.includes('*')) {
      const pattern = `^${escapeRegExp(lower).replace(/\\\*/g, '.*')}$`;
      try {
        wildcardOrigins.push(new RegExp(pattern, 'i'));
      } catch (err) {
        // Ignore invalid patterns to avoid crashing CORS middleware
        app.log.warn({ origin, err }, 'cors_invalid_wildcard_pattern');
      }
    } else {
      exactOrigins.add(lower);
    }
  }

  const isOriginAllowed = (origin?: string | null): boolean => {
    if (!origin) return true; // Allow requests with no origin (like mobile apps or curl)
    const lower = origin.toLowerCase();
    if (exactOrigins.has(lower)) return true;
    return wildcardOrigins.some((rx) => rx.test(origin));
  };

  await app.register(cors, {
    origin: (origin, cb) => {
      // Bez Origin headera (curl, Invoke-RestMethod, SSR, health) → dozvoli
      if (!origin) return cb(null, true);

      // Allow literal "null" origin from sandboxed iframes
      if (origin === 'null') return cb(null, '*');

      if (isOriginAllowed(origin)) {
        // reflektiraj dopušten origin
        return cb(null, origin);
      }
      app.log?.warn?.({ origin }, 'cors_rejected_origin');
      return cb(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    exposedHeaders: ['ETag', 'X-Storage-Backend'],
    allowedHeaders: ['Authorization', 'If-Match', 'X-Thesara-App-Id', 'Content-Type'],
    optionsSuccessStatus: 204,
    // Hide CORS errors from iframe requests - they set their own headers
    hideOptionsRoute: false,
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

      // 1) Ako je točno /api ili /api/ → prebaci na '/'
      if (rawPath === '/api' || rawPath === '/api/') {
        const stripped = '/' + (rawQuery || '');
        (req as any).url = stripped;
        if (req.raw) (req.raw as any).url = stripped;
        return done();
      }

      // 2) Ako počinje s /api/ → skini prefiks i ostavi query
      if (rawPath.startsWith('/api/')) {
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
      // @fastify/cors handles Access-Control-Allow-Origin, we just ensure Vary is set.
      reply.header('Vary', 'Origin');
    }

    const url = req.url || req.raw?.url || '';
    if (
      url.startsWith('/assets') ||
      url.startsWith('/builds') ||
      url.startsWith('/public/builds') ||
      url.startsWith('/avatar') ||
      url.startsWith('/uploads') ||
      url.startsWith('/api/avatar') // Handle proxied avatar route
    ) {
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('X-Storage-Backend', 'thesara-fs');
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
  const setStaticHeaders = async (res: any, pathName?: string) => {
    // Sprječava ERR_HTTP_HEADERS_SENT ako je response već poslan (npr. 404)
    if (res.headersSent) return;

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
    let securityPolicy: AppSecurityPolicy | undefined;

    if (pathName) {
      const buildId = path.basename(path.dirname(pathName));
      const app = await getAppByIdOrSlug(buildId);

      if (app?.id) {
        const kv = await readAppKv(app.id);
        securityPolicy = kv['security-policy-v1'];
      }

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
      policy: securityPolicy ?? networkPolicy,
      networkDomains: networkDomains,
      frameAncestors: Array.from(frameAncestors), // CSP builder handles blob: for scripts
      allowCdn: Boolean(cfg.EXTERNAL_HTTP_ESM),
      legacyScript,
    });

    // Provjeri opet nakon async operacija (response možda već poslan)
    if (res.headersSent) return;

    // Eksplicitno postavi Content-Type za JS fileove (fastify-static ponekad ne detektira pravilno)
    if (pathName && /\.m?js$/i.test(pathName)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }

    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Storage-Backend', 'thesara-fs');
    // Omogući učitavanje u iframeu i cross-origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const origin = res.req?.headers?.origin as string | undefined;
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // Fallback za same-origin zahtjeve bez Origin headera
      res.setHeader('Access-Control-Allow-Origin', '*');
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
    // Omogući učitavanje u iframeu i cross-origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; frame-ancestors ${fa.join(' ')}`,
    );
  };

  // Explicit, more-specific routes for build assets to ensure correct headers
  // MUST be registered BEFORE buildAlias to prevent wildcard /:listingId/build/* from matching /builds/...

  // Helper to bypass CORS plugin for /builds/ routes (iframe lacks Origin header)
  const bypassCors = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  };

  // Compatibility redirects: older web clients may use "/bundle" path
  // Redirect /builds/:buildId/bundle[/*] -> /builds/:buildId/build[/*]
  app.get('/builds/:buildId/bundle', { preHandler: bypassCors }, async (req, reply) => {
    const { buildId } = req.params as { buildId: string };
    return reply.redirect(`/builds/${encodeURIComponent(buildId)}/build/`, 307);
  });
  app.get('/builds/:buildId/bundle/', { preHandler: bypassCors }, async (_req, reply) => {
    const { buildId } = _req.params as { buildId: string };
    return reply.redirect(`/builds/${encodeURIComponent(buildId)}/build/`, 307);
  });
  app.get('/builds/:buildId/bundle/*', { preHandler: bypassCors }, async (req, reply) => {
    const { buildId } = req.params as { buildId: string };
    const wildcard = (req.params as any)['*'] as string | undefined;
    const suffix = wildcard ? `/${wildcard}` : '/';
    return reply.redirect(`/builds/${encodeURIComponent(buildId)}/build${suffix}`, 307);
  });

  // 1) Serve index.html for the build root
  app.get('/builds/:buildId/build/', {
    preHandler: bypassCors
  }, async (req, reply) => {
    const { buildId } = req.params as { buildId: string };
    const indexPath = path.join(config.BUNDLE_STORAGE_PATH, 'builds', buildId, 'build', 'index.html');
    try {
      const html = await readFile(indexPath, 'utf8');
      reply
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .header('Access-Control-Allow-Origin', '*')
        .type('text/html; charset=utf-8');
      return reply.send(html);
    } catch (err) {
      req.log?.warn?.({ err, buildId, indexPath }, 'build_index_not_found');
      return reply.code(404).send({ error: 'not_found' });
    }
  });

  // 2) Serve any file under the build folder with proper MIME for JS/MJS
  app.get('/builds/:buildId/build/*', {
    preHandler: bypassCors
  }, async (req, reply) => {
    const { buildId } = req.params as { buildId: string };
    const wildcard = (req.params as any)['*'] as string;
    if (!wildcard) return reply.callNotFound();

    const rootDir = path.join(config.BUNDLE_STORAGE_PATH, 'builds', buildId, 'build');
    const ext = path.extname(wildcard).toLowerCase();

    if (ext === '.js' || ext === '.mjs') {
      reply.type('application/javascript; charset=utf-8');
    } else if (ext === '.css') {
      reply.type('text/css; charset=utf-8');
    } else if (ext === '.html' || ext === '.htm') {
      reply.type('text/html; charset=utf-8');
    }

    reply
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=31536000, immutable');

    try {
      // Text assets
      if (ext === '.js' || ext === '.mjs' || ext === '.css' || ext === '.html' || ext === '.htm') {
        const content = await readFile(path.join(rootDir, wildcard), 'utf8');
        return reply.send(content);
      }
      // Binary and other assets
      const buf = await readFile(path.join(rootDir, wildcard));
      return reply.send(buf);
    } catch (err) {
      req.log?.warn?.({ err, buildId, file: wildcard }, 'build_asset_not_found');
      return reply.code(404).send({ error: 'not_found' });
    }
  });

  // Note: We intentionally do NOT mount fastify-static on '/builds/'.
  // Our explicit routes above fully handle serving build assets with precise headers
  // to avoid Windows MIME mis-detection and plugin precedence issues.

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

  // Authentication middleware
  await app.register(auth);

  app.get('/_debug/whoami', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.authUser?.uid) {
      return { uid: req.authUser.uid, role: req.authUser.role, claims: req.authUser.claims };
    }
    return reply.code(401).send({ error: 'unauthenticated' });
  });

  // Routes
  await app.register(proxyRoutes);
  await app.register(authDebug);
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
  await app.register(entitlementsRoutes);
  await app.register(meRoutes);
  await app.register(configRoutes);
  // Mount publicRoutes at root. We already strip '/api' in onRequest so
  // requests to '/api/play/*' will match these root-level routes.
  await app.register(publicRoutes);
  await app.register(creatorsRoutes);
  await app.register(trialRoutes);
  await app.register(ownerRoutes);
  await app.register(jwtRoutes);

  // CRITICAL: Register buildEventsRoutes BEFORE buildAlias to ensure /build/:buildId/events
  // is matched before the wildcard /:listingId/build/* route intercepts it
  await app.register(buildEventsRoutes);
  await app.register(testLinkRoutes);

  // Alias for Play assets (/:listingId/build/*) must be registered AFTER explicit /builds/ routes
  // AND after buildEventsRoutes so it doesn't intercept SSE endpoint
  await app.register(buildAlias);

  // Review routes (with internal aliasing for /api/review)
  await app.register(reviewRoutes);

  if (allowPreview) {
    // Serve bundled artifacts for review (bundle-first)
    await app.register(fastifyStatic, {
      root: path.join(config.BUNDLE_STORAGE_PATH, 'builds'),
      prefix: '/review/builds/',
      decorateReply: false,
      redirect: true,
      index: ['index.html'],
      setHeaders: (res, pathName) => {
        void setStaticHeaders(res, pathName);
      },
      // Spriječi da static "proguta" API podputeve
      allowedPath: (pathname: string) =>
        !/\/(llm|policy|delete|force-delete|restore|rebuild)(?:\/|$)/i.test(pathname),
    });
    // Serve legacy preview artifacts under a separate, non-conflicting prefix
    await app.register(fastifyStatic, {
      root: PREVIEW_ROOT,
      prefix: '/review/previews/',
      decorateReply: false,
      redirect: true,
      index: ['index.html'],
      setHeaders: setPreviewHeaders,
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

