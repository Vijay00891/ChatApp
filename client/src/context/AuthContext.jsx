import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, usersAPI, roomsAPI } from '../lib/api';
import {
  saveCurrentUser,
  saveContacts,
  saveRooms,
  getCurrentUser,
  clearAllStores,
} from '../utils/db';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // On mount, verify token and load user profile from IndexedDB first
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setLoading(false);
      return;
    }

    async function initAuth() {
      // 1. Instantly load from IndexedDB to avoid blank screen
      try {
        const localUser = await getCurrentUser();
        if (localUser) {
          setUser(localUser);
        }
      } catch (err) {
        console.error('Failed to load user from IndexedDB:', err);
      }

      // 2. Verify with server in the background
      authAPI
        .getMe()
        .then((res) => {
          const serverUser = res.data.user;
          setUser(serverUser);
          saveCurrentUser(serverUser);
        })
        .catch((err) => {
          console.warn('User profile verification in background failed:', err);
          // Only clear state and redirect to login if it is an explicit auth error
          if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('lastSync');
            setToken(null);
            setUser(null);
            clearAllStores();
          }
        })
        .finally(() => setLoading(false));
    }

    initAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);

    // Pre-populate IndexedDB
    try {
      await saveCurrentUser(u);
      
      const contactsRes = await usersAPI.getContacts();
      const contacts = contactsRes.data.users || [];
      await saveContacts(contacts);

      const roomsRes = await roomsAPI.getAll();
      const rooms = roomsRes.data.rooms || [];
      await saveRooms(rooms);
    } catch (e) {
      console.warn('Failed to pre-populate IndexedDB on login:', e);
    }

    return u;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await authAPI.register({ name, email, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);

    // Pre-populate IndexedDB
    try {
      await saveCurrentUser(u);
      
      const contactsRes = await usersAPI.getContacts();
      const contacts = contactsRes.data.users || [];
      await saveContacts(contacts);

      const roomsRes = await roomsAPI.getAll();
      const rooms = roomsRes.data.rooms || [];
      await saveRooms(rooms);
    } catch (e) {
      console.warn('Failed to pre-populate IndexedDB on register:', e);
    }

    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastSync');
    setToken(null);
    setUser(null);
    clearAllStores();
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => {
      const updated = prev ? { ...prev, ...updates } : null;
      if (updated) {
        saveCurrentUser(updated);
      }
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
