const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, postController.createPost);
router.get('/', postController.listPosts);
router.get('/:id', postController.getPost);

// Like/Unlike
router.post('/:id/like', auth, postController.likePost);
router.delete('/:id/like', auth, postController.unlikePost);

// Comments
router.post('/:id/comment', auth, postController.commentOnPost);

// Share
router.post('/:id/share', auth, postController.sharePost);

module.exports = router;
