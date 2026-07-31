import { openDB } from 'idb';

const DB_NAME = 'NexChatDB';
const DB_VERSION = 1;

// Initialize the database
const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('rooms')) {
        db.createObjectStore('rooms');
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages');
      }
    },
  });
};

export const getCachedRooms = async (userId) => {
  if (!userId) return [];
  try {
    const db = await initDB();
    const data = await db.get('rooms', userId);
    return data || [];
  } catch (err) {
    console.error('Failed to get cached rooms from IndexedDB:', err);
    return [];
  }
};

export const setCachedRooms = async (userId, rooms) => {
  if (!userId) return;
  try {
    const db = await initDB();
    // With IndexedDB we have plenty of space, we can store the whole array
    await db.put('rooms', rooms, userId);
  } catch (err) {
    console.error('Failed to set cached rooms in IndexedDB:', err);
  }
};

export const getCachedMessages = async (userId, roomId) => {
  if (!userId || !roomId) return [];
  try {
    const db = await initDB();
    const data = await db.get('messages', `${userId}_${roomId}`);
    return data || [];
  } catch (err) {
    console.error('Failed to get cached messages from IndexedDB:', err);
    return [];
  }
};

export const setCachedMessages = async (userId, roomId, messages) => {
  if (!userId || !roomId) return;
  try {
    const db = await initDB();
    // Cache the most recent 100 messages instead of just 15, since space is not an issue
    const recentMessages = messages.slice(-100);
    await db.put('messages', recentMessages, `${userId}_${roomId}`);
  } catch (err) {
    console.error('Failed to set cached messages in IndexedDB:', err);
  }
};
