import { openDB } from 'idb';

const DB_NAME = 'chatapp_db';
const DB_VERSION = 1;

let dbPromise = null;

async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: '_id' });
          messageStore.createIndex('roomId', 'roomId', { unique: false });
          messageStore.createIndex('createdAt', 'createdAt', { unique: false });
          messageStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains('rooms')) {
          const roomStore = db.createObjectStore('rooms', { keyPath: '_id' });
          roomStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: '_id' });
        }

        if (!db.objectStoreNames.contains('currentUser')) {
          db.createObjectStore('currentUser', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'tempId' });
          outboxStore.createIndex('roomId', 'roomId', { unique: false });
          outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// Helper to wrap DB operations in try/catch to ensure reliability
async function safeDbOp(opFn, fallback = null) {
  try {
    return await opFn();
  } catch (error) {
    console.error('IndexedDB Error:', error);
    return fallback;
  }
}

// --- MESSAGES ---

export async function saveMessage(message) {
  return safeDbOp(async () => {
    const db = await initDB();
    await db.put('messages', message);
    return message;
  });
}

export async function saveMessages(messagesArray) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('messages', 'readwrite');
    for (const message of messagesArray) {
      await tx.store.put(message);
    }
    await tx.done;
    return messagesArray;
  });
}

export async function getMessagesByRoom(roomId) {
  return safeDbOp(async () => {
    const db = await initDB();
    const index = db.transaction('messages').store.index('roomId');
    const messages = await index.getAll(roomId);
    return messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, []);
}

export async function updateMessageStatus(_id, status) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('messages', 'readwrite');
    const message = await tx.store.get(_id);
    if (message) {
      message.status = status;
      await tx.store.put(message);
    }
    await tx.done;
  });
}

export async function replaceOptimisticMessage(tempId, realMessage) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('messages', 'readwrite');
    await tx.store.delete(tempId);
    await tx.store.put(realMessage);
    await tx.done;
  });
}

// --- ROOMS ---

export async function saveRoom(room) {
  return safeDbOp(async () => {
    const db = await initDB();
    await db.put('rooms', room);
    return room;
  });
}

export async function saveRooms(roomsArray) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('rooms', 'readwrite');
    for (const room of roomsArray) {
      await tx.store.put(room);
    }
    await tx.done;
    return roomsArray;
  });
}

export async function getAllRooms() {
  return safeDbOp(async () => {
    const db = await initDB();
    const rooms = await db.getAll('rooms');
    return rooms.sort((a, b) => {
      const aTime = a.lastMessageTime 
        ? new Date(a.lastMessageTime).getTime() 
        : a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.lastMessageTime 
        ? new Date(b.lastMessageTime).getTime() 
        : b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, []);
}

export async function updateRoomLastMessage(roomId, lastMessage, timestamp) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('rooms', 'readwrite');
    const room = await tx.store.get(roomId);
    if (room) {
      room.lastMessage = typeof lastMessage === 'object' && lastMessage !== null
        ? lastMessage
        : { content: lastMessage, createdAt: new Date(timestamp).toISOString() };
      room.lastMessageTime = timestamp;
      room.updatedAt = new Date(timestamp).toISOString();
      await tx.store.put(room);
    }
    await tx.done;
  });
}

export async function incrementUnreadCount(roomId) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('rooms', 'readwrite');
    const room = await tx.store.get(roomId);
    if (room) {
      room.unread = (room.unread || 0) + 1;
      await tx.store.put(room);
    }
    await tx.done;
  });
}

export async function clearUnreadCount(roomId) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('rooms', 'readwrite');
    const room = await tx.store.get(roomId);
    if (room) {
      room.unread = 0;
      await tx.store.put(room);
    }
    await tx.done;
  });
}

// --- CONTACTS ---

export async function saveContact(contact) {
  return safeDbOp(async () => {
    const db = await initDB();
    await db.put('contacts', contact);
    return contact;
  });
}

export async function saveContacts(contactsArray) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('contacts', 'readwrite');
    for (const contact of contactsArray) {
      await tx.store.put(contact);
    }
    await tx.done;
    return contactsArray;
  });
}

export async function getAllContacts() {
  return safeDbOp(async () => {
    const db = await initDB();
    return await db.getAll('contacts');
  }, []);
}

export async function getContact(userId) {
  return safeDbOp(async () => {
    const db = await initDB();
    return await db.get('contacts', userId);
  });
}

export async function updateContactStatus(userId, status, lastSeen = null) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('contacts', 'readwrite');
    const contact = await tx.store.get(userId);
    if (contact) {
      contact.status = status;
      if (lastSeen) {
        contact.lastSeen = lastSeen;
      }
      await tx.store.put(contact);
    }
    await tx.done;
  });
}

// --- CURRENT USER ---

export async function saveCurrentUser(user) {
  return safeDbOp(async () => {
    const db = await initDB();
    const record = { id: 'me', ...user };
    await db.put('currentUser', record);
    return record;
  });
}

export async function getCurrentUser() {
  return safeDbOp(async () => {
    const db = await initDB();
    const res = await db.get('currentUser', 'me');
    return res || null;
  }, null);
}

// --- OUTBOX ---

export async function addToOutbox(message) {
  return safeDbOp(async () => {
    const db = await initDB();
    const tempId = message.tempId || crypto.randomUUID();
    const outboxMessage = {
      tempId,
      roomId: message.roomId,
      senderId: message.senderId,
      content: message.content,
      iv: message.iv || null,
      plaintext: message.plaintext || message.content,
      createdAt: message.createdAt || Date.now(),
    };
    await db.put('outbox', outboxMessage);
    return tempId;
  });
}

export async function getOutbox() {
  return safeDbOp(async () => {
    const db = await initDB();
    const outbox = await db.getAll('outbox');
    return outbox.sort((a, b) => a.createdAt - b.createdAt);
  }, []);
}

export async function removeFromOutbox(tempId) {
  return safeDbOp(async () => {
    const db = await initDB();
    await db.delete('outbox', tempId);
  });
}

export async function clearOutbox() {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction('outbox', 'readwrite');
    await tx.store.clear();
    await tx.done;
  });
}

// --- SYNC METADATA ---

export async function getLastSyncTime() {
  const syncTime = localStorage.getItem('lastSync');
  return syncTime ? Number(syncTime) : 0;
}

export async function setLastSyncTime() {
  localStorage.setItem('lastSync', String(Date.now()));
}

// --- CLEAR DATABASE (on Logout) ---

export async function clearAllStores() {
  return safeDbOp(async () => {
    const db = await initDB();
    const tx = db.transaction(['messages', 'rooms', 'contacts', 'currentUser', 'outbox'], 'readwrite');
    await tx.objectStore('messages').clear();
    await tx.objectStore('rooms').clear();
    await tx.objectStore('contacts').clear();
    await tx.objectStore('currentUser').clear();
    await tx.objectStore('outbox').clear();
    await tx.done;
  });
}
