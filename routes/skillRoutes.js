const express = require('express');
const { searchSkills, getAllSkills } = require('../controllers/skillController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes (don't require auth)
router.get('/search', searchSkills);
router.get('/', getAllSkills);

module.exports = router;
