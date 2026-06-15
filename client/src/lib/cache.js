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
    localStorage.setItem(`nexchat_rooms_${userId}`, JSON.stringify(rooms));
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
    // Only cache the 20 most recent messages to prevent storage bloat
    const recentMessages = messages.slice(-20);
    localStorage.setItem(`nexchat_msgs_${userId}_${roomId}`, JSON.stringify(recentMessages));
  } catch (err) {
    console.error('Failed to set cached messages:', err);
  }
};
