const Post = require('../models/Post');
const { uploadBase64Image } = require('../config/cloudinary');

exports.createPost = async (req, res) => {
  try {
    const { type, content, images, location, skills } = req.body;
    
    // Process images - upload base64 images to Cloudinary
    const imageUrls = [];
    if (Array.isArray(images) && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const timestamp = Date.now();
        const filename = `post_${req.userId}_${timestamp}_${i}`;
        // Remove data URI prefix if present
        const base64Data = images[i].replace(/^data:image\/\w+;base64,/, '');
        const imageUrl = await uploadBase64Image(base64Data, filename);
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
    const userId = req.userId; // Current user ID (can be null for unauthenticated)
    const posts = await Post.find()
      .populate('userId', 'name username avatar email') // Populate user data
      .sort({ createdAt: -1 })
      .limit(50);
    
    // Add 'liked' field to each post indicating if current user has liked it
    const postsWithLiked = posts.map(post => {
      const postObj = post.toObject();
      postObj.liked = userId ? post.likes.includes(userId) : false;
      postObj.likes = post.likes.length; // Convert likes array to count
      postObj.comments = post.comments.length; // Convert comments array to count
      return postObj;
    });
    
    res.json(postsWithLiked);
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
    const userId = req.userId;

    const post = await Post.findById(postId)
      .populate('userId', 'name username avatar email')
      .populate('likes', 'name username avatar')
      .populate('comments.user', 'name username avatar');

    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Add liked flag for current user
    const postObj = post.toObject();
    postObj.liked = userId ? post.likes.includes(userId) : false;

    res.json(postObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get all comments for a post with pagination
exports.getComments = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!postId) {
      return res.status(400).json({ msg: 'Post ID required' });
    }

    const post = await Post.findById(postId)
      .populate({
        path: 'comments.user',
        select: 'name username avatar _id'
      });

    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Reverse comments so newest appear first, then paginate
    const reversedComments = [...post.comments].reverse();
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedComments = reversedComments.slice(startIndex, endIndex);

    res.json({
      comments: paginatedComments,
      total: post.comments.length,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(post.comments.length / parseInt(limit))
    });
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

// Edit a comment
exports.editComment = async (req, res) => {
  try {
    const { id: postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.userId;
    const io = req.io;

    if (!postId || !commentId) {
      return res.status(400).json({ msg: 'Post ID and comment ID required' });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ msg: 'Comment text required' });
    }

    if (text.length > 500) {
      return res.status(400).json({ msg: 'Comment too long' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Find the comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ msg: 'Comment not found' });
    }

    // Verify user owns the comment
    if (comment.user.toString() !== userId) {
      return res.status(403).json({ msg: 'Not authorized to edit this comment' });
    }

    // Update comment text
    comment.text = text.trim();
    await post.save();
    await post.populate('comments.user', 'name username avatar');

    // Broadcast edit event
    if (io) {
      io.emit('comment:edited', {
        postId: post._id,
        commentId: commentId,
        text: text.trim(),
        userId: userId
      });
    }

    res.json({ msg: 'Comment edited', comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Delete a comment
exports.deleteComment = async (req, res) => {
  try {
    const { id: postId, commentId } = req.params;
    const userId = req.userId;
    const io = req.io;

    if (!postId || !commentId) {
      return res.status(400).json({ msg: 'Post ID and comment ID required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    // Find the comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ msg: 'Comment not found' });
    }

    // Verify user owns the comment
    if (comment.user.toString() !== userId) {
      return res.status(403).json({ msg: 'Not authorized to delete this comment' });
    }

    // Delete comment
    post.comments.id(commentId).deleteOne();
    await post.save();

    // Broadcast delete event
    if (io) {
      io.emit('comment:deleted', {
        postId: post._id,
        commentId: commentId,
        userId: userId,
        commentCount: post.comments.length
      });
    }

    res.json({ msg: 'Comment deleted', commentCount: post.comments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
