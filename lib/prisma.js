import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL environment variable is not set. Please set it in your .env file.'
    );
}

// ── Supabase Postgres ─────────────────────────────────────────────────────────
// Prisma talks to Supabase over a standard Postgres connection — no serverless
// driver adapter required. Point DATABASE_URL at the Supabase *Transaction pooler*
// (port 6543, PgBouncer, with `?pgbouncer=true`) for serverless/Vercel runtimes,
// and DIRECT_URL at the direct/session connection (port 5432) for migrations.
//
// Unlike the old Neon HTTP adapter, this connection fully supports transactions
// (both implicit nested writes and interactive `$transaction(async tx => …)`).
function makePrismaClient(devGlobalKey) {
    if (process.env.NODE_ENV === 'development' && global[devGlobalKey]) {
        return global[devGlobalKey];
    }
    const client = new PrismaClient();
    if (process.env.NODE_ENV === 'development') {
        global[devGlobalKey] = client;
    }
    return client;
}

// Default export — use for ALL queries.
const prisma = makePrismaClient('__prisma');

// Backwards-compatible alias. On Neon we needed a separate WebSocket client for
// interactive transactions because the HTTP adapter could not run them. Supabase's
// Postgres connection supports transactions on the default client, so `prismaWs`
// now points at the same instance. Kept so existing
// `import prisma, { prismaWs } from '@/lib/prisma'` imports keep working.
export const prismaWs = prisma;

export default prisma;
