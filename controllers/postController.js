const Post = require('../models/Post');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Function to save base64 image and return URL
const saveBase64Image = (base64String, filename) => {
  try {
    // Remove data URI prefix if present
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving image:', err);
    return null;
  }
};

exports.createPost = async (req, res) => {
  try {
    const { type, content, images, location, skills } = req.body;
    
    // Process images - save base64 images to disk
    const imageUrls = [];
    if (Array.isArray(images) && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const timestamp = Date.now();
        const filename = `post_${req.userId}_${timestamp}_${i}.jpg`;
        const imageUrl = saveBase64Image(images[i], filename);
        if (imageUrl) {
          imageUrls.push(imageUrl);
        }
      }
    }
    
    const skillArray = Array.isArray(skills) ? skills : [];
    const post = new Post({ 
      userId: req.userId, 
      type, 
      content, 
      images: imageUrls,
      skills: skillArray,
      location 
    });
    await post.save();
    
    // Populate user data before sending response
    await post.populate('userId', 'name username avatar email');
    
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.listPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'name username avatar email') // Populate user data
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Like a post
exports.likePost = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.userId;
    const io = req.io;

    if (!postId) {
      return res.status(400).json({ msg: 'Post ID required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Check if user already liked
    if (post.likes.includes(userId)) {
      return res.status(400).json({ msg: 'Already liked' });
    }

    post.likes.push(userId);
    await post.save();

    // Broadcast like event to all connected clients
    if (io) {
      io.emit('post:liked', {
        postId: post._id,
        likes: post.likes.length,
        userId: userId
      });
    }

    res.json({ msg: 'Post liked', likes: post.likes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Unlike a post
exports.unlikePost = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.userId;
    const io = req.io;

    if (!postId) {
      return res.status(400).json({ msg: 'Post ID required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Check if user liked
    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex === -1) {
      return res.status(400).json({ msg: 'Not liked' });
    }

    post.likes.splice(likeIndex, 1);
    await post.save();

    // Broadcast unlike event to all connected clients
    if (io) {
      io.emit('post:unliked', {
        postId: post._id,
        likes: post.likes.length,
        userId: userId
      });
    }

    res.json({ msg: 'Post unliked', likes: post.likes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Comment on a post
exports.commentOnPost = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const { text } = req.body;
    const userId = req.userId;
    const io = req.io;

    if (!postId || !text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ msg: 'Post ID and comment text required' });
    }

    if (text.length > 500) {
      return res.status(400).json({ msg: 'Comment too long' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    const newComment = {
      user: userId,
      text: text.trim(),
      createdAt: new Date()
    };

    post.comments.push(newComment);
    await post.save();
    await post.populate('comments.user', 'name username avatar');

    // Broadcast comment event to all connected clients
    if (io) {
      io.emit('post:commented', {
        postId: post._id,
        comments: post.comments.length,
        userId: userId,
        comment: {
          text: newComment.text,
          createdAt: newComment.createdAt,
          user: { _id: userId }
        }
      });
    }

    res.status(201).json({ msg: 'Comment added', comments: post.comments.length, comment: newComment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get post details with likes/comments
exports.getPost = async (req, res) => {
  try {
    const { id: postId } = req.params;

    const post = await Post.findById(postId)
      .populate('userId', 'name username avatar email')
      .populate('likes', 'name username avatar')
      .populate('comments.user', 'name username avatar');

    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Share post (increment share counter - optional, just for tracking)
exports.sharePost = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.userId;
    const io = req.io;

    if (!postId) {
      return res.status(400).json({ msg: 'Post ID required' });
    }

    const post = await Post.findByIdAndUpdate(
      postId,
      { $inc: { shares: 1 } },
      { new: true }
    );

    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Broadcast share event to all connected clients
    if (io) {
      io.emit('post:shared', {
        postId: post._id,
        shares: post.shares || 0,
        userId: userId
      });
    }

    res.json({ msg: 'Post shared', shares: post.shares || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
