import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Required for WebSocket support in Node.js (Vercel serverless / local dev).
// Do NOT set poolQueryViaFetch here — it routes queries through Neon's HTTP API
// which requires the HTTP endpoint URL, not the standard postgres:// URL. Without
// the correct HTTP URL this throws "TypeError: fetch failed" on every query.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL environment variable is not set. Please set it in your .env file.'
    );
}

// PrismaNeon requires a Pool instance. The Pool uses WebSocket connections to Neon.
// For best results on serverless use the Neon *pooler* endpoint in DATABASE_URL
// (contains "-pooler" in the hostname) to avoid idle-connection timeouts.
const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool);

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;