const User = require('../models/User');
const Post = require('../models/Post');

// Search skills by query (case-insensitive)
exports.searchSkills = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(200).json([]);
    }

    // Search in all users' skills array using regex (case-insensitive)
    const regex = new RegExp(q, 'i');
    const users = await User.find({ skills: { $regex: regex } }).select('skills');
    
    // Extract unique skills that match the query
    const skills = new Set();
    users.forEach(user => {
      user.skills.forEach(skill => {
        if (regex.test(skill)) {
          skills.add(skill);
        }
      });
    });

    const uniqueSkills = Array.from(skills).sort();
    res.status(200).json(uniqueSkills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Get all unique skills from all users
exports.getAllSkills = async (req, res) => {
  try {
    const users = await User.find().select('skills');
    const skills = new Set();
    
    users.forEach(user => {
      user.skills.forEach(skill => {
        skills.add(skill);
      });
    });

    const uniqueSkills = Array.from(skills).sort();
    res.status(200).json(uniqueSkills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Get trending skills (sorted by number of posts)
exports.getTrendingSkills = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    // Aggregate posts by skills to count posts per skill
    const trendingSkills = await Post.aggregate([
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { skill: '$_id', postCount: '$count', _id: 0 } },
    ]);

    res.status(200).json(trendingSkills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
