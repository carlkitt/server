// models/Notification.js — verify your existing model has these fields.
// If it already does, no changes needed.
// The key things needed for the profile-completion feature are:
//   • type includes 'system'
//   • relatedData: Mixed (for storing { kind, completionPercent })

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['like', 'comment', 'share', 'hire', 'follow', 'jobDone', 'review', 'mention', 'system'],
    required: true,
  },
  message:     { type: String, required: true },
  postId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  postSnippet: { type: String, default: null },
  relatedData: { type: mongoose.Schema.Types.Mixed, default: null }, // ← needed for profile_completion kind
  isRead:      { type: Boolean, default: false },
  updatedAt:   { type: Date, default: Date.now },
  createdAt:   { type: Date, default: Date.now },
});

// Index for fast unread lookups
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);