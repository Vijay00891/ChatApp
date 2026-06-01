import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, usersAPI } from '../lib/api';
import { 
  generateKeyPair, 
  exportPublicKey, 
  storePrivateKey, 
  savePublicKeyJWK, 
  getPrivateKey, 
  getPublicKeyJWK, 
  clearKeys, 
  isIndexedDbAvailable 
} from '../utils/crypto';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // On mount, verify token and load user profile
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    authAPI
      .getMe()
      .then((res) => {
        setUser(res.data.user);
        setToken(storedToken);
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const initializeKeys = useCallback(async () => {
    try {
      const existingPrivKey = await getPrivateKey();
      const existingPubJWK = getPublicKeyJWK();
      if (existingPrivKey && existingPubJWK) {
        return; // already initialized
      }
      
      const keyPair = await generateKeyPair();
      const publicJWK = await exportPublicKey(keyPair.publicKey);
      await storePrivateKey(keyPair.privateKey);
      savePublicKeyJWK(publicJWK);
      
      try {
        await usersAPI.uploadPublicKey(publicJWK);
      } catch (err) {
        console.error("Failed to upload public key to server:", err);
        alert("Encryption setup failed, messages may not be encrypted");
      }
      
      if (!isIndexedDbAvailable()) {
        alert("Private key will be lost on tab close (Private browsing detected)");
      }
    } catch (err) {
      console.error("E2EE key initialization failed:", err);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    await initializeKeys();
    return u;
  }, [initializeKeys]);

  const register = useCallback(async (name, email, password) => {
    const res = await authAPI.register({ name, email, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    await initializeKeys();
    return u;
  }, [initializeKeys]);

  const logout = useCallback(() => {
    clearKeys();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
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
