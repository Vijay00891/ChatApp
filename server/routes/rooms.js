const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to calculate unread counts using a single aggregation instead of N+1 queries
const addUnreadToRooms = async (rooms, userId) => {
  if (rooms.length === 0) return [];

  const roomIds = rooms.map((r) => r._id);

  // Single aggregation for all unread counts — replaces N separate countDocuments calls
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        roomId: { $in: roomIds },
        senderId: { $ne: userId },
        readBy: { $ne: userId },
      },
    },
    { $group: { _id: '$roomId', count: { $sum: 1 } } },
  ]);

  const unreadMap = new Map(unreadCounts.map((u) => [u._id.toString(), u.count]));

  return rooms.map((room) => ({
    ...(room.toObject ? room.toObject() : room),
    unread: unreadMap.get(room._id.toString()) || 0,
  }));
};

const addUnreadToRoom = async (room, userId) => {
  if (!room) return null;
  const unread = await Message.countDocuments({
    roomId: room._id,
    senderId: { $ne: userId },
    readBy: { $ne: userId },
  });
  return {
    ...(room.toObject ? room.toObject() : room),
    unread,
  };
};

// GET /api/rooms — get all rooms for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id })
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      })
      .sort({ updatedAt: -1 })
      .lean();

    const roomsWithUnread = await addUnreadToRooms(rooms, req.user._id);
    res.json({ rooms: roomsWithUnread });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/rooms/dm — create or get existing DM room
router.post('/dm', authMiddleware, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ message: 'Target user ID is required.' });
    }

    // Check if DM room already exists between these two users
    let room = await Room.findOne({
      type: 'dm',
      members: { $all: [req.user._id, targetUserId], $size: 2 },
    })
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      })
      .lean();

    if (!room) {
      room = await Room.create({
        type: 'dm',
        members: [req.user._id, targetUserId],
      });
      room = await Room.findById(room._id)
        .populate('members', 'name email avatar avatarColor status lastSeen')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: 'name' },
        });
    }

    const roomWithUnread = await addUnreadToRoom(room, req.user._id);
    res.json({ room: roomWithUnread });
  } catch (error) {
    console.error('Create DM error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/rooms/group — create group room
router.post('/group', authMiddleware, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name || !memberIds || memberIds.length < 1) {
      return res.status(400).json({ message: 'Group name and at least one member are required.' });
    }

    const members = [...new Set([req.user._id.toString(), ...memberIds])];

    const room = await Room.create({
      type: 'group',
      name,
      members,
      admins: [req.user._id],
    });

    const populated = await Room.findById(room._id).populate(
      'members',
      'name email avatar avatarColor status lastSeen'
    );

    const roomWithUnread = await addUnreadToRoom(populated, req.user._id);
    res.status(201).json({ room: roomWithUnread });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

const uploadBase64ToCloudinary = async (base64Data) => {
  if (!base64Data || !base64Data.startsWith('data:')) return base64Data;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    console.warn('[Rooms] Cloudinary credentials missing, saving base64 directly');
    return base64Data;
  }

  try {
    const formData = new FormData();
    formData.append('file', base64Data);
    formData.append('upload_preset', uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Cloudinary upload failed');
    return data.secure_url;
  } catch (err) {
    console.error('[Rooms] Cloudinary upload failed, fallback to raw base64:', err.message);
    return base64Data;
  }
};

// PUT /api/rooms/:id — update room (name and/or avatar)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const room = await Room.findOne({ _id: req.params.id, members: req.user._id });
    if (!room) {
      return res.status(404).json({ message: 'Room not found or access denied.' });
    }

    if (name !== undefined) room.name = name;
    if (avatar !== undefined) {
      room.avatar = await uploadBase64ToCloudinary(avatar);
    }

    await room.save();

    const populated = await Room.findById(room._id)
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      });

    const io = req.app.get('io');
    if (io) {
      io.to(room._id.toString()).emit('room_updated', { roomId: room._id.toString() });
    }

    const roomWithUnread = await addUnreadToRoom(populated, req.user._id);
    res.json({ room: roomWithUnread });
  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
// POST /api/rooms/:id/members — add a member to the group (admin only)
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required.' });
    }

    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    if (room.type !== 'group') {
      return res.status(400).json({ message: 'Room is not a group.' });
    }

    // Verify requesting user is admin
    const isAdmin = room.admins.some(adminId => adminId.toString() === req.user._id.toString());
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only group admins can add members.' });
    }

    // Check if user is already a member
    if (room.members.some(memberId => memberId.toString() === userId.toString())) {
      return res.status(400).json({ message: 'User is already a member.' });
    }

    room.members.push(userId);
    await room.save();

    const populated = await Room.findById(room._id)
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      });

    // Notify clients via socket
    const io = req.app.get('io');
    if (io) {
      io.to(room._id.toString()).emit('room_updated', { roomId: room._id.toString() });
    }

    const roomWithUnread = await addUnreadToRoom(populated, req.user._id);
    res.json({ room: roomWithUnread });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/rooms/:id/members/:userId — remove a member from the group (admin only)
router.delete('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    if (room.type !== 'group') {
      return res.status(400).json({ message: 'Room is not a group.' });
    }

    // Verify requesting user is admin
    const isAdmin = room.admins.some(adminId => adminId.toString() === req.user._id.toString());
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only group admins can delete members.' });
    }

    // Remove from members
    room.members = room.members.filter(memberId => memberId.toString() !== userId);
    
    // Also remove from admins if they were an admin
    room.admins = room.admins.filter(adminId => adminId.toString() !== userId);

    await room.save();

    const populated = await Room.findById(room._id)
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      });

    // Notify clients via socket
    const io = req.app.get('io');
    if (io) {
      io.to(room._id.toString()).emit('room_updated', { roomId: room._id.toString() });
    }

    const roomWithUnread = await addUnreadToRoom(populated, req.user._id);
    res.json({ room: roomWithUnread });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/rooms/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findOne({
      _id: req.params.id,
      members: req.user._id,
    })
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      });

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const roomWithUnread = await addUnreadToRoom(room, req.user._id);
    res.json({ room: roomWithUnread });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
