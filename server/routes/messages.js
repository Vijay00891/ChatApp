const express = require('express');
const Message = require('../models/Message');
const Room = require('../models/Room');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/messages/:roomId?page=1&limit=50
router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verify user is in this room
    const room = await Room.findOne({ _id: roomId, members: req.user._id });
    if (!room) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const messages = await Message.find({ roomId })
      .populate('senderId', 'name avatar avatarColor')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ roomId });

    res.json({
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/messages/read/:roomId — mark messages as read
router.patch('/read/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    await Message.updateMany(
      {
        roomId,
        senderId: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      },
      {
        $addToSet: { readBy: req.user._id },
        $set: { status: 'read' },
      }
    );

    res.json({ message: 'Messages marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
