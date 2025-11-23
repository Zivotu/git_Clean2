import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getFirestore } from 'firebase-admin/firestore';
import { readApps, type AppRecord } from '../db.js';
import type { RoomsMode } from '../types.js';
import { getConfig } from '../config.js';
import {
  makeRoomNamespace,
  signRoomStorageToken,
} from '../lib/roomAccessTokens.js';

type RoomDoc = {
  appId: string;
  roomCode: string;
  displayName: string;
  pinHash: string | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  isDemo: boolean;
};

const DEMO_ROOM_CODE = 'demo';
const DEMO_PIN = process.env.ROOMS_DEMO_PIN?.trim() || '1111';
const ROOM_CODE_REGEX = /[a-z0-9-]/i;

const createSchema = z.object({
  appId: z.string().min(1),
  roomName: z.string().min(2).max(80),
  pin: z.string().regex(/^\d{4,8}$/),
});

const joinSchema = z.object({
  appId: z.string().min(1),
  roomName: z.string().min(2).max(80),
  pin: z.string().regex(/^\d{4,8}$/),
});

const demoSchema = z.object({
  appId: z.string().min(1),
});

const firestore = getFirestore();
const cfg = getConfig();
const DEFAULT_ROOMS_MODE: RoomsMode = cfg.ROOMS_ENABLED ? 'optional' : 'off';

function sanitizeRoomCode(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const safe = ascii.replace(/[^a-z0-9-]/g, '').slice(0, 48);
  if (!safe || !ROOM_CODE_REGEX.test(safe)) {
    return `room-${Math.random().toString(36).slice(2, 8)}`;
  }
  return safe;
}

async function getAppRecord(appId: string): Promise<AppRecord | null> {
  const apps = await readApps();
  return (
    apps.find((a) => String(a.id) === appId || a.slug === appId) ?? null
  );
}

function getRoomsMode(app: AppRecord): RoomsMode {
  const mode = app.capabilities?.storage?.roomsMode;
  if (mode === 'off') return 'off';
  if (mode === 'optional' || mode === 'required') return mode;
  return DEFAULT_ROOMS_MODE;
}

function roomCollection(appId: string) {
  return firestore.collection('appRooms').doc(appId).collection('rooms');
}

async function ensureDemoRoom(appId: string): Promise<RoomDoc> {
  const ref = roomCollection(appId).doc(DEMO_ROOM_CODE);
  const snap = await ref.get();
  if (snap.exists) {
    return snap.data() as RoomDoc;
  }
  const now = Date.now();
  const pinHash = await bcrypt.hash(DEMO_PIN, 8);
  const doc: RoomDoc = {
    appId,
    roomCode: DEMO_ROOM_CODE,
    displayName: 'Demo soba',
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    pinHash,
    isDemo: true,
  };
  await ref.set(doc);
  return doc;
}

async function ensureRoomLimit(appId: string): Promise<boolean> {
  const snap = await roomCollection(appId).get();
  const count = snap.docs.filter((doc) => {
    const data = doc.data() as RoomDoc | undefined;
    return data && !data.isDemo;
  }).length;
  return count < cfg.MAX_ROOMS_PER_APP;
}

function buildResponse(doc: RoomDoc, namespace: string) {
  const token = signRoomStorageToken({
    appId: doc.appId,
    roomCode: doc.roomCode,
    namespace,
    isDemo: doc.isDemo,
    roomName: doc.displayName,
  });
  return {
    ok: true,
    room: {
      id: doc.roomCode,
      name: doc.displayName,
      isDemo: doc.isDemo,
    },
    namespace,
    token,
  };
}

const roomsStorageRoutes: FastifyPluginAsync = async (app) => {
  app.post('/rooms/storage/demo', async (request, reply) => {
    const parsed = demoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }
    const { appId } = parsed.data;
    const appRecord = await getAppRecord(appId);
    if (!appRecord) {
      return reply.code(404).send({ ok: false, error: 'app_not_found' });
    }
    // Demo room is always available - it's the shared global storage
    // 'off' mode means no additional private rooms, but demo room is still accessible
    const roomDoc = await ensureDemoRoom(appId);
    const namespace = makeRoomNamespace(appId, roomDoc.roomCode);
    return reply.send({ ...buildResponse(roomDoc, namespace), pin: DEMO_PIN });
  });

  app.post('/rooms/storage/create', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }
    const { appId, roomName, pin } = parsed.data;
    const appRecord = await getAppRecord(appId);
    if (!appRecord) {
      return reply.code(404).send({ ok: false, error: 'app_not_found' });
    }
    const mode = getRoomsMode(appRecord);
    if (mode === 'off') {
      return reply.code(400).send({ ok: false, error: 'rooms_disabled' });
    }
    const allowed = await ensureRoomLimit(appId);
    if (!allowed) {
      return reply
        .code(400)
        .send({ ok: false, error: 'room_limit', message: 'Dosegnut je maksimalan broj soba za ovu aplikaciju.' });
    }
    const roomCode = sanitizeRoomCode(roomName);
    const ref = roomCollection(appId).doc(roomCode);
    const existing = await ref.get();
    if (existing.exists) {
      return reply
        .code(409)
        .send({ ok: false, error: 'room_exists', message: 'Soba s tim nazivom već postoji.' });
    }
    const now = Date.now();
    const doc: RoomDoc = {
      appId,
      roomCode,
      displayName: roomName.trim().slice(0, 80),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      pinHash: await bcrypt.hash(pin, 10),
      isDemo: false,
    };
    await ref.set(doc);
    const namespace = makeRoomNamespace(appId, roomCode);
    return reply.code(201).send(buildResponse(doc, namespace));
  });

  app.post('/rooms/storage/join', async (request, reply) => {
    const parsed = joinSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }
    const { appId, roomName, pin } = parsed.data;
    const appRecord = await getAppRecord(appId);
    if (!appRecord) {
      return reply.code(404).send({ ok: false, error: 'app_not_found' });
    }
    const mode = getRoomsMode(appRecord);
    if (mode === 'off') {
      return reply.code(400).send({ ok: false, error: 'rooms_disabled' });
    }
    const roomCode = sanitizeRoomCode(roomName);
    const ref = roomCollection(appId).doc(roomCode);
    const snap = await ref.get();
    if (!snap.exists) {
      return reply.code(404).send({ ok: false, error: 'room_not_found' });
    }
    const doc = snap.data() as RoomDoc;
    if (!doc.pinHash) {
      return reply.code(400).send({ ok: false, error: 'room_locked' });
    }
    const valid = await bcrypt.compare(pin, doc.pinHash);
    if (!valid) {
      return reply.code(403).send({ ok: false, error: 'invalid_pin' });
    }
    await ref.set(
      {
        lastUsedAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true },
    );
    const namespace = makeRoomNamespace(appId, roomCode);
    return reply.send(buildResponse(doc, namespace));
  });
};

export default roomsStorageRoutes;
