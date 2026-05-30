const jwt = require('jsonwebtoken');

// Track active calls: callId -> { caller, callee, status, type }
const activeCalls = new Map();
// Track user sockets: userId -> socketId
const userSockets = new Map();

module.exports = (io) => {
  // Middleware to authenticate socket connections
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Auth failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`📞 Call server: user ${userId} connected (${socket.id})`);
    
    // Register user socket
    userSockets.set(userId, socket.id);
    socket.join(`user:${userId}`);

    // ── Initiate call ──────────────────────────────────────────────────────────
    socket.on('call:initiate', (data) => {
      const { calleeId, callType, callerName, callerAvatar, offer } = data;
      const callId = `call_${Date.now()}_${userId}`;
      
      console.log(`📞 ${userId} calling ${calleeId} (${callType})`);
      
      activeCalls.set(callId, {
        callId,
        callerId: userId,
        calleeId,
        callType,
        status: 'ringing',
        startedAt: new Date()
      });

      // Send call notification through notification channel (not call:incoming socket event)
      // This way it will trigger a system notification on the receiver's phone
      console.log(`📤 Sending call notification to: ${calleeId}`);
      io.to(calleeId).emit('call:notification', {
        type: 'incoming_call',
        callId,
        callerId: userId,
        callerName,
        callerAvatar,
        callType,
        offer
      });

      // Confirm to caller
      socket.emit('call:initiated', { callId });
    });

    // ── Answer call ────────────────────────────────────────────────────────────
    socket.on('call:answer', (data) => {
      const { callId, answer } = data;
      const call = activeCalls.get(callId);
      if (!call) return;

      call.status = 'active';
      console.log(`✅ Call ${callId} answered`);
      console.log(`📤 Sending answer to caller: ${call.callerId}`);

      // Send answer with the actual answer data, not just a string
      io.to(call.callerId).emit('call:answered', { callId, answer });
    });

    // ── Reject call ────────────────────────────────────────────────────────────
    socket.on('call:reject', (data) => {
      const { callId, reason } = data;
      const call = activeCalls.get(callId);
      if (!call) return;

      console.log(`❌ Call ${callId} rejected`);
      activeCalls.delete(callId);

      io.to(call.callerId).emit('call:rejected', { callId, reason: reason || 'declined' });
    });

    // ── End call ───────────────────────────────────────────────────────────────
    socket.on('call:end', (data) => {
      const { callId } = data;
      const call = activeCalls.get(callId);
      if (!call) return;

      console.log(`📴 Call ${callId} ended`);
      activeCalls.delete(callId);

      // Notify both parties
      io.to(call.callerId).emit('call:ended', { callId });
      io.to(call.calleeId).emit('call:ended', { callId });
    });

    // ── ICE candidate exchange ─────────────────────────────────────────────────
    socket.on('call:ice-candidate', (data) => {
      const { callId, candidate, targetUserId } = data;
      console.log(`🧊 Forwarding ICE candidate for call ${callId} to ${targetUserId}`);
      io.to(targetUserId).emit('call:ice-candidate', {
        callId,
        candidate,
        fromUserId: userId
      });
    });

    // ── Caller cancels before answer ───────────────────────────────────────────
    socket.on('call:cancel', (data) => {
      const { callId } = data;
      const call = activeCalls.get(callId);
      if (!call) return;

      activeCalls.delete(callId);
      io.to(call.calleeId).emit('call:cancelled', { callId });
      console.log(`🚫 Call ${callId} cancelled by caller`);
    });

    socket.on('disconnect', () => {
      userSockets.delete(userId);
      console.log(`📞 Call server: user ${userId} disconnected`);
      
      // End any active calls for this user
      for (const [callId, call] of activeCalls.entries()) {
        if (call.callerId === userId || call.calleeId === userId) {
          const otherId = call.callerId === userId ? call.calleeId : call.callerId;
          io.to(otherId).emit('call:ended', { callId, reason: 'disconnected' });
          activeCalls.delete(callId);
        }
      }
    });
  });
};
