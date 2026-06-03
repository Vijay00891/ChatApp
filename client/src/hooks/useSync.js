import { useEffect } from 'react';
import { useOffline } from '../context/OfflineContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api, { usersAPI } from '../lib/api';
import {
  getOutbox,
  removeFromOutbox,
  getLastSyncTime,
  setLastSyncTime,
  saveMessages,
  updateRoomLastMessage,
  saveContacts,
} from '../utils/db';

export default function useSync() {
  const { isOnline, wasOffline, setWasOffline, setSyncStatus, setOutboxCount } = useOffline();
  const { emit } = useSocket();
  const { token } = useAuth();

  // Trigger sync when coming back online
  useEffect(() => {
    if (isOnline && wasOffline && token) {
      syncAll();
      setWasOffline(false);
    }
  }, [isOnline, wasOffline, token]);

  // Flush outbox on startup if online
  useEffect(() => {
    if (isOnline && token) {
      flushOutbox();
    }
  }, [isOnline, token]);

  async function syncAll() {
    setSyncStatus('syncing');
    try {
      await flushOutbox();
      await syncMissedMessages();
      await syncContacts();
      setSyncStatus('synced');
      // Reset to idle after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to sync:', error);
      setSyncStatus('error');
    }
  }

  async function flushOutbox() {
    const outboxItems = await getOutbox();
    if (!outboxItems || outboxItems.length === 0) {
      setOutboxCount(0);
      return;
    }

    for (const item of outboxItems) {
      emit('send_message', {
        tempId: item.tempId,
        roomId: item.roomId,
        senderId: item.senderId,
        content: item.content,
        iv: item.iv,
        createdAt: item.createdAt,
      });
      await removeFromOutbox(item.tempId);
    }
    setOutboxCount(0);
  }

  async function syncMissedMessages() {
    const lastSyncTime = await getLastSyncTime();
    
    // Fetch from server: GET /api/messages/sync?since={lastSyncTime}
    const res = await api.get(`/messages/sync?since=${lastSyncTime}`);
    const { messages } = res.data;

    if (messages && messages.length > 0) {
      await saveMessages(messages);
      
      // Update each room's last message
      for (const msg of messages) {
        await updateRoomLastMessage(msg.roomId, msg, new Date(msg.createdAt).getTime());
      }
    }
    await setLastSyncTime();
  }

  async function syncContacts() {
    const res = await usersAPI.getContacts();
    const contacts = res.data.users || [];
    await saveContacts(contacts);
  }

  return { syncAll, flushOutbox };
}
