const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { name, username, email, password, phone } = req.body;
    if (!name || !username || !email || !password) return res.status(400).json({ msg: 'Missing fields' });

    // Check duplicates individually so frontend can show precise errors
    let existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ msg: 'Email already in use', field: 'email' });

    existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ msg: 'Username already taken', field: 'username' });

    if (phone) {
      existing = await User.findOne({ phone });
      if (existing) return res.status(409).json({ msg: 'Phone number already linked to another account', field: 'phone' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    user = new User({ name, username, email, password: hashed, phone });
    await user.save();
    await notificationController.notifyNewUserProfilePrompt(user._id);
    
    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location: user.location,
        locationName: user.locationName,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto,
        skills: user.skills || [],
        rating: user.rating,
        verified: user.verified,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) return res.status(400).json({ msg: 'Missing fields' });

    const user = await User.findOne({ $or: [{ email: emailOrUsername }, { username: emailOrUsername }] });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location: user.location,
        locationName: user.locationName,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto,
        skills: user.skills || [],
        rating: user.rating,
        verified: user.verified,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
