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

// channel_binding=require is a TCP/TLS-level SCRAM feature for direct PostgreSQL
// connections over raw TLS. The @neondatabase/serverless WebSocket driver does NOT
// support it and fails silently. Strip it before handing the URL to the Pool.
// Pure string replacement — no URL parsing, no re-encoding risk.
function stripChannelBinding(cs) {
    if (!cs || !cs.includes('channel_binding')) return cs;
    return cs
        .replace(/&channel_binding=[^&]*/gi, '')   // mid or trailing param: ?a=1&channel_binding=x → ?a=1
        .replace(/\?channel_binding=[^&]*&/gi, '?') // leading param with followers: ?channel_binding=x&a=1 → ?a=1
        .replace(/\?channel_binding=[^&]*/gi, '');  // sole param: ?channel_binding=x → (removed)
}

const pool = new Pool({ connectionString: stripChannelBinding(connectionString) });
const adapter = new PrismaNeon(pool);

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;