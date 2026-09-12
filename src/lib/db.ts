import { PrismaClient } from '@prisma/client';

// Next.js loads .env.local/.env automatically. This only covers the case where
// neither file exists, so a fresh clone runs with zero configuration. A missing
// URL in production stays a hard error rather than a silently empty database.
if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and set it before building for production.');
  }
  process.env.DATABASE_URL = 'file:./dev.db';
}

/**
 * Prisma singleton. Next dev-server hot reloads would otherwise open a new
 * connection pool on every edit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
