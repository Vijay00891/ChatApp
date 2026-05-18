import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Message and typing listeners (stored so chat components can subscribe)
  const listeners = useRef({});

  const on = useCallback((event, id, handler) => {
    if (!listeners.current[event]) listeners.current[event] = {};
    listeners.current[event][id] = handler;
  }, []);

  const off = useCallback((event, id) => {
    if (listeners.current[event]) delete listeners.current[event][id];
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  useEffect(() => {
    if (!token || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
    const socket = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('online_users', (users) => setOnlineUsers(users));
    socket.on('user_connected', (userId) =>
      setOnlineUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
    );
    socket.on('user_disconnected', (userId) =>
      setOnlineUsers((prev) => prev.filter((id) => id !== userId))
    );

    // Forward events to registered listeners
    const forwardedEvents = [
      'new_message',
      'message_delivered',
      'message_read',
      'typing_start',
      'typing_stop',
      'room_updated',
    ];

    forwardedEvents.forEach((event) => {
      socket.on(event, (data) => {
        const eventListeners = listeners.current[event] || {};
        Object.values(eventListeners).forEach((fn) => fn(data));
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user]);

  const isUserOnline = useCallback(
    (userId) => onlineUsers.includes(userId),
    [onlineUsers]
  );

  return (
    <SocketContext.Provider value={{ isConnected, onlineUsers, isUserOnline, on, off, emit }}>
      {children}
    </SocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
