import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';

import ws from 'ws';
neonConfig.webSocketConstructor = ws;

// Use fetch for connection pooling (recommended for serverless/edge)
// WebSocket was timing out, so using fetch with pooler endpoint
neonConfig.poolQueryViaFetch = true;

// Type definitions
// declare global {
//   var prisma: PrismaClient | undefined
// }

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL environment variable is not set. Please set it in your .env file.'
    );
}

// Remove channel_binding=require if present as it can cause connection issues
// Also ensure we're using the pooler endpoint which works better with fetch
connectionString = connectionString.replace(/[?&]channel_binding=require/g, '');

// For Neon serverless with fetch, the pooler endpoint is recommended
// Keep using the pooler URL as provided - it's designed for this use case
if (!connectionString.includes('pooler')) {
    console.warn('Consider using the pooler endpoint for better connection pooling with Neon serverless.');
}

const adapter = new PrismaNeon({ connectionString });
const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;