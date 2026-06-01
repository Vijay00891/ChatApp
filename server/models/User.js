const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    avatar: {
      type: String,
      default: '',
    },
    avatarColor: {
      type: String,
      default: '#1A73E8',
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away'],
      default: 'offline',
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    contacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate initials avatar color based on name
userSchema.pre('save', function (next) {
  if (this.isNew && !this.avatarColor) {
    const colors = [
      '#1A73E8', '#EA4335', '#34A853', '#FBBC04',
      '#9C27B0', '#FF5722', '#009688', '#3F51B5',
      '#E91E63', '#00BCD4', '#FF9800', '#4CAF50',
    ];
    const index = this.name.charCodeAt(0) % colors.length;
    this.avatarColor = colors[index];
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
