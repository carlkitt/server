const Post = require('../models/Post');
const { uploadBase64Image } = require('../config/cloudinary');
const notificationController = require('./notificationController');

// Helper function for debug logging
const debugLog = (message) => console.log(message);

exports.createPost = async (req, res) => {
  try {
    const { type, content, images, location, skills } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ msg: 'Content is required' });
    }
    
    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ msg: 'At least one skill tag is required' });
    }
    
    if ((type === 'shop' || type === 'wanted') && !location) {
      return res.status(400).json({ msg: 'Location is required for this post type' });
    }
    
    console.log(`📝 Creating ${type} post for user: ${req.userId}`);
    
    const imageUrls = [];
    if (Array.isArray(images) && images.length > 0) {
      console.log(`   Uploading ${images.length} image(s)`);
      for (let i = 0; i < images.length; i++) {
        const timestamp = Date.now();
        const filename = `post_${req.userId}_${timestamp}_${i}`;
        const base64Data = images[i].replace(/^data:image\/\w+;base64,/, '');
        const uploadResult = await uploadBase64Image(base64Data, filename);
        // Extract secure_url from the result object
        const imageUrl = uploadResult?.secure_url || uploadResult;
        if (imageUrl && typeof imageUrl === 'string') {
          imageUrls.push(imageUrl);
          console.log(`   ✅ Image ${i + 1} uploaded: ${imageUrl.substring(0, 50)}...`);
        } else {
          console.warn(`   ⚠️  Image ${i + 1} upload returned invalid URL:`, uploadResult);
        }
      }
    }
    
    const skillArray = Array.isArray(skills) ? skills : [];
    const post = new Post({ 
      userId: req.userId, 
      type: type || 'skill', 
      content, 
      images: imageUrls,
      skills: skillArray,
      location 
    });
    await post.save();
    
    await post.populate('userId', 'name username avatar profilePicture coverPhoto email');
    
    console.log(`✅ Post created: ${post._id} (type: ${post.type}, skills: ${skillArray.join(', ')})`);
    res.status(201).json(post);
  } catch (err) {
    console.error('❌ Create post error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.listPosts = async (req, res) => {
  try {
    const userId = req.userId;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2;
    const skip = (page - 1) * limit;
    
    debugLog(`📄 Fetching posts: page=${page}, limit=${limit}, skip=${skip}`);
    
    const posts = await Post.find()
      .populate('userId', 'name username avatar profilePicture coverPhoto email')
      // ── FIX: nested populate so sharedFrom.userId is fully resolved ──────
      // Chaining .populate('sharedFrom.userId', ...) as a separate call does
      // NOT work in Mongoose — it silently no-ops. The correct approach is to
      // pass a `populate` option *inside* the sharedFrom populate descriptor.
      .populate({
        path: 'sharedFrom',
        select: 'userId type content images skills location likes comments shares createdAt sharedCaption',
        populate: {
          path: 'userId',
          select: 'name username avatar profilePicture coverPhoto',
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    debugLog(`✅ Found ${posts.length} posts for page ${page}`);
    
    const postsWithLiked = posts.map(post => {
      const postObj = post.toObject();
      postObj.liked = userId ? post.likes.includes(userId) : false;
      postObj.likes = post.likes.length;
      postObj.comments = post.comments.length;
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

    if (post.likes.includes(userId)) {
      return res.status(400).json({ msg: 'Already liked' });
    }

    post.likes.push(userId);
    await post.save();

    // Create notification
    await notificationController.notifyLike(postId, post.userId, userId);

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

    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex === -1) {
      return res.status(400).json({ msg: 'Not liked' });
    }

    post.likes.splice(likeIndex, 1);
    await post.save();

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
    const { text, parentId } = req.body;
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

    if (parentId) {
      const parentComment = post.comments.id(parentId);
      if (!parentComment) {
        return res.status(404).json({ msg: 'Parent comment not found' });
      }
    }

    const newComment = {
      user: userId,
      text: text.trim(),
      parentId: parentId || null,
      createdAt: new Date()
    };

    post.comments.push(newComment);
    await post.save();
    await post.populate('comments.user', 'name username avatar profilePicture');

    // Create notification
    await notificationController.notifyComment(postId, newComment.text, userId);

    if (io) {
      io.emit('post:commented', {
        postId: post._id,
        comments: post.comments.length,
        userId: userId,
        comment: {
          _id: post.comments[post.comments.length - 1]._id,
          text: newComment.text,
          parentId: newComment.parentId,
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
      .populate('userId', 'name username avatar profilePicture coverPhoto email')
      .populate('likes', 'name username avatar')
      .populate('comments.user', 'name username avatar profilePicture')
      // ── FIX: same nested populate fix as listPosts ────────────────────────
      .populate({
        path: 'sharedFrom',
        select: 'userId type content images skills location likes comments shares createdAt sharedCaption',
        populate: {
          path: 'userId',
          select: 'name username avatar profilePicture coverPhoto',
        },
      });

    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

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
        select: 'name username avatar profilePicture _id'
      });

    if (!post) {
      return res.status(404).json({ msg: 'Post not found' });
    }

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

// Share post
exports.sharePost = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const { caption } = req.body;
    const userId = req.userId;
    const io = req.io;

    if (!postId) {
      return res.status(400).json({ msg: 'Post ID required' });
    }

    const originalPost = await Post.findById(postId)
      .populate('userId', 'name username avatar profilePicture coverPhoto email');
    if (!originalPost) {
      return res.status(404).json({ msg: 'Post not found' });
    }

    await Post.findByIdAndUpdate(postId, { $inc: { shares: 1 } }, { new: true });

    const trimmedCaption = caption && caption.trim() ? caption.trim() : null;

    const sharedPost = new Post({
      userId: userId,
      type: 'share',
      content: trimmedCaption || '',   // keep content in sync (some clients read it)
      sharedFrom: postId,
      sharedCaption: trimmedCaption,   // the dedicated caption field
      images: [],   // don't copy images — they live on the original post via sharedFrom
      skills: [],   // don't copy skills — same reason
      location: null
    });

    await sharedPost.save();

    // Populate with nested userId so the response mirrors what listPosts returns
    await sharedPost.populate('userId', 'name username avatar profilePicture');
    await sharedPost.populate({
      path: 'sharedFrom',
      select: 'userId type content images skills location likes comments shares createdAt sharedCaption',
      populate: {
        path: 'userId',
        select: 'name username avatar profilePicture coverPhoto',
      },
    });

    console.log(`📤 Post ${postId} shared by ${userId}`);
    console.log(`   New share post: ${sharedPost._id}`);
    console.log(`   Caption: "${trimmedCaption || '(none)'}"`);

    if (io) {
      io.emit('post:shared', {
        originalPostId: postId,
        sharedPostId: sharedPost._id,
        userId: userId,
        caption: trimmedCaption || null,
        timestamp: new Date()
      });
    }

    res.json({ 
      msg: 'Post shared successfully',
      sharedPost: sharedPost,
      originalShares: originalPost.shares + 1
    });
  } catch (err) {
    console.error('❌ Share post error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
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

    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ msg: 'Comment not found' });
    }

    if (comment.user.toString() !== userId) {
      return res.status(403).json({ msg: 'Not authorized to edit this comment' });
    }

    comment.text = text.trim();
    await post.save();
    await post.populate('comments.user', 'name username avatar');

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

    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ msg: 'Comment not found' });
    }

    if (comment.user.toString() !== userId) {
      return res.status(403).json({ msg: 'Not authorized to delete this comment' });
    }

    post.comments.id(commentId).deleteOne();
    await post.save();

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

// Delete a post
exports.deletePost = async (req, res) => {
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

    // Check authorization - only post owner can delete
    if (post.userId.toString() !== userId) {
      return res.status(403).json({ msg: 'Not authorized to delete this post' });
    }

    // Delete the post
    await Post.findByIdAndDelete(postId);

    console.log(`🗑️ Post ${postId} deleted by user ${userId}`);

    if (io) {
      io.emit('post:deleted', {
        postId: postId,
        userId: userId,
        timestamp: new Date()
      });
    }

    res.json({ msg: 'Post deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};