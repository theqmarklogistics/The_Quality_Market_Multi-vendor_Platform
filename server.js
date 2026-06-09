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

  const corsOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL must be set in production to restrict Socket.IO CORS origins');
  }

  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin || 'http://localhost:3000',
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

    // ── Kigali Pooled Delivery — realtime tracking rooms ──

    const isAdminUser = async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { email: true, role: true },
        });
        if (user?.role === 'ADMIN') return true;
        const adminEmails = getAdminEmails();
        return !!user?.email && adminEmails.includes(user.email.toLowerCase());
      } catch (_) {
        return false;
      }
    };

    // Customer watches their own order's delivery
    socket.on('join-track-room', async (orderId) => {
      if (!orderId) return;
      try {
        const order = await prisma.order.findUnique({
          where: { id: String(orderId) },
          select: { userId: true },
        });
        if (!order) {
          socket.emit('socket-error', { message: 'Order not found' });
          return;
        }
        if (order.userId !== socket.userId && !(await isAdminUser())) {
          socket.emit('socket-error', { message: 'Forbidden tracking access' });
          return;
        }
        socket.join(`track-${orderId}`);
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join tracking room' });
      }
    });

    socket.on('leave-track-room', (orderId) => {
      if (orderId) socket.leave(`track-${orderId}`);
    });

    // Rider joins their personal room + their assigned corridor(s) for today
    socket.on('join-rider-room', async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { role: true },
        });
        if (user?.role !== 'RIDER' && !(await isAdminUser())) {
          socket.emit('socket-error', { message: 'Forbidden rider access' });
          return;
        }
        socket.join(`rider-${socket.userId}`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const corridors = await prisma.deliveryCorridor.findMany({
          where: { assignedRiderId: socket.userId, runDate: { gte: today } },
          select: { id: true },
        });
        corridors.forEach((c) => socket.join(`corridor-${c.id}`));
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join rider room' });
      }
    });

    // Anyone allowed to observe a corridor (assigned rider, logistics, admin)
    socket.on('join-corridor-room', async (corridorId) => {
      if (!corridorId) return;
      try {
        const corridor = await prisma.deliveryCorridor.findUnique({
          where: { id: String(corridorId) },
          select: { assignedRiderId: true },
        });
        if (!corridor) {
          socket.emit('socket-error', { message: 'Corridor not found' });
          return;
        }
        let allowed = corridor.assignedRiderId === socket.userId;
        if (!allowed) {
          const user = await prisma.user.findUnique({
            where: { id: socket.userId },
            select: { role: true },
          });
          allowed = user?.role === 'LOGISTICS_MANAGER' || (await isAdminUser());
        }
        if (!allowed) {
          socket.emit('socket-error', { message: 'Forbidden corridor access' });
          return;
        }
        socket.join(`corridor-${corridorId}`);
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join corridor room' });
      }
    });

    socket.on('leave-corridor-room', (corridorId) => {
      if (corridorId) socket.leave(`corridor-${corridorId}`);
    });

    // Logistics dispatch board — sees all riders/corridors live
    socket.on('join-logistics-room', async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { role: true },
        });
        const allowed = user?.role === 'LOGISTICS_MANAGER' || (await isAdminUser());
        if (!allowed) {
          socket.emit('socket-error', { message: 'Forbidden logistics access' });
          return;
        }
        socket.join('logistics-room');
      } catch (error) {
        socket.emit('socket-error', { message: 'Unable to join logistics room' });
      }
    });

    socket.on('leave-logistics-room', () => {
      socket.leave('logistics-room');
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
