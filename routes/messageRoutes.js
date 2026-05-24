const express = require('express');
const router = express.Router();
const { 
  getConversations, 
  getMessages, 
  sendMessage,
  getOrCreateConversation,
  markMessagesSeen 
} = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');

// All routes require authentication
router.use(authMiddleware);

/**
 * Search users for starting new conversations
 * Returns list of users matching query
 * GET /api/messages/search?q=query
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.userId;

    // Validate query
    if (!q || q.trim().length < 2 || q.length > 100) {
      return res.status(400).json({ message: 'Invalid search query' });
    }

    // Search users by name or username (excluding current user)
    const users = await User.find({
      $and: [
        { _id: { $ne: userId } },
        { $or: [
          { name: { $regex: q, $options: 'i' } },
          { username: { $regex: q, $options: 'i' } }
        ]}
      ]
    })
    .select('_id name username profilePicture')
    .limit(20)
    .lean();

    res.status(200).json(users);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ message: 'Search failed' });
  }
});

// Get all conversations for current user
router.get('/conversations', getConversations);

// Get or create conversation with another user
router.post('/conversations', getOrCreateConversation);

// Get all messages in a conversation
router.get('/conversations/:conversationId', getMessages);

// Send a message
router.post('/send', sendMessage);

// Mark messages as seen
router.put('/seen', markMessagesSeen);

module.exports = router;
