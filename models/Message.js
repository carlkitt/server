const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String },
  attachments: [{ type: String }],
  seen: { type: Boolean, default: false },
  type: { type: String, enum: ['text', 'image', 'request_card'], default: 'text' },
  requestMeta: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
