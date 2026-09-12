import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Next.js reads `.env.local` and `.env`, but the Prisma CLI historically reads
 * only `.env` — which meant `cp .env.example .env.local` (the obvious setup
 * step) left `prisma db push` with no DATABASE_URL. Loading both here makes one
 * setup step work for the app and the CLI alike.
 */
loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });
loadEnv({ path: path.join(process.cwd(), '.env'), quiet: true });

// Local development should work with no configuration at all. In production a
// missing DATABASE_URL must stay an error rather than silently pointing at an
// empty SQLite file.
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  process.env.DATABASE_URL = 'file:./dev.db';
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
