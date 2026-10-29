import { io, Socket } from 'socket.io-client';
import { API_ORIGIN, getAccessToken } from './api';

let socket: Socket | null = null;

// Connects (or reconnects) the realtime socket using the current access token.
export function connectSocket(): Socket {
  const token = getAccessToken();
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(API_ORIGIN, {
    auth: { token },
    autoConnect: true,
    // Allow polling as a fallback so realtime still works behind proxies /
    // networks that block raw WebSocket upgrades. Socket.io upgrades to WS
    // automatically when possible.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    withCredentials: true,
  });
  // Refresh the auth token on every (re)connection attempt so a rotated
  // access token doesn't break the realtime session.
  socket.on('reconnect_attempt', () => {
    if (socket) socket.auth = { token: getAccessToken() };
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
