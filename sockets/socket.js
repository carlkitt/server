const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

/**
 * WebSocket Socket.IO Server Handler
 * Manages real-time messaging, typing indicators, and online status
 */
module.exports = (io) => {
  // Track online users: userId -> socketId
  const online = new Map();
  // Track user rooms/conversations: userId -> Set of conversationIds
  const userRooms = new Map();

  /**
   * Middleware: Authenticate socket connection with JWT
   */
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      
      if (!token) {
        return next(new Error('No token provided'));
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      
      if (!decoded.userId) {
        return next(new Error('Invalid token format'));
      }

      // Attach user ID to socket for later use
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      console.error('WebSocket auth error:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ WebSocket connection received, socket id: ${socket.id}`);
    console.log(`   User ID: ${socket.userId}`);
    console.log(`   Total connections: ${io.engine.clientsCount}`);

    try {
      // Track online user
      if (socket.userId) {
        online.set(String(socket.userId), socket.id);
        userRooms.set(String(socket.userId), new Set());
        
        console.log(`👤 User ${socket.userId} connected`);
        
        // Broadcast updated online users list
        io.emit('onlineUsers', Array.from(online.keys()));
      }

      /**
       * Join conversation room
       * Allows user to receive real-time messages for this conversation
       */
      socket.on('joinConversation', async (data) => {
        try {
          const { conversationId } = data;
          const userId = socket.userId;

          console.log(`🚪 joinConversation event received`);
          console.log(`   conversationId: ${conversationId}`);
          console.log(`   userId: ${userId}`);

          // Validate input
          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            console.log('❌ Invalid conversation ID');
            return socket.emit('error', { message: 'Invalid conversation ID' });
          }

          // Verify user is member of conversation
          const conversation = await Conversation.findById(conversationId);
          if (!conversation) {
            console.log('❌ Conversation not found');
            return socket.emit('error', { message: 'Conversation not found' });
          }

          if (!conversation.members.includes(userId)) {
            console.log('❌ User not authorized to join this conversation');
            return socket.emit('error', { message: 'Not authorized to join this conversation' });
          }

          // Join room
          socket.join(String(conversationId));
          const rooms = userRooms.get(String(userId)) || new Set();
          rooms.add(String(conversationId));
          userRooms.set(String(userId), rooms);

          console.log(`✅ User ${userId} successfully joined conversation ${conversationId}`);
          console.log(`   Clients in room now: ${io.sockets.adapter.rooms.get(String(conversationId))?.size || 0}`);
          socket.emit('joinedConversation', { conversationId });
        } catch (err) {
          console.error('joinConversation error:', err);
          socket.emit('error', { message: 'Failed to join conversation' });
        }
      });

      /**
       * Leave conversation room
       */
      socket.on('leaveConversation', (data) => {
        try {
          const { conversationId } = data;
          const userId = socket.userId;

          if (!conversationId) return;

          socket.leave(String(conversationId));
          const rooms = userRooms.get(String(userId));
          if (rooms) {
            rooms.delete(String(conversationId));
          }

          console.log(`User ${userId} left conversation ${conversationId}`);
          socket.emit('leftConversation', { conversationId });
        } catch (err) {
          console.error('leaveConversation error:', err);
        }
      });

      /**
       * Send message in real-time
       * Validates user is conversation member before broadcasting
       */
      socket.on('sendMessage', async (data) => {
        try {
          const { conversationId, text } = data;
          const senderId = socket.userId;

          // Validate input
          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return socket.emit('error', { message: 'Invalid conversation ID' });
          }

          if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return socket.emit('error', { message: 'Message cannot be empty' });
          }

          if (text.length > 5000) {
            return socket.emit('error', { message: 'Message too long' });
          }

          // Verify user is member of conversation
          const conversation = await Conversation.findById(conversationId);
          if (!conversation) {
            return socket.emit('error', { message: 'Conversation not found' });
          }

          if (!conversation.members.includes(senderId)) {
            return socket.emit('error', { message: 'Not authorized to send messages in this conversation' });
          }

          // Save message to database
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
            }
          );

          // Broadcast message to all users in conversation room
          io.to(String(conversationId)).emit('message:new', {
            _id: message._id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            text: message.text,
            seen: message.seen,
            createdAt: message.createdAt
          });

          console.log(`Message sent in conversation ${conversationId}`);
        } catch (err) {
          console.error('sendMessage error:', err);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      /**
       * Send typing indicator
       * Notifies other users that this user is typing
       */
      socket.on('typing', async (data) => {
        try {
          const { conversationId, isTyping } = data;
          const userId = socket.userId;

          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return;
          }

          // Verify user is member before broadcasting
          const conversation = await Conversation.findById(conversationId);
          if (!conversation || !conversation.members.includes(userId)) {
            return;
          }

          // Broadcast typing status to all in room except sender
          socket.to(String(conversationId)).emit('userTyping', {
            conversationId,
            userId,
            isTyping
          });
        } catch (err) {
          console.error('typing error:', err);
        }
      });

      /**
       * Mark messages as read
       */
      socket.on('markAsRead', async (data) => {
        try {
          const { conversationId } = data;
          const userId = socket.userId;

          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return;
          }

          // Verify user is member of conversation
          const conversation = await Conversation.findById(conversationId);
          if (!conversation || !conversation.members.includes(userId)) {
            return;
          }

          // Mark messages as read
          await Message.updateMany(
            {
              conversationId,
              seen: false,
              senderId: { $ne: userId }
            },
            { seen: true }
          );

          // Notify others that messages were read
          io.to(String(conversationId)).emit('messagesRead', { conversationId, userId });
        } catch (err) {
          console.error('markAsRead error:', err);
        }
      });

      /**
       * Handle disconnection
       * Remove user from online list
       */
      socket.on('disconnect', () => {
        try {
          const userId = socket.userId;
          
          if (userId) {
            online.delete(String(userId));
            userRooms.delete(String(userId));
            
            // Broadcast updated online users
            io.emit('onlineUsers', Array.from(online.keys()));
            
            console.log(`User ${userId} disconnected`);
          }
        } catch (err) {
          console.error('disconnect error:', err);
        }
      });

      /**
       * Handle connection errors
       */
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    } catch (err) {
      console.error('Connection handler error:', err);
      socket.disconnect(true);
    }
  });
};
