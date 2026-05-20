const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');
const PendingDelivery = require('../models/PendingDelivery');

// Map userId -> active socket IDs for presence and reconnect handling
const userSockets = new Map();

function addSocketForUser(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function removeSocketForUser(userId, socketId) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) userSockets.delete(userId);
}

function getUserSocketIds(userId) {
  return Array.from(userSockets.get(userId) || []);
}

function getOnlineUserIds() {
  return Array.from(userSockets.keys());
}

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

    addSocketForUser(userId, socket.id);
    socket.join(userId); // personal room for reliable delivery notifications

    // Update user status to online in DB if this is the first active socket
    if (getUserSocketIds(userId).length === 1) {
      await User.findByIdAndUpdate(userId, { status: 'online' });
      socket.broadcast.emit('user_connected', userId);
    }

    // Send current online users list to the newly connected socket
    socket.emit('online_users', getOnlineUserIds());

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

    // Frontend emits: emit('send_message', { roomId, content, type, replyTo })
    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, type = 'text', replyTo = null } = data;

        const room = await Room.findOne({ _id: roomId, members: userId });
        if (!room) return socket.emit('error', { message: 'Room not found.' });

        const message = await Message.create({
          roomId,
          senderId: userId,
          content,
          type,
          replyTo,
          status: 'sent',
          deliveredTo: [],
        });

        const populated = await Message.findById(message._id)
          .populate('senderId', 'name avatar avatarColor')
          .populate({
            path: 'replyTo',
            select: 'content type senderId',
            populate: { path: 'senderId', select: 'name' }
          });

        // Update room's last message
        await Room.findByIdAndUpdate(roomId, {
          lastMessage: message._id,
          updatedAt: new Date(),
        });

        const recipientIds = room.members
          .map((m) => m.toString())
          .filter((id) => id !== userId);

        const onlineRecipientIds = recipientIds.filter((recipientId) =>
          userSockets.has(recipientId)
        );

        if (onlineRecipientIds.length > 0) {
          await Message.findByIdAndUpdate(message._id, {
            $addToSet: { deliveredTo: { $each: onlineRecipientIds } },
            $set: { deliveredAt: new Date(), status: 'delivered' },
          });
        }

        recipientIds.forEach((recipientId) => {
          io.to(recipientId).emit('new_message', populated);
          io.to(recipientId).emit('room_updated', { roomId });
          if (onlineRecipientIds.includes(recipientId)) {
            io.to(message.senderId.toString()).emit('message_delivered', {
              messageId: message._id,
              roomId,
              userId: recipientId,
            });
          }
        });

        // Notify sender with the saved message object so optimistic UI can reconcile
        socket.emit('new_message', populated);

        // For offline recipients, create pending delivery entries so reconnect sync is efficient
        const offlineRecipientIds = recipientIds.filter((recipientId) => !userSockets.has(recipientId));
        if (offlineRecipientIds.length > 0) {
          try {
            const docs = offlineRecipientIds.map((rid) => ({ recipientId: rid, messageId: message._id }));
            await PendingDelivery.insertMany(docs, { ordered: false });
          } catch (e) {
            // ignore duplicate key errors or other transient insertion errors
          }
        }

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
    socket.on('message_ack', async ({ messageId, roomId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message || message.roomId.toString() !== roomId) return;

        const alreadyAcked = message.deliveredTo?.some(
          (id) => id.toString() === userId
        );
        if (alreadyAcked) return;

        message.deliveredTo = message.deliveredTo || [];
        message.deliveredTo.push(userId);
        message.deliveredAt = new Date();
        if (message.status !== 'read') {
          message.status = 'delivered';
        }
        await message.save();

        io.to(message.senderId.toString()).emit('message_delivered', {
          messageId,
          roomId,
          userId,
        });
      } catch (err) {
        console.error('Message ack error:', err);
      }
    });

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

    // ── react_message ─────────────────────────────────────────────────────────
    socket.on('react_message', async ({ messageId, roomId, emoji }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const existingReactionIndex = message.reactions.findIndex(
          (r) => r.userId.toString() === userId
        );

        if (existingReactionIndex > -1) {
          if (message.reactions[existingReactionIndex].emoji === emoji) {
            // Clicked same emoji -> remove it
            message.reactions.splice(existingReactionIndex, 1);
          } else {
            // Clicked different emoji -> update it
            message.reactions[existingReactionIndex].emoji = emoji;
          }
        } else {
          // Add new reaction
          message.reactions.push({ userId, emoji });
        }

        await message.save();

        io.to(roomId).emit('message_reacted', {
          messageId,
          reactions: message.reactions,
        });
      } catch (err) {
        console.error('React message error:', err);
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.name}`);
      removeSocketForUser(userId, socket.id);
      socket.leave(userId);

      if (getUserSocketIds(userId).length === 0) {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });
        io.emit('user_disconnected', userId);
      }
    });
    // ── WebRTC call events ────────────────────────────────────────────────
    socket.on('call:initiate', ({ receiverId, callType, offer }) => {
      const receiverSocketIds = userSockets.get(receiverId);
      if (!receiverSocketIds || receiverSocketIds.size === 0) {
        socket.emit('call:unavailable', { message: 'User is not online' });
        return;
      }
      
      receiverSocketIds.forEach((socketId) => {
        io.to(socketId).emit('call:incoming', {
          callerId: userId,
          callerName: socket.user.name,
          callerAvatar: socket.user.avatar || null,
          callType,
          offer
        });
      });
    });

    socket.on('call:accept', ({ callerId, answer }) => {
      const callerSocketIds = userSockets.get(callerId);
      if (callerSocketIds && callerSocketIds.size > 0) {
        callerSocketIds.forEach((socketId) => {
          io.to(socketId).emit('call:accepted', { answer });
        });
      }
    });

    socket.on('call:reject', ({ callerId }) => {
      const callerSocketIds = userSockets.get(callerId);
      if (callerSocketIds && callerSocketIds.size > 0) {
        callerSocketIds.forEach((socketId) => {
          io.to(socketId).emit('call:rejected', { rejectedBy: socket.user.name });
        });
      }
    });

    socket.on('call:ice-candidate', ({ targetId, candidate }) => {
      const targetSocketIds = userSockets.get(targetId);
      if (targetSocketIds && targetSocketIds.size > 0) {
        targetSocketIds.forEach((socketId) => {
          io.to(socketId).emit('call:ice-candidate', {
            candidate,
            fromId: userId
          });
        });
      }
    });

    socket.on('call:end', ({ targetId }) => {
      const targetSocketIds = userSockets.get(targetId);
      if (targetSocketIds && targetSocketIds.size > 0) {
        targetSocketIds.forEach((socketId) => {
          io.to(socketId).emit('call:ended', { endedBy: socket.user.name });
        });
      }
    });
    socket.on('request_pending', async () => {
      try {
        // Efficient pending sync: fetch PendingDelivery entries for this user
        const pendings = await PendingDelivery.find({ recipientId: userId }).select('messageId -_id');
        const messageIds = pendings.map((p) => p.messageId).filter(Boolean);
        if (messageIds.length === 0) return;

        const pendingMessages = await Message.find({ _id: { $in: messageIds } })
          .populate('senderId', 'name avatar avatarColor')
          .populate({
            path: 'replyTo',
            select: 'content type senderId',
            populate: { path: 'senderId', select: 'name' },
          })
          .sort({ createdAt: 1 });

        if (pendingMessages.length > 0) {
          socket.emit('pending_messages', { messages: pendingMessages });
        }

        // Remove pending entries that were sent to this socket
        await PendingDelivery.deleteMany({ recipientId: userId, messageId: { $in: messageIds } });
      } catch (err) {
        console.error('Pending message sync error:', err);
      }
    });

    socket.on('sync_room', async ({ roomId, after }) => {
      try {
        const room = await Room.findOne({ _id: roomId, members: userId });
        if (!room) return;

        const query = { roomId, senderId: { $ne: userId } };
        if (after) query.createdAt = { $gt: new Date(after) };

        const missed = await Message.find(query)
          .populate('senderId', 'name avatar avatarColor')
          .populate({
            path: 'replyTo',
            select: 'content type senderId',
            populate: { path: 'senderId', select: 'name' },
          })
          .sort({ createdAt: 1 });

        if (missed.length > 0) {
          socket.emit('room_sync', { roomId, messages: missed });
        }
      } catch (err) {
        console.error('Room sync error:', err);
      }
    });

    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', { timestamp: Date.now() });
    });
  });
};

module.exports = socketHandler;
