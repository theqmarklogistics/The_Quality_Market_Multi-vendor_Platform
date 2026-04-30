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
    transports: ['polling'],
  });

  socketInstance.on('connect', () => {
    console.log('Connected to Socket.IO server:', socketInstance.id);
  });

  socketInstance.on('disconnect', () => {
    console.log('Disconnected from Socket.IO server');
  });

  socketInstance.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
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
