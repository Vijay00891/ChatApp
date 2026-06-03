import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { useOffline } from '../context/OfflineContext';

export default function OfflineBar() {
  const { isOnline, syncStatus, outboxCount, setSyncStatus } = useOffline();
  const [visible, setVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Show bar if we are offline, or if we are syncing/synced
    if (!isOnline || syncStatus === 'syncing' || syncStatus === 'synced') {
      setShouldRender(true);
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncStatus]);

  // Auto-hide the "synced" message after 3 seconds
  useEffect(() => {
    if (syncStatus === 'synced') {
      const timer = setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus, setSyncStatus]);

  if (!shouldRender) return null;

  let bg = '#F28B00'; // Amber for offline
  let icon = <WifiOff size={14} className="shrink-0" />;
  let text = "You're offline — showing cached messages";

  if (isOnline) {
    if (syncStatus === 'syncing') {
      bg = '#1A73E8'; // Blue for syncing
      icon = <RefreshCw size={14} className="animate-spin shrink-0" />;
      text = "Syncing messages...";
    } else if (syncStatus === 'synced') {
      bg = '#188038'; // Green for synced
      icon = <CheckCircle size={14} className="shrink-0" />;
      text = "All messages synced";
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Main Bar */}
      <div
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-xs font-medium"
        style={{
          backgroundColor: bg,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        }}
      >
        {icon}
        <span>{text}</span>
      </div>

      {/* Outbox Pending Info */}
      {!isOnline && outboxCount > 0 && (
        <div
          className="bg-black/85 text-white text-[10px] px-3 py-1.5 rounded-b-md shadow-md font-medium"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {outboxCount} {outboxCount === 1 ? 'message' : 'messages'} will send when you're back online
        </div>
      )}
    </div>
  );
}
