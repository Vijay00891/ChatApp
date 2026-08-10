import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import * as SecureStore from 'expo-secure-store';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [lastSeenMap, setLastSeenMap] = useState({});

  // Listeners for components
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
      setTimeout(() => setIsConnected(false), 0);
      return;
    }

    const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'https://chatapp-lewz.onrender.com';
    
    // We get the token dynamically, or we already have it in the Auth context
    const socket = io(SERVER_URL, {
      auth: { token: token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('request_pending');
      socket.emit('get_online_users');
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('online_users_list', (users) => {
      setOnlineUsers(users);
    });

    socket.on('user_online', ({ userId }) => {
      setOnlineUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    });

    socket.on('user_offline', ({ userId, lastSeen }) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== userId));
      setLastSeenMap((prev) => ({ ...prev, [userId]: lastSeen }));
    });

    // Forward events to registered listeners
    const forwardedEvents = [
      'new_message',
      'message_delivered',
      'message_read',
      'typing_start',
      'typing_stop',
      'room_updated',
      'pending_messages',
      'room_sync',
      'reaction_update',
    ];

    forwardedEvents.forEach((eventName) => {
      socket.on(eventName, (payload) => {
        const handlers = listeners.current[eventName];
        if (handlers) {
          Object.values(handlers).forEach((handler) => handler(payload));
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  const isUserOnline = useCallback((id) => {
    return onlineUsers.includes(id);
  }, [onlineUsers]);

  const getUserLastSeen = useCallback((id) => {
    return lastSeenMap[id] || null;
  }, [lastSeenMap]);

  return (
    <SocketContext.Provider
      value={{
        get socket() { return socketRef.current; },
        isConnected,
        onlineUsers,
        isUserOnline,
        getUserLastSeen,
        emit,
        on,
        off,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
