const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/notifications/subscribe
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'Valid subscription object is required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if subscription already exists to avoid duplicates
    const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
    
    if (!exists) {
      user.pushSubscriptions.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys || {}
      });
      await user.save();
    }

    res.status(201).json({ message: 'Subscription saved successfully.' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ message: 'Server error saving subscription.' });
  }
});

// Optional: GET /api/notifications/vapidPublicKey
router.get('/vapidPublicKey', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
