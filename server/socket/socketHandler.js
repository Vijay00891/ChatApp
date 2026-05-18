const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');

// Map userId -> socketId for online presence tracking
const onlineUsers = new Map();

const socketHandler = (io) => {
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error: no token'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) return next(new Error('Authentication error: user not found'));

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`✅ User connected: ${socket.user.name} (${userId})`);

    // Register user as online
    onlineUsers.set(userId, socket.id);

    // Update user status to online in DB
    await User.findByIdAndUpdate(userId, { status: 'online' });

    // Send current online users list to the newly connected socket
    socket.emit('online_users', Array.from(onlineUsers.keys()));

    // Notify all connected clients of new user
    socket.broadcast.emit('user_connected', userId);

    // ── join_room ─────────────────────────────────────────────────────────────
    // Frontend sends: emit('join_room', roomId)  — plain string
    socket.on('join_room', async (roomId) => {
      try {
        // Accept both plain string and {roomId} object (defensive)
        const id = typeof roomId === 'object' ? roomId.roomId : roomId;
        const room = await Room.findOne({ _id: id, members: userId });
        if (!room) return socket.emit('error', { message: 'Room not found or access denied.' });

        socket.join(id);
        console.log(`📌 ${socket.user.name} joined room: ${id}`);

        // Mark messages as READ for this user since they just opened the chat
        await Message.updateMany(
          { roomId: id, senderId: { $ne: userId }, status: { $in: ['sent', 'delivered'] } },
          { $set: { status: 'read' } }
        );

        // Tell the other person that all messages in this room are now read
        socket.to(id).emit('message_read', { roomId: id });
      } catch (err) {
        console.error('Join room error:', err);
      }
    });

    // ── leave_room ────────────────────────────────────────────────────────────
    socket.on('leave_room', (roomId) => {
      const id = typeof roomId === 'object' ? roomId.roomId : roomId;
      socket.leave(id);
    });

    // ── send_message ──────────────────────────────────────────────────────────
    // Frontend emits: emit('send_message', { roomId, content, type })
    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, type = 'text' } = data;

        const room = await Room.findOne({ _id: roomId, members: userId });
        if (!room) return socket.emit('error', { message: 'Room not found.' });

        const message = await Message.create({
          roomId,
          senderId: userId,
          content,
          type,
          status: 'sent',
        });

        const populated = await Message.findById(message._id).populate(
          'senderId',
          'name avatar avatarColor'
        );

        // Update room's last message
        await Room.findByIdAndUpdate(roomId, {
          lastMessage: message._id,
          updatedAt: new Date(),
        });

        // Check if the other person is currently actively looking at this chat room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const activeUserIds = socketsInRoom
          .map((s) => s.userId)
          .filter((id) => id !== userId);

        if (activeUserIds.length > 0) {
          // They are staring at the chat, mark as read immediately!
          await Message.findByIdAndUpdate(message._id, { status: 'read' });
          populated.status = 'read';
          io.to(roomId).emit('new_message', populated);
        } else {
          // They are not in this room right now. Check if they are online globally on the app
          const peerId = room.members.find(m => m.toString() !== userId)?.toString();
          if (peerId && onlineUsers.has(peerId)) {
            // They are online but on another screen, mark as delivered
            await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
            populated.status = 'delivered';
            io.to(roomId).emit('new_message', populated);
          } else {
            // They are completely offline
            io.to(roomId).emit('new_message', populated);
          }
        }

        // Sidebar refresh
        io.to(roomId).emit('room_updated', { roomId });
      } catch (err) {
        console.error('Send message error:', err);
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    // ── typing events ─────────────────────────────────────────────────────────
    // Frontend emits: 'typing_start' / 'typing_stop'
    socket.on('typing_start', ({ roomId }) => {
      socket.to(roomId).emit('typing_start', {
        userId,
        userName: socket.user.name,
        roomId,
      });
    });

    socket.on('typing_stop', ({ roomId }) => {
      socket.to(roomId).emit('typing_stop', { userId, roomId });
    });

    // ── message_read ──────────────────────────────────────────────────────────
    // Frontend emits: emit('message_read', { messageId, roomId })
    socket.on('message_read', async ({ messageId, roomId }) => {
      try {
        const ids = Array.isArray(messageId) ? messageId : [messageId];
        await Message.updateMany(
          { _id: { $in: ids }, senderId: { $ne: userId } },
          { $addToSet: { readBy: userId }, $set: { status: 'read' } }
        );

        socket.to(roomId).emit('message_read', { roomId, userId, messageId });
      } catch (err) {
        console.error('Message read error:', err);
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.name}`);
      onlineUsers.delete(userId);

      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });

      io.emit('user_disconnected', userId);
    });
  });
};

module.exports = socketHandler;
