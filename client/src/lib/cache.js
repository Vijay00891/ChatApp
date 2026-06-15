export const getCachedRooms = (userId) => {
  if (!userId) return [];
  try {
    const data = localStorage.getItem(`nexchat_rooms_${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to get cached rooms:', err);
    return [];
  }
};

export const setCachedRooms = (userId, rooms) => {
  if (!userId) return;
  try {
    // Strip out large base64 image data to prevent QuotaExceededError
    const cleanedRooms = rooms.map((room) => {
      const cleaned = { ...room };
      if (cleaned.avatar && cleaned.avatar.startsWith('data:image/')) {
        delete cleaned.avatar; // Skip caching base64 avatars (they will load from network/state)
      }
      return cleaned;
    });
    localStorage.setItem(`nexchat_rooms_${userId}`, JSON.stringify(cleanedRooms));
  } catch (err) {
    console.error('Failed to set cached rooms:', err);
  }
};

export const getCachedMessages = (userId, roomId) => {
  if (!userId || !roomId) return [];
  try {
    const data = localStorage.getItem(`nexchat_msgs_${userId}_${roomId}`);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to get cached messages:', err);
    return [];
  }
};

export const setCachedMessages = (userId, roomId, messages) => {
  if (!userId || !roomId) return;
  try {
    // Only cache the 20 most recent messages, and strip any heavy base64 strings
    const recentMessages = messages.slice(-20).map((msg) => {
      const cleaned = { ...msg };
      if (cleaned.content && cleaned.content.startsWith('data:')) {
        cleaned.content = '[Image]'; // Placeholder for large base64 image uploads
      }
      if (cleaned.senderId && cleaned.senderId.avatar && cleaned.senderId.avatar.startsWith('data:image/')) {
        cleaned.senderId = { ...cleaned.senderId };
        delete cleaned.senderId.avatar;
      }
      return cleaned;
    });
    localStorage.setItem(`nexchat_msgs_${userId}_${roomId}`, JSON.stringify(recentMessages));
  } catch (err) {
    console.error('Failed to set cached messages:', err);
  }
};
