import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { verifyToken } from '@clerk/backend';
import prisma from './lib/prisma.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = parseInt(process.env.PORT || '3000', 10);

const getAdminEmails = () =>
  (process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Middleware for authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Missing authentication token'));
    }

    try {
      const verifiedToken = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      if (!verifiedToken?.sub) {
        return next(new Error('Invalid authentication token'));
      }

      socket.userId = verifiedToken.sub;
      return next();
    } catch (error) {
      return next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`User ${socket.userId} connected:`, socket.id);

    socket.on('join-admin-room', async () => {
      try {
        const user = await prisma.user.findUnique({
          where: {
            id: socket.userId,
          },
          select: {
            email: true,
          },
        });

        const adminEmails = getAdminEmails();
        const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

        if (!isAdmin) {
          socket.emit('socket-error', { message: 'Forbidden admin notifications access' });
          return;
        }

        socket.join('admin-room');
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join admin room' });
      }
    });

    socket.on('leave-admin-room', () => {
      socket.leave('admin-room');
    });

    socket.on('join-store-room', async () => {
      try {
        const store = await prisma.store.findUnique({
          where: {
            userId: socket.userId,
          },
          select: {
            id: true,
          },
        });

        if (!store?.id) {
          socket.emit('socket-error', { message: 'Forbidden store notifications access' });
          return;
        }

        socket.join(`store-room-${store.id}`);
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join store room' });
      }
    });

    socket.on('leave-store-room', async () => {
      try {
        const store = await prisma.store.findUnique({
          where: {
            userId: socket.userId,
          },
          select: {
            id: true,
          },
        });

        if (!store?.id) return;
        socket.leave(`store-room-${store.id}`);
      } catch (_) {
        // best effort leave
      }
    });

    socket.on('join-conversation', async (conversationId) => {
      if (!conversationId) return;

      try {
        const participant = await prisma.conversationParticipant.findFirst({
          where: {
            conversationId: String(conversationId),
            userId: socket.userId,
          },
          select: {
            userId: true,
          },
        });

        if (!participant) {
          socket.emit('socket-error', { message: 'Forbidden conversation access' });
          return;
        }

        socket.join(`conversation-${conversationId}`);
        console.log(`User ${socket.userId} joined conversation ${conversationId}`);
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join conversation' });
      }
    });

    socket.on('leave-conversation', (conversationId) => {
      socket.leave(`conversation-${conversationId}`);
      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} disconnected:`, socket.id);
    });
  });

  // Make io globally accessible for API routes
  global.io = io;

  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
