// Socket.IO client singleton. Mirrors the web's lib/socketClient.js but uses an
// `auth` function so a fresh Clerk session JWT is supplied on every (re)connect —
// Clerk session tokens are short-lived, so a static token would break reconnects.
//
// The backend (server.js) verifies handshake.auth.token with Clerk and scopes the
// connection to socket.userId. Realtime is gated by EXPO_PUBLIC_SOCKET_ENABLED and
// requires the backend to run via `node server.js` (not serverless); screens fall
// back to HTTP polling when the socket is unavailable.
import { io, type Socket } from 'socket.io-client';
import { API_URL, SOCKET_ENABLED } from '@/constants';

type TokenGetter = () => Promise<string | null>;

let socket: Socket | null = null;
let tokenGetter: TokenGetter | null = null;

// Registered at startup by the auth bridge (same Clerk getToken used by the API client).
export function setSocketTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

export function getSocket(): Socket | null {
  if (!SOCKET_ENABLED) return null;
  if (socket) return socket;

  socket = io(API_URL, {
    // Function form: re-evaluated on each connection attempt → always a fresh token.
    auth: (cb) => {
      const run = tokenGetter ? tokenGetter() : Promise.resolve(null);
      run.then((token) => cb({ token })).catch(() => cb({ token: null }));
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
