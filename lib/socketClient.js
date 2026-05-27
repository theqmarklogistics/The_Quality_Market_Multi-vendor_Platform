import { io } from 'socket.io-client';

let socketInstance = null;

export const initializeSocket = (token) => {
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
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    // Polling first: works on all hosts (Vercel, VPS, etc.) without WebSocket upgrade failures.
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
