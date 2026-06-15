const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['dm', 'group'],
      required: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    avatar: {
      type: String,
      default: '',
    },
    avatarColor: {
      type: String,
      default: '#1A73E8',
    },
  },
  { timestamps: true }
);

// Index for fast room lookups by member
roomSchema.index({ members: 1 });

module.exports = mongoose.model('Room', roomSchema);
