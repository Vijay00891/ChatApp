const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/users/search?q=name
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ users: [] });
    }

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
    })
      .select('name email avatar avatarColor status lastSeen')
      .limit(20);

    res.json({ users });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      'name email avatar avatarColor status lastSeen'
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users — get all users except self (for starting new chats)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('name email avatar avatarColor status lastSeen')
      .limit(50);
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users/contacts
router.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      'contacts',
      'name email avatar avatarColor status lastSeen'
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ users: user.contacts || [] });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/users/contacts/:userId
router.post('/contacts/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot add yourself as contact' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { contacts: userId } },
      { new: true }
    ).populate('contacts', 'name email avatar avatarColor status lastSeen');

    res.json({ users: user.contacts || [] });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
