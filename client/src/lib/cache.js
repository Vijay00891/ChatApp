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
    // Save only essential fields needed to render the sidebar instantly
    const minimalRooms = rooms.map((room) => ({
      _id: room._id,
      name: room.name,
      type: room.type,
      unread: room.unread,
      avatar: room.avatar && !room.avatar.startsWith('data:') ? room.avatar : undefined,
      lastMessage: room.lastMessage ? {
        content: room.lastMessage.content && room.lastMessage.content.startsWith('data:') ? '[Image]' : room.lastMessage.content,
        createdAt: room.lastMessage.createdAt,
        senderId: typeof room.lastMessage.senderId === 'object' ? {
          _id: room.lastMessage.senderId?._id,
          name: room.lastMessage.senderId?.name
        } : room.lastMessage.senderId
      } : undefined,
      members: Array.isArray(room.members) ? room.members.map((m) => typeof m === 'object' ? {
        _id: m._id,
        name: m.name
      } : m) : []
    }));
    localStorage.setItem(`nexchat_rooms_${userId}`, JSON.stringify(minimalRooms));
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
    // Only cache the 15 most recent messages and keep only rendering essentials
    const minimalMessages = messages.slice(-15).map((msg) => ({
      _id: msg._id,
      roomId: msg.roomId,
      type: msg.type,
      content: msg.content && msg.content.startsWith('data:') ? '[Image]' : msg.content,
      createdAt: msg.createdAt,
      status: msg.status,
      senderId: typeof msg.senderId === 'object' ? {
        _id: msg.senderId?._id,
        name: msg.senderId?.name,
        avatarColor: msg.senderId?.avatarColor
      } : msg.senderId,
      replyTo: msg.replyTo ? {
        _id: msg.replyTo._id,
        content: msg.replyTo.content,
        type: msg.replyTo.type,
        senderId: typeof msg.replyTo.senderId === 'object' ? {
          name: msg.replyTo.senderId?.name
        } : undefined
      } : undefined
    }));
    localStorage.setItem(`nexchat_msgs_${userId}_${roomId}`, JSON.stringify(minimalMessages));
  } catch (err) {
    console.error('Failed to set cached messages:', err);
  }
};
