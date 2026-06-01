const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/rooms — get all rooms for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id })
      .populate('members', 'name email avatar avatarColor status lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name' },
      })
      .sort({ updatedAt: -1 });

    res.json({ rooms });
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
      });

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

    res.json({ room });
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

    res.status(201).json({ room: populated });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/rooms/:id — update room (name and/or avatar)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const room = await Room.findOne({ _id: req.params.id, members: req.user._id });
    if (!room) {
      return res.status(404).json({ message: 'Room not found or access denied.' });
    }

    if (name !== undefined) room.name = name;
    if (avatar !== undefined) room.avatar = avatar;

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

    res.json({ room: populated });
  } catch (error) {
    console.error('Update room error:', error);
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

    res.json({ room });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
