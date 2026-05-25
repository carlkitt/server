const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Get all conversations for authenticated user
 * Only returns conversations where user is a member
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const conversations = await Conversation.find({ members: userId })
      .populate('members', 'name username profilePicture')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'name username profilePicture' }
      })
      .sort({ updatedAt: -1 })
      .lean();

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

    // Validate conversation ID format
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    // Check if user is member of conversation
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

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ message: 'Message too long' });
    }

    // Check if user is member of conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.members.includes(senderId)) {
      return res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
    }

    // Create message
    const message = new Message({
      conversationId,
      senderId,
      text: text.trim(),
      seen: false
    });

    await message.save();
    await message.populate('senderId', 'name username profilePicture');

    // Update conversation
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        lastMessage: message._id,
        updatedAt: new Date()
      },
      { new: true }
    );

    // Broadcast to all users in conversation room via WebSocket
    if (io) {
      const roomClients = io.sockets.adapter.rooms.get(String(conversationId));
      const clientCount = roomClients ? roomClients.size : 0;
      
      console.log(`🔍 Checking room ${conversationId}: ${clientCount} connected clients`);
      
      io.to(String(conversationId)).emit('message:new', {
        _id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        seen: message.seen,
        createdAt: message.createdAt
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
 * Validates that both users exist before creating
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const userId = req.userId;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Don't create conversation with self
    if (userId === otherUserId) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself' });
    }

    // Verify other user exists
    const otherUser = await User.findById(otherUserId).lean();
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if conversation exists
    let conversation = await Conversation.findOne({
      members: { $all: [userId, otherUserId] }
    }).populate('members', 'name username profilePicture');

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        members: [userId, otherUserId]
      });
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
 * Only marks messages where user is the receiver
 */
exports.markMessagesSeen = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.userId;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    // Check if user is member of conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.members.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Mark messages as seen (only messages from other user to this user)
    await Message.updateMany(
      {
        conversationId,
        seen: false,
        senderId: { $ne: userId } // Don't mark own messages as seen
      },
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
 * POST /api/messages/hire
 * Body: { recipientId, initialMessage }
 */
exports.hireUser = async (req, res) => {
  try {
    const { recipientId, initialMessage } = req.body;
    const senderId = req.userId;
    const io = req.io;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: 'Invalid recipient ID' });
    }

    if (!initialMessage || typeof initialMessage !== 'string' || initialMessage.trim().length === 0) {
      return res.status(400).json({ message: 'Initial message required' });
    }

    if (initialMessage.length > 5000) {
      return res.status(400).json({ message: 'Message too long' });
    }

    // Don't hire self
    if (senderId === recipientId) {
      return res.status(400).json({ message: 'Cannot hire yourself' });
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId).lean();
    if (!recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      members: { $all: [senderId, recipientId] }
    });

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        members: [senderId, recipientId]
      });
      await conversation.save();
    }

    // Send initial message
    const message = new Message({
      conversationId: conversation._id,
      senderId,
      text: initialMessage.trim(),
      seen: false
    });

    await message.save();
    await message.populate('senderId', 'name username profilePicture');

    // Update conversation
    await Conversation.findByIdAndUpdate(
      conversation._id,
      {
        lastMessage: message._id,
        updatedAt: new Date()
      }
    );

    // Broadcast to WebSocket if available
    if (io) {
      io.to(String(conversation._id)).emit('message:new', {
        _id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        seen: message.seen,
        createdAt: message.createdAt
      });
    }

    res.status(201).json({
      conversationId: conversation._id,
      message: 'Hire request sent',
      data: {
        conversationId: conversation._id,
        message
      }
    });
  } catch (err) {
    console.error('hireUser error:', err);
    res.status(500).json({ message: 'Failed to send hire request' });
  }
};
