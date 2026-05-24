const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/authMiddleware');

router.get('/:id', auth, userController.getUser);
router.put('/profile', auth, userController.updateProfile);
router.put('/:id', auth, userController.updateUser);

module.exports = router;
