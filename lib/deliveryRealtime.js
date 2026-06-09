import { getSocketServer } from "@/lib/socketServer";

// Emit a delivery event to one or more Socket.IO rooms. Best-effort: if Socket.IO
// is not running (e.g. NEXT_PUBLIC_SOCKET_ENABLED=false / serverless), this is a no-op
// and clients fall back to polling. Never throws into the calling API route.
export function emitDelivery(rooms, event, payload) {
    try {
        const io = getSocketServer();
        const list = Array.isArray(rooms) ? rooms : [rooms];
        for (const room of list) {
            if (room) io.to(room).emit(event, payload);
        }
    } catch (_) {
        // Socket.IO unavailable — ignore; tracking UIs poll as a fallback.
    }
}
