import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

const repoRootEnv = path.resolve(process.cwd(), '.env');
const apiEnv = path.resolve(process.cwd(), 'apps', 'api', '.env');

// Load repo-level env (fallback) first, then allow apps/api/.env to override.
dotenv.config({ path: repoRootEnv, override: false });
dotenv.config({ path: apiEnv, override: true });


type GlobalWithPrisma = typeof globalThis & {
  __prisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
