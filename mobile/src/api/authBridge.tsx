// Bridges Clerk's session-token getter into the axios client AND the Socket.IO client,
// so both attach a fresh bearer token per request/connection. Rendered once inside
// <ClerkProvider>. Disconnects the socket on sign-out.
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { setAuthTokenGetter } from './client';
import { disconnectSocket, setSocketTokenGetter } from '@/realtime/socket';

export function ApiAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    // getToken() returns the active session JWT (or null when signed out).
    setAuthTokenGetter(() => getToken());
    setSocketTokenGetter(() => getToken());
    return () => {
      setAuthTokenGetter(null);
      setSocketTokenGetter(null);
    };
  }, [getToken, isLoaded]);

  // Drop the realtime connection when the user signs out.
  useEffect(() => {
    if (isLoaded && !isSignedIn) disconnectSocket();
  }, [isLoaded, isSignedIn]);

  return <>{children}</>;
}
