const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const { Readable } = require('stream');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Specific routes first (before /:id)
router.get('/me', auth, userController.getMe);
router.put('/profile', auth, userController.updateProfile);
router.post('/upload-avatar', auth, upload.single('avatar'), userController.uploadAvatar);
router.post('/upload-cover', auth, upload.single('coverPhoto'), userController.uploadCoverPhoto);

// User ID parameter routes
router.post('/:id/follow', auth, userController.followUser);
router.post('/:id/unfollow', auth, userController.unfollowUser);
router.get('/:id/is-following', auth, userController.isFollowing);

// Generic ID routes last
router.get('/:id', auth, userController.getUser);
router.put('/:id', auth, userController.updateUser);

module.exports = router;

