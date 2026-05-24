const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, postController.createPost);
router.get('/', postController.listPosts);
router.get('/:id', postController.getPost);
router.get('/:id/comments', postController.getComments);

// Like/Unlike
router.post('/:id/like', auth, postController.likePost);
router.delete('/:id/like', auth, postController.unlikePost);

// Comments
router.post('/:id/comment', auth, postController.commentOnPost);
router.put('/:id/comments/:commentId', auth, postController.editComment);
router.delete('/:id/comments/:commentId', auth, postController.deleteComment);

// Share
router.post('/:id/share', auth, postController.sharePost);

module.exports = router;
