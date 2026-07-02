// Hook to join a Socket.IO room and subscribe to its events for the lifetime of a
// screen. Re-emits the join on every (re)connect, and leaves + unsubscribes on unmount.
// No-op when realtime is disabled/unavailable — callers should also poll as a fallback.
import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

type Handlers = Record<string, (payload: any) => void>;

export function useRealtimeRoom(opts: {
  join?: { event: string; arg?: unknown };
  leave?: { event: string; arg?: unknown };
  handlers: Handlers;
  enabled?: boolean;
}) {
  const { join, leave, handlers, enabled = true } = opts;

  // Keep latest handlers in a ref so re-renders don't re-subscribe.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  // Freeze the event-name set on first run (stable across the screen's life).
  const eventNamesRef = useRef(Object.keys(handlers));

  const joinArgKey = JSON.stringify(join?.arg ?? null);

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;

    const doJoin = () => {
      if (join) socket.emit(join.event, join.arg);
    };
    if (socket.connected) doJoin();
    socket.on('connect', doJoin);

    const listeners: Record<string, (p: any) => void> = {};
    for (const evt of eventNamesRef.current) {
      const fn = (payload: any) => handlersRef.current[evt]?.(payload);
      listeners[evt] = fn;
      socket.on(evt, fn);
    }

    return () => {
      socket.off('connect', doJoin);
      for (const evt of Object.keys(listeners)) socket.off(evt, listeners[evt]);
      if (leave) socket.emit(leave.event, leave.arg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, join?.event, joinArgKey, leave?.event]);
}
