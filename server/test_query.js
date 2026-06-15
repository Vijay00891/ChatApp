const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './client/.env' });

const Message = require('./models/Message');
const Room = require('./models/Room');
const User = require('./models/User');

const uri = process.env.VITE_SERVER_URL ? process.env.MONGODB_URI : require('dotenv').config({ path: './server/.env' }).parsed.MONGODB_URI;

mongoose.connect(require('dotenv').config({ path: './server/.env' }).parsed.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    
    // Find a room
    const room = await Room.findOne().lean();
    if (!room) {
      console.log('No rooms found');
      process.exit(0);
    }

    console.log('Testing messages query for room:', room._id);

    const start = Date.now();
    const [messages, total] = await Promise.all([
      Message.find({ roomId: room._id })
        .populate('senderId', 'name avatar avatarColor')
        .populate({
          path: 'replyTo',
          select: 'content type senderId',
          populate: { path: 'senderId', select: 'name' }
        })
        .sort({ createdAt: -1 })
        .skip(0)
        .limit(20)
        .lean(),
      Message.countDocuments({ roomId: room._id }),
    ]);
    
    const end = Date.now();
    console.log(`Query took ${end - start}ms`);
    console.log(`Found ${messages.length} messages out of ${total}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
