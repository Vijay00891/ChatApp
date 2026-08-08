const express = require('express');
const router = express.Router();
const Status = require('../models/Status');
const Room = require('../models/Room');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/status - Create a new status
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content, mediaType, mediaUrl, thumbnailUrl, backgroundColor } = req.body;
    
    // Expires exactly 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const status = new Status({
      userId: req.user._id,
      content,
      mediaType,
      mediaUrl,
      thumbnailUrl,
      backgroundColor,
      expiresAt,
    });

    await status.save();
    
    // Broadcast via socket to everyone the user has a DM with
    const rooms = await Room.find({ type: 'dm', members: req.user._id }).select('members');
    const friendIds = new Set();
    rooms.forEach(room => {
      room.members.forEach(m => {
        if (m.toString() !== req.user._id.toString()) {
          friendIds.add(m.toString());
        }
      });
    });

    const io = req.app.get('io');
    if (io) {
      // Emit to self
      io.to(req.user._id.toString()).emit('status_updated', { userId: req.user._id });
      // Emit to all friends
      friendIds.forEach(friendId => {
        io.to(friendId).emit('status_updated', { userId: req.user._id });
      });
    }

    res.status(201).json({ status });
  } catch (error) {
    console.error('Create status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/status - Get statuses for self and friends
router.get('/', authMiddleware, async (req, res) => {
  try {
    // 1. Find all friends (users we have a DM with)
    const rooms = await Room.find({ type: 'dm', members: req.user._id }).select('members');
    const friendIds = new Set();
    rooms.forEach(room => {
      room.members.forEach(m => {
        if (m.toString() !== req.user._id.toString()) {
          friendIds.add(m.toString());
        }
      });
    });

    const relevantUserIds = [req.user._id, ...Array.from(friendIds)];

    // 2. Fetch all unexpired statuses from these users
    const statuses = await Status.find({
      userId: { $in: relevantUserIds },
      expiresAt: { $gt: new Date() }
    })
    .populate('userId', 'name avatar')
    .sort({ createdAt: 1 }) // Sort old to new for viewing order
    .lean();

    // 3. Group by user
    const grouped = {};
    statuses.forEach(s => {
      const uid = s.userId._id.toString();
      if (!grouped[uid]) {
        grouped[uid] = {
          user: s.userId,
          statuses: [],
        };
      }
      grouped[uid].statuses.push(s);
    });

    // Convert object to array for easier frontend rendering
    const responseArray = Object.values(grouped);

    res.json({ statuses: responseArray });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/status/:id/view - Mark a status as viewed
router.post('/:id/view', authMiddleware, async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);
    if (!status) return res.status(404).json({ message: 'Status not found' });

    // Don't view your own status
    if (status.userId.toString() === req.user._id.toString()) {
      return res.json({ success: true });
    }

    if (!status.viewers.includes(req.user._id)) {
      status.viewers.push(req.user._id);
      await status.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('View status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
