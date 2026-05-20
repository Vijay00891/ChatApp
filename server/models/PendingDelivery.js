const mongoose = require('mongoose');

const pendingDeliverySchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

pendingDeliverySchema.index({ recipientId: 1, messageId: 1 }, { unique: true });

module.exports = mongoose.model('PendingDelivery', pendingDeliverySchema);
