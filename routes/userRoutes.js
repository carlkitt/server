const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const { Readable } = require('stream');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

router.get('/:id', auth, userController.getUser);
router.put('/profile', auth, userController.updateProfile);
router.put('/:id', auth, userController.updateUser);
router.post('/upload-avatar', auth, upload.single('avatar'), userController.uploadAvatar);
router.post('/upload-cover', auth, upload.single('coverPhoto'), userController.uploadCoverPhoto);
router.get('/search', userController.searchUsers);

module.exports = router;
