const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');
const PendingDelivery = require('../models/PendingDelivery');

// Map userId -> socketId for presence and reconnect handling
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

    onlineUsers.set(userId, socket.id);
    socket.join(userId); // personal room for reliable delivery notifications

    // Update user status to online in DB
    await User.findByIdAndUpdate(userId, { status: 'online' });
    socket.broadcast.emit('user_online', { userId });

    // ── get_online_users ───────────────────────────────────────────────────────
    socket.on('get_online_users', () => {
      socket.emit('online_users_list', Array.from(onlineUsers.keys()));
    });

    // ── join_room ─────────────────────────────────────────────────────────────
    socket.on('join_room', async (roomId) => {
      try {
        const id = typeof roomId === 'object' ? roomId.roomId : roomId;
        const room = await Room.findOne({ _id: id, members: userId });
        if (!room) return socket.emit('error', { message: 'Room not found or access denied.' });

        socket.join(id);
        console.log(`📌 ${socket.user.name} joined room: ${id}`);

        // Mark messages as READ for this user since they just opened the chat
        await Message.updateMany(
          { roomId: id, senderId: { $ne: userId } },
          { $addToSet: { readBy: userId }, $set: { status: 'read' } }
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

    // Frontend emits: emit('send_message', { roomId, content, type, replyTo, tempId })
    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, type = 'text', replyTo = null, tempId = null } = data;

        const room = await Room.findOne({ _id: roomId, members: userId }).lean();
        if (!room) return socket.emit('error', { message: 'Room not found.' });

        const messageId = new mongoose.Types.ObjectId();
        const createdAt = new Date();

        const recipientIds = room.members
          .map((m) => m.toString())
          .filter((id) => id !== userId);

        const onlineRecipientIds = recipientIds.filter((recipientId) =>
          onlineUsers.has(recipientId)
        );

        // 1. Instantly construct the populated message payload
        const populated = {
          _id: messageId,
          roomId,
          senderId: {
            _id: socket.user._id,
            name: socket.user.name,
            avatar: socket.user.avatar,
            avatarColor: socket.user.avatarColor,
          },
          content,
          type,
          replyTo: replyTo, // client already knows the referenced message, populated on DB retrieval
          status: onlineRecipientIds.length > 0 ? 'delivered' : 'sent',
          deliveredTo: onlineRecipientIds,
          createdAt: createdAt.toISOString(),
          tempId: tempId,
        };

        // 2. IMMEDIATELY deliver to recipients and sender (sub-millisecond latency!)
        recipientIds.forEach((recipientId) => {
          io.to(recipientId).emit('new_message', populated);
          io.to(recipientId).emit('room_updated', { roomId });
          if (onlineRecipientIds.includes(recipientId)) {
            io.to(userId).emit('message_delivered', {
              messageId,
              roomId,
              userId: recipientId,
            });
          }
        });

        socket.emit('new_message', populated);

        // 3. Process DB writes asynchronously in the background
        (async () => {
          try {
            await Message.create({
              _id: messageId,
              roomId,
              senderId: userId,
              content,
              type,
              replyTo,
              status: onlineRecipientIds.length > 0 ? 'delivered' : 'sent',
              deliveredTo: onlineRecipientIds,
              deliveredAt: onlineRecipientIds.length > 0 ? new Date() : null,
              createdAt,
            });

            await Room.findByIdAndUpdate(roomId, {
              lastMessage: messageId,
              updatedAt: new Date(),
            });

            const offlineRecipientIds = recipientIds.filter((rid) => !onlineUsers.has(rid));
            if (offlineRecipientIds.length > 0) {
              const docs = offlineRecipientIds.map((rid) => ({ recipientId: rid, messageId }));
              await PendingDelivery.insertMany(docs, { ordered: false });
            }
          } catch (dbErr) {
            console.error('Async DB write error for message:', dbErr);
          }
        })();
        
        io.to(roomId).emit('room_updated', { roomId });
      } catch (err) {
        console.error('Send message error:', err);
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    // ── typing events ─────────────────────────────────────────────────────────
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

    // ── message_reaction ──────────────────────────────────────────────────────
    socket.on('message_reaction', async ({ messageId, emoji, userId: reactionUserId, roomId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const uId = reactionUserId || userId;

        const existingIndex = message.reactions.findIndex(
          (r) => r.userId.toString() === uId && r.emoji === emoji
        );

        if (existingIndex > -1) {
          message.reactions.splice(existingIndex, 1);
        } else {
          message.reactions.push({
            userId: uId,
            emoji,
            createdAt: new Date()
          });
        }

        await message.save();

        io.to(roomId).emit('reaction_update', {
          messageId,
          reactions: message.reactions,
        });
      } catch (err) {
        console.error('Message reaction error:', err);
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.name}`);
      onlineUsers.delete(userId);
      socket.leave(userId);

      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });
      socket.broadcast.emit('user_offline', { userId, lastSeen });
    });

    // ── WebRTC call events ────────────────────────────────────────────────────
    socket.on('call:initiate', ({ receiverId, callType, offer }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (!receiverSocketId) {
        socket.emit('call:unavailable', { message: 'User is not online' });
        return;
      }
      
      io.to(receiverSocketId).emit('call:incoming', {
        callerId: userId,
        callerName: socket.user.name,
        callerAvatar: socket.user.avatar || null,
        callType,
        offer
      });
    });

    socket.on('call:accept', ({ callerId, answer }) => {
      const callerSocketId = onlineUsers.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:accepted', { answer });
      }
    });

    socket.on('call:reject', ({ callerId }) => {
      const callerSocketId = onlineUsers.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:rejected', { rejectedBy: socket.user.name });
      }
    });

    socket.on('call:ice-candidate', ({ targetId, candidate }) => {
      const targetSocketId = onlineUsers.get(targetId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:ice-candidate', {
          candidate,
          fromId: userId
        });
      }
    });

    socket.on('call:end', ({ targetId }) => {
      const targetSocketId = onlineUsers.get(targetId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:ended', { endedBy: socket.user.name });
      }
    });

    // ── request_pending ───────────────────────────────────────────────────────
    socket.on('request_pending', async () => {
      try {
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

        await PendingDelivery.deleteMany({ recipientId: userId, messageId: { $in: messageIds } });
      } catch (err) {
        console.error('Pending message sync error:', err);
      }
    });

    // ── sync_room ─────────────────────────────────────────────────────────────
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

    // ── heartbeat ─────────────────────────────────────────────────────────────
    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', { timestamp: Date.now() });
    });
  });
};

module.exports = socketHandler;
