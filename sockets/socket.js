const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = (io) => {
  const online = new Map();
  const userRooms = new Map();

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token provided'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      if (!decoded.userId) return next(new Error('Invalid token format'));

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
      if (socket.userId) {
        online.set(String(socket.userId), socket.id);
        userRooms.set(String(socket.userId), new Set());

        console.log(`👤 User ${socket.userId} connected`);
        io.emit('onlineUsers', Array.from(online.keys()));
        io.emit('user:online', { userId: String(socket.userId) });
      }

      /**
       * Join personal user room — called by Flutter client on connect.
       * This is the key room used for delivering notifications when the
       * user is not inside a conversation screen.
       */
      socket.on('user:join', (data) => {
        try {
          const { userId } = data;
          if (!userId || userId !== socket.userId) {
            console.log(`⚠️ user:join rejected — userId mismatch`);
            return;
          }
          socket.join(String(userId));
          console.log(`🏠 User ${userId} joined personal room`);
        } catch (err) {
          console.error('user:join error:', err);
        }
      });

      /**
       * Join conversation room
       */
      socket.on('joinConversation', async (data) => {
        try {
          const { conversationId } = data;
          const userId = socket.userId;

          console.log(`🚪 joinConversation event received`);
          console.log(`   conversationId: ${conversationId}`);
          console.log(`   userId: ${userId}`);

          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            console.log('❌ Invalid conversation ID');
            return socket.emit('error', { message: 'Invalid conversation ID' });
          }

          const conversation = await Conversation.findById(conversationId);
          if (!conversation) {
            console.log('❌ Conversation not found');
            return socket.emit('error', { message: 'Conversation not found' });
          }

          if (!conversation.members.includes(userId)) {
            console.log('❌ User not authorized to join this conversation');
            return socket.emit('error', { message: 'Not authorized to join this conversation' });
          }

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
          if (rooms) rooms.delete(String(conversationId));

          console.log(`User ${userId} left conversation ${conversationId}`);
          socket.emit('leftConversation', { conversationId });
        } catch (err) {
          console.error('leaveConversation error:', err);
        }
      });

      /**
       * Send message via WebSocket
       */
      socket.on('sendMessage', async (data) => {
        try {
          const { conversationId, text } = data;
          const senderId = socket.userId;

          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return socket.emit('error', { message: 'Invalid conversation ID' });
          }

          if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return socket.emit('error', { message: 'Message cannot be empty' });
          }

          if (text.length > 5000) {
            return socket.emit('error', { message: 'Message too long' });
          }

          const conversation = await Conversation.findById(conversationId);
          if (!conversation) {
            return socket.emit('error', { message: 'Conversation not found' });
          }

          if (!conversation.members.includes(senderId)) {
            return socket.emit('error', { message: 'Not authorized to send messages in this conversation' });
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
            { lastMessage: message._id, updatedAt: new Date() }
          );

          const messageData = {
            _id: message._id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            text: message.text,
            seen: message.seen,
            createdAt: message.createdAt
          };

          // Emit to conversation room (users currently in chat screen)
          io.to(String(conversationId)).emit('message:new', messageData);

          // Also emit to each member's personal user room so they get
          // notified even when not in the conversation screen
          conversation.members.forEach(memberId => {
            const memberIdStr = memberId.toString();
            if (memberIdStr !== String(senderId)) {
              io.to(memberIdStr).emit('message:new', messageData);
              console.log(`📡 Notified member ${memberIdStr} via personal room`);
            }
          });

          console.log(`Message sent in conversation ${conversationId}`);
        } catch (err) {
          console.error('sendMessage error:', err);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      /**
       * Typing indicator
       */
      socket.on('typing', async (data) => {
        try {
          const { conversationId, isTyping } = data;
          const userId = socket.userId;

          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) return;

          const conversation = await Conversation.findById(conversationId);
          if (!conversation || !conversation.members.includes(userId)) return;

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
       * Get presence status for a list of users
       */
      socket.on('get_presence', (data) => {
        try {
          const { userIds } = data;
          if (!Array.isArray(userIds)) return;

          console.log(`📡 get_presence request for users: ${userIds.join(', ')}`);
          userIds.forEach((userId) => {
            if (online.has(String(userId))) {
              socket.emit('user:online', { userId: String(userId) });
              console.log(`   ✅ User ${userId} is online`);
            }
          });
        } catch (err) {
          console.error('get_presence error:', err);
        }
      });

      /**
       * Mark messages as read
       */
      socket.on('markAsRead', async (data) => {
        try {
          const { conversationId } = data;
          const userId = socket.userId;

          if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) return;

          const conversation = await Conversation.findById(conversationId);
          if (!conversation || !conversation.members.includes(userId)) return;

          await Message.updateMany(
            { conversationId, seen: false, senderId: { $ne: userId } },
            { seen: true }
          );

          io.to(String(conversationId)).emit('messagesRead', { conversationId, userId });
        } catch (err) {
          console.error('markAsRead error:', err);
        }
      });

      /**
       * Disconnect
       */
      socket.on('disconnect', () => {
        try {
          const userId = socket.userId;
          if (userId) {
            online.delete(String(userId));
            userRooms.delete(String(userId));
            io.emit('onlineUsers', Array.from(online.keys()));
            io.emit('user:offline', { userId: String(userId) });
            console.log(`User ${userId} disconnected`);
          }
        } catch (err) {
          console.error('disconnect error:', err);
        }
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });

    } catch (err) {
      console.error('Connection handler error:', err);
      socket.disconnect(true);
    }
  });
};