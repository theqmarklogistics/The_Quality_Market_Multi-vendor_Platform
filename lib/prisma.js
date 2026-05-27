import { PrismaClient } from '@prisma/client';
import { PrismaNeonHttp, PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neon, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// WebSocket constructor — only needed for the fallback Pool used by interactive transactions.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL environment variable is not set. Please set it in your .env file.'
    );
}

// channel_binding=require is a TCP/TLS SCRAM feature that the Neon serverless driver
// (both HTTP and WebSocket transports) does not support. Strip it from the URL.
function stripChannelBinding(cs) {
    if (!cs || !cs.includes('channel_binding')) return cs;
    return cs
        .replace(/&channel_binding=[^&]*/gi, '')   // mid or trailing: ?a=1&channel_binding=x → ?a=1
        .replace(/\?channel_binding=[^&]*&/gi, '?') // leading with followers: ?channel_binding=x&a=1 → ?a=1
        .replace(/\?channel_binding=[^&]*/gi, '');  // sole param: ?channel_binding=x → (removed)
}

const cleanUrl = stripChannelBinding(connectionString);

// ── Primary adapter: HTTP (PrismaNeonHttp) ────────────────────────────────────
// Uses Neon's stateless HTTP /sql endpoint. Preferred for Vercel serverless because:
//  • No WebSocket handshake on every cold start
//  • Neon auto-suspend wake-up happens transparently inside the HTTP request
//  • Stateless — no connection lifecycle to manage
//  • Does NOT support interactive $transaction(async tx => {...}) — use prismaWs for those
const sql = neon(cleanUrl);
const httpAdapter = new PrismaNeonHttp(sql);

// ── Fallback adapter: WebSocket Pool (PrismaNeon) ─────────────────────────────
// Kept only for routes that use interactive (callback-style) $transaction.
// PrismaNeonHttp does not support interactive transactions; prismaWs does.
const pool = new Pool({ connectionString: cleanUrl });
const wsAdapter = new PrismaNeon(pool);

function makePrismaClient(adapter, devGlobalKey) {
    if (process.env.NODE_ENV === 'development' && global[devGlobalKey]) {
        return global[devGlobalKey];
    }
    const client = new PrismaClient({ adapter });
    if (process.env.NODE_ENV === 'development') {
        global[devGlobalKey] = client;
    }
    return client;
}

// Default export — HTTP client. Use for ALL queries except interactive transactions.
const prisma = makePrismaClient(httpAdapter, '__prismaHttp');

// Named export — WebSocket client. Use ONLY when you need $transaction(async tx => {...}).
// Import as: import prisma, { prismaWs } from '@/lib/prisma'
export const prismaWs = makePrismaClient(wsAdapter, '__prismaWs');

export default prisma;
