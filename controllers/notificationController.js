const Notification = require('../models/Notification');
const User = require('../models/User');
const Post = require('../models/Post');

// ── Get all notifications for current user
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    
    const notifications = await Notification.find({ recipientId: req.userId })
      .populate({
        path: 'actorId',
        select: 'name username profilePicture'
      })
      .populate({
        path: 'postId',
        select: 'content images'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Notification.countDocuments({ recipientId: req.userId });
    const unreadCount = await Notification.countDocuments({
      recipientId: req.userId,
      isRead: false
    });

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, msg: 'Failed to fetch notifications' });
  }
};

// ── Get unread notifications
exports.getUnreadNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.userId,
      isRead: false
    })
      .populate({
        path: 'actorId',
        select: 'name username profilePicture'
      })
      .populate({
        path: 'postId',
        select: 'content images'
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error fetching unread notifications:', error);
    res.status(500).json({ success: false, msg: 'Failed to fetch unread notifications' });
  }
};

// ── Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true, updatedAt: Date.now() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, msg: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, msg: 'Failed to mark notification as read' });
  }
};

// ── Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.userId, isRead: false },
      { isRead: true, updatedAt: Date.now() }
    );

    res.json({
      success: true,
      msg: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, msg: 'Failed to mark notifications as read' });
  }
};

// ── Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await Notification.findByIdAndDelete(notificationId);

    if (!result) {
      return res.status(404).json({ success: false, msg: 'Notification not found' });
    }

    res.json({ success: true, msg: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, msg: 'Failed to delete notification' });
  }
};

// ── Delete all notifications
exports.deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ recipientId: req.userId });

    res.json({
      success: true,
      msg: `${result.deletedCount} notifications deleted`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ success: false, msg: 'Failed to delete notifications' });
  }
};

// ── Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipientId: req.userId,
      isRead: false
    });

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ success: false, msg: 'Failed to get unread count' });
  }
};

// ── Internal helper: Create notification
exports.createNotification = async (recipientId, actorId, type, message, postId = null, postSnippet = null, relatedData = null) => {
  try {
    const notification = new Notification({
      recipientId,
      actorId,
      type,
      message,
      postId,
      postSnippet,
      relatedData
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// ── Internal helper: Create like notification
exports.notifyLike = async (postId, userId, actorId) => {
  try {
    const post = await Post.findById(postId).populate('userId', 'name');
    if (!post || post.userId._id.toString() === actorId.toString()) return;

    const actor = await User.findById(actorId, 'name');
    const existingNotification = await Notification.findOne({
      recipientId: post.userId._id,
      type: 'like',
      postId,
      actorId
    });

    if (!existingNotification) {
      await exports.createNotification(
        post.userId._id,
        actorId,
        'like',
        'liked your post.',
        postId,
        post.content.substring(0, 80)
      );
    }
  } catch (error) {
    console.error('Error creating like notification:', error);
  }
};

// ── Internal helper: Create comment notification
exports.notifyComment = async (postId, commentText, actorId) => {
  try {
    const post = await Post.findById(postId).populate('userId', 'name');
    if (!post || post.userId._id.toString() === actorId.toString()) return;

    const actor = await User.findById(actorId, 'name');
    await exports.createNotification(
      post.userId._id,
      actorId,
      'comment',
      'commented on your post:',
      postId,
      commentText.substring(0, 80)
    );
  } catch (error) {
    console.error('Error creating comment notification:', error);
  }
};

// ── Internal helper: Create follow notification
exports.notifyFollow = async (followedUserId, actorId) => {
  try {
    if (followedUserId.toString() === actorId.toString()) return;

    const existingNotification = await Notification.findOne({
      recipientId: followedUserId,
      type: 'follow',
      actorId
    });

    if (!existingNotification) {
      await exports.createNotification(
        followedUserId,
        actorId,
        'follow',
        'started following you.'
      );
    }
  } catch (error) {
    console.error('Error creating follow notification:', error);
  }
};

// ── Internal helper: Create hire notification
exports.notifyHire = async (recipientId, actorId, jobTitle) => {
  try {
    if (recipientId.toString() === actorId.toString()) return;

    await exports.createNotification(
      recipientId,
      actorId,
      'hire',
      'sent you a hire request.',
      null,
      null,
      { jobTitle }
    );
  } catch (error) {
    console.error('Error creating hire notification:', error);
  }
};

// ── Internal helper: Create review notification
exports.notifyReview = async (recipientId, actorId, reviewText, rating) => {
  try {
    if (recipientId.toString() === actorId.toString()) return;

    await exports.createNotification(
      recipientId,
      actorId,
      'review',
      `left you a ${rating}-star review.`,
      null,
      reviewText.substring(0, 80),
      { rating }
    );
  } catch (error) {
    console.error('Error creating review notification:', error);
  }
};

// ── Internal helper: Create system notification
exports.notifySystem = async (recipientId, message) => {
  try {
    const systemUser = await User.findOne({ username: 'system' });
    const systemId = systemUser ? systemUser._id : null;

    await exports.createNotification(
      recipientId,
      systemId || new mongoose.Types.ObjectId('000000000000000000000000'),
      'system',
      message
    );
  } catch (error) {
    console.error('Error creating system notification:', error);
  }
};
