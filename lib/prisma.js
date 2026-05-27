import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Required for WebSocket support in Node.js (Vercel serverless / local dev).
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL environment variable is not set. Please set it in your .env file.'
    );
}

// channel_binding=require is a TCP/TLS-level SCRAM parameter used for direct
// PostgreSQL connections. The @neondatabase/serverless WebSocket driver does NOT
// support channel binding — passing it causes authentication to fail silently
// ("TypeError: fetch failed" / "connection terminated unexpectedly").
// Strip it before handing the URL to the Pool.
// We use URLSearchParams (not new URL) so the credentials/host are never re-encoded.
function stripChannelBinding(cs) {
    const qIdx = cs.indexOf('?');
    if (qIdx === -1) return cs;
    const base = cs.slice(0, qIdx);
    const params = new URLSearchParams(cs.slice(qIdx + 1));
    params.delete('channel_binding');
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
}

const pool = new Pool({ connectionString: stripChannelBinding(connectionString) });
const adapter = new PrismaNeon(pool);

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;