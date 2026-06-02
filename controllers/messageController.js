const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Get all conversations for authenticated user
 * Only returns conversations where user is a member
 * Supports pagination with page and limit query parameters
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Get pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    console.log(`📄 Fetching conversations: page=${page}, limit=${limit}, skip=${skip}`);

    const conversations = await Conversation.find({ members: userId })
      .populate('members', 'name username profilePicture')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name username profilePicture' }
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(`✅ Found ${conversations.length} conversations for page ${page}`);
    res.status(200).json(conversations);
  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

/**
 * Get messages for a conversation
 * User must be a member of the conversation
 */
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.members.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized to view this conversation' });
    }

    const messages = await Message.find({ conversationId })
      .populate('senderId', 'name username profilePicture')
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json(messages);
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

/**
 * Send a message to a conversation
 * User must be a member and provide valid message text
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const senderId = req.userId;
    const io = req.io;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ message: 'Message too long' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.members.includes(senderId)) {
      return res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
    }

    const message = new Message({
      conversationId,
      senderId,
      text: text.trim(),
      seen: false
    });

    await message.save();
    await message.populate('senderId', 'name username profilePicture');

    await Conversation.findByIdAndUpdate(
      conversationId,
      { lastMessage: message._id, updatedAt: new Date() },
      { new: true }
    );

    if (io) {
      const messageData = {
        _id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        seen: message.seen,
        createdAt: message.createdAt
      };

      const roomClients = io.sockets.adapter.rooms.get(String(conversationId));
      const clientCount = roomClients ? roomClients.size : 0;
      console.log(`🔍 Checking room ${conversationId}: ${clientCount} connected clients`);

      // Emit to conversation room (for users currently inside the chat screen)
      io.to(String(conversationId)).emit('message:new', messageData);

      // Also emit to each member's personal user room so they receive
      // the notification even when they have left the conversation screen
      conversation.members.forEach(memberId => {
        const memberIdStr = memberId.toString();
        if (memberIdStr !== String(senderId)) {
          io.to(memberIdStr).emit('message:new', messageData);
          console.log(`📡 Notified member ${memberIdStr} via personal room`);
        }
      });

      console.log(`📡 WebSocket broadcast sent for message in conversation ${conversationId}`);
    } else {
      console.log('⚠️ io not available in request');
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

/**
 * Create or get existing conversation with another user
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (userId === otherUserId) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself' });
    }

    const otherUser = await User.findById(otherUserId).lean();
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    let conversation = await Conversation.findOne({
      members: { $all: [userId, otherUserId] }
    }).populate('members', 'name username profilePicture');

    if (!conversation) {
      conversation = new Conversation({ members: [userId, otherUserId] });
      await conversation.save();
      await conversation.populate('members', 'name username profilePicture');
    }

    res.status(200).json(conversation);
  } catch (err) {
    console.error('getOrCreateConversation error:', err);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
};

/**
 * Mark messages as seen in a conversation
 */
exports.markMessagesSeen = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.members.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Message.updateMany(
      { conversationId, seen: false, senderId: { $ne: userId } },
      { seen: true }
    );

    res.status(200).json({ message: 'Messages marked as seen' });
  } catch (err) {
    console.error('markMessagesSeen error:', err);
    res.status(500).json({ message: 'Failed to mark messages as seen' });
  }
};

/**
 * Hire user - create conversation and send initial message
 */
exports.hireUser = async (req, res) => {
  try {
    const { recipientId, initialMessage } = req.body;
    const senderId = req.userId;
    const io = req.io;

    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: 'Invalid recipient ID' });
    }

    if (!initialMessage || typeof initialMessage !== 'string' || initialMessage.trim().length === 0) {
      return res.status(400).json({ message: 'Initial message required' });
    }

    if (initialMessage.length > 5000) {
      return res.status(400).json({ message: 'Message too long' });
    }

    if (senderId === recipientId) {
      return res.status(400).json({ message: 'Cannot hire yourself' });
    }

    const recipient = await User.findById(recipientId).lean();
    if (!recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    let conversation = await Conversation.findOne({
      members: { $all: [senderId, recipientId] }
    });

    if (!conversation) {
      conversation = new Conversation({ members: [senderId, recipientId] });
      await conversation.save();
    }

    // Get sender details for requestMeta
    const sender = await User.findById(senderId).select('firstName lastName profilePicture');
    const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'User';
    
    // Create message with requestMeta for hire request card
    const message = new Message({
      conversationId: conversation._id,
      senderId,
      text: initialMessage.trim(),
      seen: false,
      type: 'request_card',
      requestMeta: {
        type: 'hired',
        targetName: senderName,
        targetAvatar: sender?.profilePicture || null,
        requestId: conversation._id.toString(),
      }
    });

    await message.save();
    await message.populate('senderId', 'name username profilePicture');

    await Conversation.findByIdAndUpdate(
      conversation._id,
      { lastMessage: message._id, updatedAt: new Date() }
    );

    if (io) {
      const messageData = {
        _id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        seen: message.seen,
        type: message.type,
        requestMeta: message.requestMeta,
        createdAt: message.createdAt
      };

      // Emit to conversation room
      io.to(String(conversation._id)).emit('message:new', messageData);

      // Also emit to each member's personal user room
      conversation.members.forEach(memberId => {
        const memberIdStr = memberId.toString();
        if (memberIdStr !== String(senderId)) {
          io.to(memberIdStr).emit('message:new', messageData);
          console.log(`📡 Notified member ${memberIdStr} via personal room`);
        }
      });
    }

    // Trigger hire notification for recipient
    try {
      const { notifyHire } = require('./notificationController');
      await notifyHire(recipientId, senderId, 'Hire Request');
    } catch (notifError) {
      console.error('Failed to create hire notification:', notifError);
      // Don't fail the entire request if notification fails
    }

    res.status(201).json({
      conversationId: conversation._id,
      message: 'Hire request sent',
      data: { conversationId: conversation._id, message }
    });
  } catch (err) {
    console.error('hireUser error:', err);
    res.status(500).json({ message: 'Failed to send hire request' });
  }
};

// ── Accept hire request ──────────────────────────────────────────────────────
exports.acceptHireRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { hirerUserId } = req.body; // ID of the person who sent the hire request

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Send acceptance notification
    try {
      const { notifyHireAccepted } = require('./notificationController');
      await notifyHireAccepted(hirerUserId, userId, 'Hire Request');
    } catch (notifError) {
      console.error('Failed to create hire accepted notification:', notifError);
    }

    res.status(200).json({ message: 'Hire request accepted' });
  } catch (err) {
    console.error('acceptHireRequest error:', err);
    res.status(500).json({ message: 'Failed to accept hire request' });
  }
};

// ── Decline hire request ─────────────────────────────────────────────────────
exports.declineHireRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { hirerUserId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Send decline notification
    try {
      const { notifyHireDeclined } = require('./notificationController');
      await notifyHireDeclined(hirerUserId, userId, 'Hire Request');
    } catch (notifError) {
      console.error('Failed to create hire declined notification:', notifError);
    }

    res.status(200).json({ message: 'Hire request declined' });
  } catch (err) {
    console.error('declineHireRequest error:', err);
    res.status(500).json({ message: 'Failed to decline hire request' });
  }
};

// ── Accept application request ───────────────────────────────────────────────
exports.acceptApplicationRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { applicantUserId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Send acceptance notification
    try {
      const { notifyApplicationAccepted } = require('./notificationController');
      await notifyApplicationAccepted(applicantUserId, userId, 'Application');
    } catch (notifError) {
      console.error('Failed to create accepted notification:', notifError);
    }

    res.status(200).json({ message: 'Application accepted' });
  } catch (err) {
    console.error('acceptApplicationRequest error:', err);
    res.status(500).json({ message: 'Failed to accept application' });
  }
};

// ── Decline application request ──────────────────────────────────────────────
exports.declineApplicationRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const { applicantUserId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Send decline notification
    try {
      const { notifyApplicationDeclined } = require('./notificationController');
      await notifyApplicationDeclined(applicantUserId, userId, 'Application');
    } catch (notifError) {
      console.error('Failed to create declined notification:', notifError);
    }

    res.status(200).json({ message: 'Application declined' });
  } catch (err) {
    console.error('declineApplicationRequest error:', err);
    res.status(500).json({ message: 'Failed to decline application' });
  }
};