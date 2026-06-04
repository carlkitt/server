const express = require('express');
const { searchSkills, getAllSkills, getTrendingSkills } = require('../controllers/skillController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes (don't require auth)
router.get('/trending', getTrendingSkills);
router.get('/search', searchSkills);
router.get('/', getAllSkills);

module.exports = router;
