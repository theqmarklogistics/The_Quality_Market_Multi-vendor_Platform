import { io } from 'socket.io-client';

// Set NEXT_PUBLIC_SOCKET_ENABLED=true in your environment to activate Socket.IO.
// On Vercel (serverless), server.js never runs so global.io is never set — keep this false
// to avoid endless /socket.io 404 requests. Chat falls back to HTTP polling automatically.
const SOCKET_ENABLED = process.env.NEXT_PUBLIC_SOCKET_ENABLED === 'true';

let socketInstance = null;

export const initializeSocket = (token) => {
  if (!SOCKET_ENABLED) return null;
  if (socketInstance) return socketInstance;

  const socketBaseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

  socketInstance = io(socketBaseUrl, {
    auth: {
      token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    // After a Render cold-start (the free service sleeps 15 min idle and reboots
    // ~1 min), every connected client retries at once — causing a "thundering
    // herd" of reconnects that spikes CPU + DB on the freshly booted instance.
    // Higher max + jitter spreads them out so the server survives the spike.
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    reconnectionAttempts: Infinity,
    // Polling first: works on all hosts without WebSocket upgrade failures.
    // Socket.IO will automatically upgrade to WebSocket once polling is established.
    transports: ['polling', 'websocket'],
  });

  socketInstance.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Connected to Socket.IO server:', socketInstance.id);
    }
  });

  socketInstance.on('disconnect', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Disconnected from Socket.IO server');
    }
  });

  socketInstance.on('connect_error', (error) => {
    // Suppress repeated connection errors in production to keep the console clean.
    if (process.env.NODE_ENV !== 'production') {
      console.error('Socket.IO connection error:', error.message);
    }
  });

  return socketInstance;
};

export const getSocket = () => {
  return socketInstance;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
