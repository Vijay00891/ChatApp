import { createContext, useContext, useState, useEffect } from 'react';
import { getOutbox } from '../utils/db';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'error'
  const [outboxCount, setOutboxCount] = useState(0);

  // Initialize outbox count from IndexedDB on load
  useEffect(() => {
    async function initOutboxCount() {
      const outbox = await getOutbox();
      if (outbox) {
        setOutboxCount(outbox.length);
      }
    }
    initOutboxCount();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        wasOffline,
        syncStatus,
        outboxCount,
        setSyncStatus,
        setOutboxCount,
        setWasOffline,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
