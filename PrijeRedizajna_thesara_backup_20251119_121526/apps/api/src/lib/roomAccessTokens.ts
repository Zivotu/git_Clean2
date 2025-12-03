import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';

export const ROOM_NAMESPACE_REGEX = /^app:([^:]+):room:([a-z0-9-]{1,64})$/i;

export type RoomStorageTokenPayload = {
  appId: string;
  roomCode: string;
  namespace: string;
  isDemo?: boolean;
  roomName?: string;
  iat?: number;
  exp?: number;
};

export function makeRoomNamespace(appId: string, roomCode: string): string {
  const safeAppId = String(appId).trim();
  const safeRoom = String(roomCode).trim().toLowerCase();
  return `app:${safeAppId}:room:${safeRoom}`;
}

export function signRoomStorageToken(payload: {
  appId: string;
  roomCode: string;
  namespace?: string;
  isDemo?: boolean;
  roomName?: string;
}): string {
  const cfg = getConfig();
  const namespace = payload.namespace || makeRoomNamespace(payload.appId, payload.roomCode);
  const tokenPayload: RoomStorageTokenPayload = {
    appId: payload.appId,
    roomCode: payload.roomCode,
    namespace,
    isDemo: payload.isDemo,
    roomName: payload.roomName,
  };
  const expiresInSeconds = Math.max(
    60,
    Math.floor(cfg.ROOMS_STORAGE.tokenTtlMs / 1000),
  );
  return jwt.sign(tokenPayload, cfg.ROOMS_STORAGE.secret, {
    expiresIn: expiresInSeconds,
  });
}

export function verifyRoomStorageToken(token: string): RoomStorageTokenPayload | null {
  const cfg = getConfig();
  try {
    const decoded = jwt.verify(token, cfg.ROOMS_STORAGE.secret) as RoomStorageTokenPayload;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.appId !== 'string' ||
      typeof decoded.roomCode !== 'string' ||
      typeof decoded.namespace !== 'string'
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function parseRoomNamespace(ns: string): { appId: string; roomCode: string } | null {
  const match = ROOM_NAMESPACE_REGEX.exec(ns);
  if (!match) return null;
  return { appId: match[1], roomCode: match[2] };
}
