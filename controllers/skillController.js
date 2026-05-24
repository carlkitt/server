const User = require('../models/User');

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
