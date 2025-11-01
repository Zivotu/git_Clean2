import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import dotenv from 'dotenv';
import path from 'path';

// Load .env file from the current package (apps/api) and the repository root.
dotenv.config({ path: path.resolve(process.cwd(), 'apps', 'api', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });


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
