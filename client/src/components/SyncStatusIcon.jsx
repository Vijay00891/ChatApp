import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOffline } from '../context/OfflineContext';

export default function SyncStatusIcon() {
  const { isOnline, syncStatus, outboxCount } = useOffline();

  let statusIcon = <Wifi size={16} className="text-success" title="Connected & Synced" />;
  
  if (!isOnline) {
    statusIcon = <WifiOff size={16} className="text-subtle-text" title="Offline mode" />;
  } else if (syncStatus === 'syncing') {
    statusIcon = <RefreshCw size={16} className="text-primary animate-spin" title="Syncing messages..." />;
  } else if (syncStatus === 'synced') {
    statusIcon = <Wifi size={16} className="text-success" title="All messages synced" />;
  } else if (syncStatus === 'error') {
    statusIcon = <Wifi size={16} className="text-error" title="Sync error" />;
  }

  return (
    <div className="relative flex items-center justify-center p-1" style={{ cursor: 'help' }}>
      {statusIcon}
      {outboxCount > 0 && (
        <span 
          className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[9px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center border-2 border-surface shadow-sm"
          title={`${outboxCount} message(s) pending to send`}
        >
          {outboxCount}
        </span>
      )}
    </div>
  );
}
