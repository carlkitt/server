const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['skill','wanted','announcement','availability','shop','share'], default: 'skill' },
  content: { type: String },
  images: [{ type: String }],
  skills: [{ type: String }],
  location: { type: String },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdAt: { type: Date, default: Date.now }
  }],
  shares: { type: Number, default: 0 },
  // For shared/reposted posts
  sharedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  sharedCaption: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', PostSchema);
